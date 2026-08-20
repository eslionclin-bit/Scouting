/**
 * Sets binnen een wedstrijd.
 *
 * De setstand wordt niet opgeteld maar telkens herberekend uit de afgeronde
 * rally's. Dat scheelt een hele klasse aan bugs: undo van een rally, een
 * gecorrigeerde uitslag of een set die op twee apparaten tegelijk is bijgewerkt
 * leveren zo altijd dezelfde stand op.
 */

import type { MatchSet, SetStatus, TeamSide } from '../../domain/types';
import { buildRecord, commit, reviseRecord, type WriteContext, type WriteOp } from '../mutations';
import { alive, isAlive, NotFoundError, ValidationError } from './base';

export const MAX_SETS = 5;

export interface StartSetInput {
  matchId: string;
  setNumber?: number;
  startingServe: TeamSide;
}

export interface SetScore {
  pointsUs: number;
  pointsThem: number;
}

export class SetRepository {
  constructor(private readonly ctx: WriteContext) {}

  async start(input: StartSetInput): Promise<MatchSet> {
    return this.ctx.lock.run(() => this.startUnlocked(input));
  }

  private async startUnlocked(input: StartSetInput): Promise<MatchSet> {
    const existing = await this.listByMatch(input.matchId);
    const setNumber = input.setNumber ?? existing.length + 1;
    if (setNumber < 1 || setNumber > MAX_SETS) {
      throw new ValidationError(`Een wedstrijd heeft maximaal ${MAX_SETS} sets.`, [
        { code: 'invalid_set_number', message: `Setnummer ${setNumber} bestaat niet.` },
      ]);
    }
    if (existing.some((set) => set.setNumber === setNumber)) {
      throw new ValidationError(`Set ${setNumber} bestaat al in deze wedstrijd.`, [
        { code: 'duplicate_set', message: `Set ${setNumber} bestaat al.` },
      ]);
    }

    const record = buildRecord(this.ctx, 'sets', {
      matchId: input.matchId,
      setNumber,
      pointsUs: 0,
      pointsThem: 0,
      status: 'live' as SetStatus,
      startingServe: input.startingServe,
    });
    await commit(this.ctx, [{ entity: 'sets', record }]);
    return record;
  }

  async get(id: string): Promise<MatchSet | undefined> {
    const record = await this.ctx.db.get('sets', id);
    return isAlive(record) ? record : undefined;
  }

  async require(id: string): Promise<MatchSet> {
    const set = await this.get(id);
    if (!set) throw new NotFoundError('Set', id);
    return set;
  }

  async listByMatch(matchId: string): Promise<MatchSet[]> {
    const records = alive(await this.ctx.db.getAllFromIndex('sets', 'by_match', matchId));
    return records.sort((a, b) => a.setNumber - b.setNumber);
  }

  /** De set waarin op dit moment wordt ingevoerd. */
  async current(matchId: string): Promise<MatchSet | undefined> {
    const sets = await this.listByMatch(matchId);
    return sets.filter((set) => set.status === 'live').at(-1) ?? sets.at(-1);
  }

  async finish(id: string): Promise<MatchSet> {
    const current = await this.require(id);
    const record = reviseRecord(this.ctx, current, { status: 'finished' as SetStatus });
    await commit(this.ctx, [{ entity: 'sets', record }]);
    return record;
  }

  /** Stand uit de afgeronde rally's van deze set. */
  async computeScore(setId: string): Promise<SetScore> {
    const rallies = alive(await this.ctx.db.getAllFromIndex('rallies', 'by_set', setId));
    let pointsUs = 0;
    let pointsThem = 0;
    for (const rally of rallies) {
      if (rally.wonBy === 'us') pointsUs++;
      else if (rally.wonBy === 'them') pointsThem++;
    }
    return { pointsUs, pointsThem };
  }

  /**
   * Bouwt de schrijfoperatie voor een bijgewerkte setstand, zodat de aanroeper
   * hem in dezelfde transactie kan meenemen als de rally-wijziging.
   */
  async scoreUpdateOp(setId: string, score: SetScore): Promise<WriteOp<'sets'> | null> {
    const set = await this.require(setId);
    if (set.pointsUs === score.pointsUs && set.pointsThem === score.pointsThem) return null;
    return { entity: 'sets', record: reviseRecord(this.ctx, set, score) };
  }
}
