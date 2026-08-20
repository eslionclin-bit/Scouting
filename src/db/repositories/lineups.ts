/**
 * Opstellingen en wissels.
 *
 * Per set wordt alleen de startopstelling vastgelegd; de rotatiestand van elke
 * rally volgt uit de gewonnen rally's (zie `domain/rotation.ts`). Een wissel
 * geldt vanaf de rally waarin hij wordt ingevoerd.
 */

import { emptyPositions, positionsAt } from '../../domain/rotation';
import type { Lineup, Substitution, TeamSide, Zone } from '../../domain/types';
import { buildRecord, commit, reviseRecord, type WriteContext } from '../mutations';
import { alive, isAlive, NotFoundError, ValidationError } from './base';

export interface LineupInput {
  setId: string;
  positions: Record<Zone, string | null>;
  team?: TeamSide;
}

export class LineupRepository {
  constructor(private readonly ctx: WriteContext) {}

  /** Zet of vervangt de startopstelling van een set. */
  async set(input: LineupInput): Promise<Lineup> {
    return this.ctx.lock.run(async () => {
      const team = input.team ?? 'us';
      assertNoDuplicates(input.positions);

      const set = await this.ctx.db.get('sets', input.setId);
      if (!isAlive(set)) throw new NotFoundError('Set', input.setId);

      const existing = await this.forSet(input.setId, team);
      const record = existing
        ? reviseRecord(this.ctx, existing, { positions: input.positions })
        : buildRecord(this.ctx, 'lineups', {
            matchId: set.matchId,
            setId: set.id,
            team,
            positions: input.positions,
          });

      await commit(this.ctx, [{ entity: 'lineups', record }]);
      return record;
    });
  }

  async forSet(setId: string, team: TeamSide = 'us'): Promise<Lineup | undefined> {
    const records = alive(await this.ctx.db.getAllFromIndex('lineups', 'by_set', setId));
    return records.find((lineup) => lineup.team === team);
  }

  async listByMatch(matchId: string): Promise<Lineup[]> {
    return alive(await this.ctx.db.getAllFromIndex('lineups', 'by_match', matchId));
  }

  async remove(id: string): Promise<void> {
    const current = await this.ctx.db.get('lineups', id);
    if (!isAlive(current)) throw new NotFoundError('Opstelling', id);
    const record = reviseRecord(this.ctx, current, { deletedAt: this.ctx.now().toISOString() });
    await commit(this.ctx, [{ entity: 'lineups', record }]);
  }

  /** Wie staat er op dit moment waar, inclusief de wissels tot en met deze rally. */
  async positionsForRally(
    setId: string,
    rotation: number,
    team: TeamSide = 'us',
  ): Promise<Record<Zone, string | null>> {
    const lineup = await this.forSet(setId, team);
    if (!lineup) return emptyPositions();
    const substitutions = alive(
      await this.ctx.db.getAllFromIndex('substitutions', 'by_set', setId),
    ).filter((substitution) => substitution.team === team);
    return positionsAt(lineup, rotation, substitutions);
  }
}

export interface SubstitutionInput {
  rallyId: string;
  playerOutId: string;
  playerInId: string;
  team?: TeamSide;
}

export class SubstitutionRepository {
  constructor(private readonly ctx: WriteContext) {}

  async add(input: SubstitutionInput): Promise<Substitution> {
    return this.ctx.lock.run(async () => {
      const rally = await this.ctx.db.get('rallies', input.rallyId);
      if (!isAlive(rally)) throw new NotFoundError('Rally', input.rallyId);
      if (input.playerInId === input.playerOutId) {
        throw new ValidationError('Een speler kan niet voor zichzelf invallen.', [
          { code: 'same_player', message: 'Kies twee verschillende spelers.' },
        ]);
      }

      const record = buildRecord(this.ctx, 'substitutions', {
        matchId: rally.matchId,
        setId: rally.setId,
        rallyId: rally.id,
        team: input.team ?? 'us',
        playerOutId: input.playerOutId,
        playerInId: input.playerInId,
      });
      await commit(this.ctx, [{ entity: 'substitutions', record }]);
      return record;
    });
  }

  async listBySet(setId: string): Promise<Substitution[]> {
    return alive(await this.ctx.db.getAllFromIndex('substitutions', 'by_set', setId));
  }

  async listByMatch(matchId: string): Promise<Substitution[]> {
    return alive(await this.ctx.db.getAllFromIndex('substitutions', 'by_match', matchId));
  }

  /** Undo van een wissel: dezelfde tombstone-aanpak als bij acties. */
  async remove(id: string): Promise<void> {
    const current = await this.ctx.db.get('substitutions', id);
    if (!isAlive(current)) throw new NotFoundError('Wissel', id);
    const record = reviseRecord(this.ctx, current, { deletedAt: this.ctx.now().toISOString() });
    await commit(this.ctx, [{ entity: 'substitutions', record }]);
  }
}

function assertNoDuplicates(positions: Record<Zone, string | null>): void {
  const filled = Object.values(positions).filter((id): id is string => id !== null);
  if (new Set(filled).size !== filled.length) {
    throw new ValidationError('Een speler kan maar op één plek tegelijk staan.', [
      { code: 'duplicate_position', message: 'Dezelfde speler staat twee keer in de opstelling.' },
    ]);
  }
}
