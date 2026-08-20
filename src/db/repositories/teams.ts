/** Teams: het eigen team en elke tegenstander. */

import type { Team } from '../../domain/types';
import { buildRecord, commit, reviseRecord, type Draft, type WriteContext } from '../mutations';
import { alive, isAlive, NotFoundError } from './base';

export interface TeamInput {
  name: string;
  isOwnTeam?: boolean;
  club?: string | null;
  level?: string | null;
}

export class TeamRepository {
  constructor(private readonly ctx: WriteContext) {}

  async create(input: TeamInput): Promise<Team> {
    const draft: Draft<'teams'> = {
      name: input.name,
      isOwnTeam: input.isOwnTeam ?? false,
      club: input.club ?? null,
      level: input.level ?? null,
    };
    const record = buildRecord(this.ctx, 'teams', draft);
    await commit(this.ctx, [{ entity: 'teams', record }]);
    return record;
  }

  async get(id: string): Promise<Team | undefined> {
    const record = await this.ctx.db.get('teams', id);
    return isAlive(record) ? record : undefined;
  }

  async require(id: string): Promise<Team> {
    const team = await this.get(id);
    if (!team) throw new NotFoundError('Team', id);
    return team;
  }

  async list(): Promise<Team[]> {
    return alive(await this.ctx.db.getAll('teams')).sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Het eigen team; er hoort er precies één te zijn. */
  async ownTeam(): Promise<Team | undefined> {
    return (await this.list()).find((team) => team.isOwnTeam);
  }

  async opponents(): Promise<Team[]> {
    return (await this.list()).filter((team) => !team.isOwnTeam);
  }

  /**
   * Zoekt een tegenstander op naam of maakt hem aan. Dit houdt het
   * opponent-dossier over meerdere wedstrijden aan één team gekoppeld.
   */
  async findOrCreateOpponent(name: string): Promise<Team> {
    const normalized = name.trim();
    const existing = (await this.opponents()).find(
      (team) => team.name.toLowerCase() === normalized.toLowerCase(),
    );
    if (existing) return existing;
    return this.create({ name: normalized, isOwnTeam: false });
  }

  async update(id: string, patch: Partial<TeamInput>): Promise<Team> {
    const current = await this.require(id);
    const record = reviseRecord(this.ctx, current, patch);
    await commit(this.ctx, [{ entity: 'teams', record }]);
    return record;
  }

  async remove(id: string): Promise<void> {
    const current = await this.require(id);
    const record = reviseRecord(this.ctx, current, {
      deletedAt: this.ctx.now().toISOString(),
    });
    await commit(this.ctx, [{ entity: 'teams', record }]);
  }
}
