/**
 * Rally's: de keten van acties tussen twee opslagen.
 *
 * Undo per rally is een harde eis uit de projectbrief; die zit hier als
 * `remove()`, dat de rally én zijn acties in één transactie wegzet en de
 * setstand meteen herberekent.
 */

import { rotationForNextRally } from '../../domain/rotation';
import { rallyOutcomeFor, validateRallyCompletion, type ValidationIssue } from '../../domain/rules';
import type { Rally, TeamSide } from '../../domain/types';
import { buildRecord, commit, reviseRecord, type WriteContext, type WriteOp } from '../mutations';
import { alive, bySequence, isAlive, nextSequence, NotFoundError, ValidationError } from './base';
import type { SetRepository } from './sets';

export interface StartRallyInput {
  setId: string;
  servingTeam?: TeamSide;
  rotationUs?: number | null;
}

export interface MissedPointInput {
  setId: string;
  /** Wie het punt kreeg. */
  wonBy: TeamSide;
}

export interface CompleteRallyResult {
  rally: Rally;
  warnings: ValidationIssue[];
}

export class RallyRepository {
  constructor(
    private readonly ctx: WriteContext,
    private readonly sets: SetRepository,
  ) {}

  /**
   * Start een nieuwe rally. Staat er al een rally open in deze set, dan wordt die
   * teruggegeven: tijdens live invoer mag een dubbele tik nooit een lege rally
   * achterlaten.
   */
  async start(input: StartRallyInput): Promise<Rally> {
    return this.ctx.lock.run(() => this.startUnlocked(input));
  }

  private async startUnlocked(input: StartRallyInput): Promise<Rally> {
    const set = await this.sets.require(input.setId);
    const rallies = await this.listBySet(input.setId);

    const open = rallies.find((rally) => rally.wonBy === null);
    if (open) return open;

    const lastCompleted = rallies.filter((rally) => rally.wonBy !== null).at(-1);
    // Zolang de beginservice onbekend is, gaan we uit van onszelf; de invoerder
    // legt hem vast voordat de eerste rally begint.
    const servingTeam = input.servingTeam ?? lastCompleted?.wonBy ?? set.startingServe ?? 'us';

    const record = buildRecord(this.ctx, 'rallies', {
      matchId: set.matchId,
      setId: set.id,
      sequence: nextSequence(rallies),
      servingTeam,
      wonBy: null,
      pointsUsAfter: null,
      pointsThemAfter: null,
      // De rotatiestand volgt uit de al gespeelde rally's, dus die hoeft niemand
      // bij te houden: één systeem in plaats van rotatie op papier ernaast.
      rotationUs:
        input.rotationUs ?? rotationForNextRally(rallies, set.startingServe ?? 'us', 'us'),
      // Hun rotatie telt op precies dezelfde manier door. Bijhouden hoeft
      // niemand: het volgt uit de rally's die er al staan.
      rotationThem: rotationForNextRally(rallies, set.startingServe ?? 'us', 'them'),
      scouted: true,
    });
    await commit(this.ctx, [{ entity: 'rallies', record }]);
    return record;
  }

  /**
   * Een punt dat niet is ingevoerd alsnog meetellen. Het levert een rally op
   * zonder acties, herkenbaar als 'niet ingevoerd', zodat stand én rotatie weer
   * kloppen met wat er op het scorebord staat.
   */
  async addMissedPoint(input: MissedPointInput): Promise<Rally> {
    return this.ctx.lock.run(async () => {
      const set = await this.sets.require(input.setId);
      const rallies = await this.listBySet(input.setId);

      // Staat er een lege rally open, dan wordt dat deze; anders komt er een bij.
      const open = rallies.find((rally) => rally.wonBy === null);
      const actions = open
        ? alive(await this.ctx.db.getAllFromIndex('actions', 'by_rally', open.id))
        : [];

      const base =
        open && actions.length === 0
          ? open
          : buildRecord(this.ctx, 'rallies', {
              matchId: set.matchId,
              setId: set.id,
              sequence: nextSequence(rallies),
              servingTeam:
                rallies.filter((rally) => rally.wonBy !== null).at(-1)?.wonBy ??
                set.startingServe ??
                'us',
              wonBy: null,
              pointsUsAfter: null,
              pointsThemAfter: null,
              rotationUs: rotationForNextRally(rallies, set.startingServe ?? 'us', 'us'),
              rotationThem: rotationForNextRally(rallies, set.startingServe ?? 'us', 'them'),
              scouted: false,
            });

      const marked = reviseRecord(this.ctx, base, { scouted: false });
      const outcome = await this.applyOutcome(marked, input.wonBy);
      await commit(this.ctx, outcome.writes);
      return outcome.rally;
    });
  }

  async get(id: string): Promise<Rally | undefined> {
    const record = await this.ctx.db.get('rallies', id);
    return isAlive(record) ? record : undefined;
  }

  async require(id: string): Promise<Rally> {
    const rally = await this.get(id);
    if (!rally) throw new NotFoundError('Rally', id);
    return rally;
  }

  async listBySet(setId: string): Promise<Rally[]> {
    return alive(await this.ctx.db.getAllFromIndex('rallies', 'by_set', setId)).sort(bySequence);
  }

  async listByMatch(matchId: string): Promise<Rally[]> {
    return alive(await this.ctx.db.getAllFromIndex('rallies', 'by_match', matchId)).sort(bySequence);
  }

