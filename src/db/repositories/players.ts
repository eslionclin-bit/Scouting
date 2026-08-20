/** Spelers, per team. Rugnummer is uniek binnen een team. */

import type { Player } from '../../domain/types';
import { buildRecord, commit, reviseRecord, type WriteContext } from '../mutations';
import { alive, isAlive, NotFoundError, ValidationError } from './base';

export interface PlayerInput {
  teamId: string;
  number: number;
  name: string;
  position?: string | null;
  active?: boolean;
}

export class PlayerRepository {
  constructor(private readonly ctx: WriteContext) {}

  async create(input: PlayerInput): Promise<Player> {
    await this.assertNumberFree(input.teamId, input.number, null);
    const record = buildRecord(this.ctx, 'players', {
      teamId: input.teamId,
      number: input.number,
      name: input.name,
      position: input.position ?? null,
      active: input.active ?? true,
    });
    await commit(this.ctx, [{ entity: 'players', record }]);
    return record;
  }

  /** Handig bij het opzetten van een wedstrijd: hele opstelling in één keer. */
  async createMany(inputs: readonly PlayerInput[]): Promise<Player[]> {
    const seen = new Set<string>();
    for (const input of inputs) {
      const key = `${input.teamId}#${input.number}`;
      if (seen.has(key)) {
        throw new ValidationError(`Rugnummer ${input.number} staat twee keer in de lijst.`, [
          { code: 'duplicate_number', message: `Rugnummer ${input.number} is dubbel.` },
        ]);
      }
      seen.add(key);
      await this.assertNumberFree(input.teamId, input.number, null);
    }
    const records = inputs.map((input) =>
      buildRecord(this.ctx, 'players', {
        teamId: input.teamId,
        number: input.number,
        name: input.name,
        position: input.position ?? null,
        active: input.active ?? true,
      }),
    );
    await commit(
      this.ctx,
      records.map((record) => ({ entity: 'players' as const, record })),
    );
    return records;
  }

  async get(id: string): Promise<Player | undefined> {
    const record = await this.ctx.db.get('players', id);
    return isAlive(record) ? record : undefined;
  }

  async require(id: string): Promise<Player> {
    const player = await this.get(id);
    if (!player) throw new NotFoundError('Speler', id);
    return player;
  }

  async listByTeam(teamId: string, options: { includeInactive?: boolean } = {}): Promise<Player[]> {
    const records = alive(await this.ctx.db.getAllFromIndex('players', 'by_team', teamId));
    const filtered = options.includeInactive ? records : records.filter((player) => player.active);
    return filtered.sort((a, b) => a.number - b.number);
  }

  async byNumber(teamId: string, number: number): Promise<Player | undefined> {
    const records = await this.ctx.db.getAllFromIndex('players', 'by_team_number', [teamId, number]);
    return alive(records)[0];
  }

  async update(id: string, patch: Partial<Omit<PlayerInput, 'teamId'>>): Promise<Player> {
    const current = await this.require(id);
    if (patch.number != null && patch.number !== current.number) {
      await this.assertNumberFree(current.teamId, patch.number, id);
    }
    const record = reviseRecord(this.ctx, current, patch);
    await commit(this.ctx, [{ entity: 'players', record }]);
    return record;
  }

  async remove(id: string): Promise<void> {
    const current = await this.require(id);
    const record = reviseRecord(this.ctx, current, { deletedAt: this.ctx.now().toISOString() });
    await commit(this.ctx, [{ entity: 'players', record }]);
  }

  private async assertNumberFree(teamId: string, number: number, ignoreId: string | null): Promise<void> {
    if (!Number.isInteger(number) || number < 0 || number > 99) {
      throw new ValidationError(`Ongeldig rugnummer: ${number}.`, [
        { code: 'invalid_player_number', message: 'Rugnummer moet tussen 0 en 99 liggen.' },
      ]);
    }
    const existing = await this.byNumber(teamId, number);
    if (existing && existing.id !== ignoreId) {
      throw new ValidationError(`Rugnummer ${number} is al in gebruik in dit team.`, [
        { code: 'duplicate_number', message: `Rugnummer ${number} bestaat al.` },
      ]);
    }
  }
}
