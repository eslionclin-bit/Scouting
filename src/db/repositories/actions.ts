/**
 * Acties: de kleinste eenheid in het model, en de enige die tijdens een
 * wedstrijd in hoog tempo wordt aangemaakt.
 *
 * Acties zijn onveranderlijk zodra ze staan: corrigeren doe je met undo
 * (tombstone) en opnieuw invoeren. Dat maakt de sync tussen apparaten triviaal —
 * append-only records kunnen niet met elkaar in conflict komen.
 */

import {
  hasBlockingIssue,
  validateAction,
  type ActionDraft,
  type ValidateActionContext,
  type ValidationIssue,
} from '../../domain/rules';
import type { Action, Zone } from '../../domain/types';
import { buildRecord, commit, reviseRecord, type WriteContext } from '../mutations';
import { alive, bySequence, isAlive, nextSequence, NotFoundError, ValidationError } from './base';
import type { PlayerRepository } from './players';
import type { RallyRepository } from './rallies';

export interface AppendActionInput extends ActionDraft {
  rallyId: string;
}

export interface AppendActionResult {
  action: Action;
  /** Afwijkingen van het protocol die de invoerder mag zien maar niet blokkeren. */
  warnings: ValidationIssue[];
}

export class ActionRepository {
  constructor(
    private readonly ctx: WriteContext,
    private readonly rallies: RallyRepository,
    private readonly players: PlayerRepository,
  ) {}

  async append(
    input: AppendActionInput,
    options: ValidateActionContext = {},
  ): Promise<AppendActionResult> {
    // Vergrendeld omdat het volgnummer uit de al opgeslagen acties komt: twee
    // tikken vlak na elkaar mogen niet allebei nummer 3 krijgen.
    return this.ctx.lock.run(() => this.appendUnlocked(input, options));
  }

  private async appendUnlocked(
    input: AppendActionInput,
    options: ValidateActionContext,
  ): Promise<AppendActionResult> {
    const rally = await this.rallies.require(input.rallyId);
    if (rally.wonBy !== null) {
      throw new ValidationError('Deze rally is al afgerond.', [
        { code: 'rally_closed', message: 'Heropen de rally om nog een actie toe te voegen.' },
      ]);
    }

    const previousActions = await this.listByRally(input.rallyId);
    const issues = validateAction(input, { ...options, previousActions });
    if (hasBlockingIssue(issues)) {
      const blocking = issues.filter((issue) => issue.severity === 'error');
      throw new ValidationError(blocking[0]?.message ?? 'Ongeldige actie.', blocking);
    }

    const record = buildRecord(this.ctx, 'actions', {
      matchId: rally.matchId,
      setId: rally.setId,
      rallyId: rally.id,
      sequence: nextSequence(previousActions),
      team: input.team,
      playerId: input.playerId ?? null,
      playerNumber: await this.resolvePlayerNumber(input),
      type: input.type,
      zoneFrom: (input.zoneFrom ?? null) as Zone | null,
      zoneTo: (input.zoneTo ?? null) as Zone | null,
      quality: input.quality,
      videoTimestampMs: input.videoTimestampMs ?? null,
    });

    await commit(this.ctx, [{ entity: 'actions', record }]);
    return { action: record, warnings: issues.filter((issue) => issue.severity === 'warning') };
  }

  async get(id: string): Promise<Action | undefined> {
    const record = await this.ctx.db.get('actions', id);
    return isAlive(record) ? record : undefined;
  }

  async require(id: string): Promise<Action> {
    const action = await this.get(id);
    if (!action) throw new NotFoundError('Actie', id);
    return action;
  }

  /** De rally-keten zoals hij bovenin het invoerscherm staat. */
  async listByRally(rallyId: string): Promise<Action[]> {
    return alive(await this.ctx.db.getAllFromIndex('actions', 'by_rally', rallyId)).sort(bySequence);
  }

  async listBySet(setId: string): Promise<Action[]> {
    return alive(await this.ctx.db.getAllFromIndex('actions', 'by_set', setId));
  }

  async listByMatch(matchId: string): Promise<Action[]> {
    return alive(await this.ctx.db.getAllFromIndex('actions', 'by_match', matchId));
  }

  async listByPlayer(playerId: string): Promise<Action[]> {
    return alive(await this.ctx.db.getAllFromIndex('actions', 'by_player', playerId));
  }

  /** Undo per actie: haalt de laatst ingevoerde actie uit de rally. */
  async undoLast(rallyId: string): Promise<Action | undefined> {
    return this.ctx.lock.run(async () => {
      const actions = await this.listByRally(rallyId);
      const last = actions.at(-1);
      if (!last) return undefined;
      await this.tombstone(last);
      return last;
    });
  }

  /**
   * Een actie die er al staat rechtzetten.
   *
   * Acties zijn verder append-only, en dat blijft de regel: tijdens het invoeren
   * corrigeer je met undo. Maar een fout die je drie rally's later ontdekt, is
   * anders niet meer te herstellen zonder alles ertussen weg te gooien — en dat
   * is precies wat een invoerder in een sporthal niet gaat doen.
   *
   * Wat hier bewust níét gebeurt: de stand herrekenen. Verandert een correctie
   * de uitslag van een rally, dan zegt het scherm dat erbij en corrigeert de
   * invoerder de stand zelf. Stilzwijgend de score verschuiven is erger dan een
   * cijfer dat niet klopt.
   */
  async revise(
    id: string,
    patch: Pick<Partial<Action>, 'quality' | 'playerId' | 'zoneFrom' | 'zoneTo' | 'type'>,
  ): Promise<Action> {
    return this.ctx.lock.run(async () => {
      const current = await this.require(id);
      const playerId = patch.playerId === undefined ? current.playerId : patch.playerId;
      const playerNumber =
        patch.playerId === undefined
          ? current.playerNumber
          : await this.resolvePlayerNumber({ playerId });

      const record = reviseRecord(this.ctx, current, { ...patch, playerId, playerNumber });
      await commit(this.ctx, [{ entity: 'actions', record }]);
      return record;
    });
  }

  async remove(id: string): Promise<void> {
    await this.ctx.lock.run(async () => {
      await this.tombstone(await this.require(id));
    });
  }

  private async tombstone(action: Action): Promise<void> {
    const record = reviseRecord(this.ctx, action, { deletedAt: this.ctx.now().toISOString() });
    await commit(this.ctx, [{ entity: 'actions', record }]);
  }

  /**
   * Het rugnummer wordt bij de actie bewaard, niet alleen de speler-id: zo blijft
   * een export leesbaar en klopt de historie ook als een speler later van
   * rugnummer wisselt.
   */
  private async resolvePlayerNumber(
    input: Pick<AppendActionInput, 'playerId'> & { playerNumber?: number | null },
  ): Promise<number | null> {
    if (input.playerNumber != null) return input.playerNumber;
    if (!input.playerId) return null;
    const player = await this.players.get(input.playerId);
    return player?.number ?? null;
  }
}