  /** De rally waarin op dit moment acties worden ingevoerd. */
  async open(setId: string): Promise<Rally | undefined> {
    return (await this.listBySet(setId)).find((rally) => rally.wonBy === null);
  }

  /**
   * Rondt de rally af. Zonder expliciete uitslag wordt die afgeleid uit de
   * laatste actie (fout = punt tegen, perfecte opslag/aanval/block = punt voor).
   */
  async complete(rallyId: string, wonBy?: TeamSide): Promise<CompleteRallyResult> {
    return this.ctx.lock.run(() => this.completeUnlocked(rallyId, wonBy));
  }

  private async completeUnlocked(rallyId: string, wonBy?: TeamSide): Promise<CompleteRallyResult> {
    const rally = await this.require(rallyId);
    const actions = alive(
      await this.ctx.db.getAllFromIndex('actions', 'by_rally', rallyId),
    ).sort(bySequence);

    const last = actions.at(-1);
    const outcome = wonBy ?? (last ? rallyOutcomeFor(last) : null);
    if (!outcome) {
      throw new ValidationError('Geef aan wie het punt krijgt: wij of de tegenstander.', [
        {
          code: 'outcome_required',
          message: 'De laatste actie beëindigt de rally niet; kies zelf de uitslag.',
        },
      ]);
    }

    const warnings = validateRallyCompletion({ wonBy: outcome }, actions);
    const ops = await this.applyOutcome(rally, outcome);
    await commit(this.ctx, ops.writes);
    return { rally: ops.rally, warnings };
  }

  /** Draait een afgeronde rally terug naar 'loopt nog', bijvoorbeeld na een misklik. */
  async reopen(rallyId: string): Promise<Rally> {
    return this.ctx.lock.run(() => this.reopenUnlocked(rallyId));
  }

  private async reopenUnlocked(rallyId: string): Promise<Rally> {
    const rally = await this.require(rallyId);
    const record = reviseRecord(this.ctx, rally, {
      wonBy: null,
      pointsUsAfter: null,
      pointsThemAfter: null,
    });
    const ops: WriteOp[] = [{ entity: 'rallies', record }];
    ops.push(...(await this.rescoreOps(rally.setId, record)));
    await commit(this.ctx, ops);
    return record;
  }

  /** Undo van een hele rally: rally en al zijn acties worden getombstoned. */
  async remove(rallyId: string): Promise<void> {
    return this.ctx.lock.run(() => this.removeUnlocked(rallyId));
  }

  private async removeUnlocked(rallyId: string): Promise<void> {
    const rally = await this.require(rallyId);
    const deletedAt = this.ctx.now().toISOString();
    const actions = alive(await this.ctx.db.getAllFromIndex('actions', 'by_rally', rallyId));

    const removed = reviseRecord(this.ctx, rally, { deletedAt });
    const ops: WriteOp[] = actions.map((action) => ({
      entity: 'actions' as const,
      record: reviseRecord(this.ctx, action, { deletedAt }),
    }));
    ops.push({ entity: 'rallies', record: removed });
    ops.push(...(await this.rescoreOps(rally.setId, removed)));

    await commit(this.ctx, ops);
  }

  private async applyOutcome(
    rally: Rally,
    outcome: TeamSide,
  ): Promise<{ rally: Rally; writes: WriteOp[] }> {
    const provisional = reviseRecord(this.ctx, rally, {
      wonBy: outcome,
      pointsUsAfter: null,
      pointsThemAfter: null,
    });
    const rallies = await this.projectedRallies(rally.setId, provisional);

    // Loop de set één keer door zodat elke rally de stand ná die rally kent;
    // dat is precies wat het overzicht en de export nodig hebben.
    let pointsUs = 0;
    let pointsThem = 0;
    let updated = provisional;
    for (const item of rallies) {
      if (item.wonBy === 'us') pointsUs++;
      else if (item.wonBy === 'them') pointsThem++;
      if (item.id === rally.id) {
        updated = { ...provisional, pointsUsAfter: pointsUs, pointsThemAfter: pointsThem };
      }
    }

    const writes: WriteOp[] = [{ entity: 'rallies', record: updated }];
    const scoreOp = await this.sets.scoreUpdateOp(rally.setId, { pointsUs, pointsThem });
    if (scoreOp) writes.push(scoreOp);
    return { rally: updated, writes };
  }

  /** Herberekent de setstand alsof `changed` al opgeslagen is. */
  private async rescoreOps(setId: string, changed: Rally): Promise<WriteOp[]> {
    const rallies = await this.projectedRallies(setId, changed);
    let pointsUs = 0;
    let pointsThem = 0;
    for (const rally of rallies) {
      if (rally.wonBy === 'us') pointsUs++;
      else if (rally.wonBy === 'them') pointsThem++;
    }
    const scoreOp = await this.sets.scoreUpdateOp(setId, { pointsUs, pointsThem });
    return scoreOp ? [scoreOp] : [];
  }

  private async projectedRallies(setId: string, changed: Rally): Promise<Rally[]> {
    const stored = await this.listBySet(setId);
    const projected = stored.map((rally) => (rally.id === changed.id ? changed : rally));
    if (!projected.some((rally) => rally.id === changed.id)) projected.push(changed);
    return projected.filter((rally) => rally.deletedAt === null).sort(bySequence);
  }
}
