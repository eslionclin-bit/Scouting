/**
 * Opstellingen en wissels.
 *
 * Per set wordt alleen de startopstelling vastgelegd; de rotatiestand van elke
 * rally volgt uit de gewonnen rally's (zie `domain/rotation.ts`). Een wissel
 * geldt vanaf de rally waarin hij wordt ingevoerd.
 */

import { emptyPositions, playersOnCourt, positionsAt } from '../../domain/rotation';
import { MAX_SUBSTITUTIONS_PER_SET } from '../../domain/scoring';
import type { Lineup, Rally, Substitution, TeamSide, Zone } from '../../domain/types';
import { buildRecord, commit, reviseRecord, type WriteContext } from '../mutations';
import { alive, isAlive, NotFoundError, ValidationError } from './base';

export interface LineupInput {
  setId: string;
  positions: Record<Zone, string | null>;
  team?: TeamSide;
  /** De libero staat niet in de zes; hij vervangt een achterspeler. */
  liberoId?: string | null;
  /** Voor wie de libero erin komt; leeg laten betekent 'reken het zelf uit'. */
  liberoForId?: string | null;
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
        ? reviseRecord(this.ctx, existing, {
            positions: input.positions,
            liberoId: input.liberoId ?? existing.liberoId ?? null,
            // Bewust wél overschrijfbaar met null: 'zelf uitrekenen' terugzetten
            // moet kunnen, anders zit een eenmalige keuze er voorgoed in.
            liberoForId:
              input.liberoForId !== undefined ? input.liberoForId : (existing.liberoForId ?? null),
          })
        : buildRecord(this.ctx, 'lineups', {
            matchId: set.matchId,
            setId: set.id,
            team,
            positions: input.positions,
            liberoId: input.liberoId ?? null,
            liberoForId: input.liberoForId ?? null,
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

      // Wisselen mag alleen als de bal dood is. Staat er al iets in deze rally,
      // dan is hij bezig, en dan hoort de wissel bij de volgende — anders zou
      // hij met terugwerkende kracht gelden voor ballen die de invalster niet
      // gespeeld heeft.
      const played = alive(await this.ctx.db.getAllFromIndex('actions', 'by_rally', rally.id));
      if (rally.wonBy === null && played.length > 0) {
        throw new ValidationError('Wisselen kan alleen tussen de rally\u2019s door.', [
          {
            code: 'rally_in_progress',
            message: 'Deze rally is bezig. Rond hem af en wissel dan.',
          },
        ]);
      }

      const team = input.team ?? 'us';

      // Iemand kan niet twee keer in het veld staan. Dit ging mis bij de libero:
      // wie haar met de hand inwisselt voor de ene middenspeelster, terwijl de
      // app haar ook al voor de andere invalt, ziet dezelfde speelster in twee
      // vakken. De vraag hoort niet 'wat doen we daarmee' te zijn maar 'dat kan
      // niet' — dus wordt hij hier tegengehouden.
      const onCourt = await this.positionsFor(rally, team);
      if (onCourt.includes(input.playerInId)) {
        throw new ValidationError('Die speelster staat al in het veld.', [
          {
            code: 'already_on_court',
            message: 'Iemand kan niet twee keer tegelijk in het veld staan.',
          },
        ]);
      }
      if (onCourt.length > 0 && !onCourt.includes(input.playerOutId)) {
        throw new ValidationError('Die speelster staat niet in het veld.', [
          { code: 'not_on_court', message: 'Kies iemand die er nu in staat om te wisselen.' },
        ]);
      }

      // Zes wissels per set is de regel; de app laat het er niet stilletjes
      // zeven worden.
      const used = (await this.listBySet(rally.setId)).filter(
        (substitution) => substitution.team === team,
      ).length;
      if (used >= MAX_SUBSTITUTIONS_PER_SET) {
        throw new ValidationError(
          `Het maximum van ${MAX_SUBSTITUTIONS_PER_SET} wissels in deze set is bereikt.`,
          [{ code: 'substitution_limit', message: 'Geen wissels meer beschikbaar in deze set.' }],
        );
      }

      const record = buildRecord(this.ctx, 'substitutions', {
        matchId: rally.matchId,
        setId: rally.setId,
        rallyId: rally.id,
        team,
        playerOutId: input.playerOutId,
        playerInId: input.playerInId,
      });
      await commit(this.ctx, [{ entity: 'substitutions', record }]);
      return record;
    });
  }

  /** Wie er bij deze rally in het veld staan; leeg als er geen opstelling is. */
  private async positionsFor(rally: Rally, team: TeamSide): Promise<string[]> {
    const lineups = alive(await this.ctx.db.getAllFromIndex('lineups', 'by_set', rally.setId));
    const lineup = lineups.find((entry) => entry.team === team);
    if (!lineup) return [];
    const substitutions = (await this.listBySet(rally.setId)).filter(
      (substitution) => substitution.team === team,
    );
    const rotation = (team === 'us' ? rally.rotationUs : rally.rotationThem) ?? 1;
    return playersOnCourt(positionsAt(lineup, rotation, substitutions));
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
