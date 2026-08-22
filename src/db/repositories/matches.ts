/** Wedstrijden. Verwijderen gebeurt cascaderend, maar altijd als tombstone. */

import type { MatchRules } from '../../domain/scoring';
import type { Match, MatchStatus } from '../../domain/types';
import { buildRecord, commit, reviseRecord, type WriteContext, type WriteOp } from '../mutations';
import { alive, isAlive, NotFoundError } from './base';

export interface MatchInput {
  date: string;
  /** Laat weg voor de standaardregels (vier sets tot 25, beslissende set tot 15). */
  rules?: MatchRules | null;
  ownTeamId: string;
  opponentTeamId: string;
  homeAway: 'home' | 'away';
  location?: string | null;
  competition?: string | null;
  status?: MatchStatus;
  notes?: string | null;
  /** Ingelezen referentiewedstrijd in plaats van een eigen wedstrijd. */
  reference?: boolean;
  source?: string | null;
}

export class MatchRepository {
  constructor(private readonly ctx: WriteContext) {}

  async create(input: MatchInput): Promise<Match> {
    const record = buildRecord(this.ctx, 'matches', {
      date: input.date,
      rules: input.rules ?? null,
      ownTeamId: input.ownTeamId,
      opponentTeamId: input.opponentTeamId,
      homeAway: input.homeAway,
      location: input.location ?? null,
      competition: input.competition ?? null,
      status: input.status ?? 'planned',
      notes: input.notes ?? null,
      reference: input.reference ?? false,
      source: input.source ?? null,
    });
    await commit(this.ctx, [{ entity: 'matches', record }]);
    return record;
  }

  async get(id: string): Promise<Match | undefined> {
    const record = await this.ctx.db.get('matches', id);
    return isAlive(record) ? record : undefined;
  }

  async require(id: string): Promise<Match> {
    const match = await this.get(id);
    if (!match) throw new NotFoundError('Wedstrijd', id);
    return match;
  }

  /**
   * Onze eigen wedstrijden, nieuwste eerst — dat is de volgorde waarin een coach
   * zoekt. Ingelezen referentiewedstrijden blijven eruit: die zijn geen
   * wedstrijd van ons.
   */
  async list(): Promise<Match[]> {
    return (await this.listAll()).filter((match) => !match.reference);
  }

  /** Alleen het ingelezen referentiemateriaal. */
  async listReference(): Promise<Match[]> {
    return (await this.listAll()).filter((match) => match.reference === true);
  }

  private async listAll(): Promise<Match[]> {
    return alive(await this.ctx.db.getAll('matches')).sort((a, b) => b.date.localeCompare(a.date));
  }

  /** Basis voor het opponent-dossier: alle eerdere wedstrijden tegen dit team. */
  async listByOpponent(opponentTeamId: string): Promise<Match[]> {
    const records = alive(
      await this.ctx.db.getAllFromIndex('matches', 'by_opponent', opponentTeamId),
    );
    return records.sort((a, b) => b.date.localeCompare(a.date));
  }

  async update(id: string, patch: Partial<MatchInput>): Promise<Match> {
    const current = await this.require(id);
    const record = reviseRecord(this.ctx, current, patch);
    await commit(this.ctx, [{ entity: 'matches', record }]);
    return record;
  }

  async setStatus(id: string, status: MatchStatus): Promise<Match> {
    return this.update(id, { status });
  }

  /** Verwijdert de wedstrijd inclusief sets, rally's en acties (alles als tombstone). */
  async remove(id: string): Promise<void> {
    const match = await this.require(id);
    const deletedAt = this.ctx.now().toISOString();
    const ops: WriteOp[] = [];

    const [sets, rallies, actions] = await Promise.all([
      this.ctx.db.getAllFromIndex('sets', 'by_match', id),
      this.ctx.db.getAllFromIndex('rallies', 'by_match', id),
      this.ctx.db.getAllFromIndex('actions', 'by_match', id),
    ]);

    for (const action of alive(actions)) {
      ops.push({ entity: 'actions', record: reviseRecord(this.ctx, action, { deletedAt }) });
    }
    for (const rally of alive(rallies)) {
      ops.push({ entity: 'rallies', record: reviseRecord(this.ctx, rally, { deletedAt }) });
    }
    for (const set of alive(sets)) {
      ops.push({ entity: 'sets', record: reviseRecord(this.ctx, set, { deletedAt }) });
    }
    ops.push({ entity: 'matches', record: reviseRecord(this.ctx, match, { deletedAt }) });

    await commit(this.ctx, ops);
  }
}
