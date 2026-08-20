/**
 * Outbox: wijzigingen die nog verstuurd moeten worden.
 *
 * De outbox is de reden dat sync nooit blokkeert (projectbrief §1). Invoeren
 * schrijft lokaal en zet een regel in de outbox; of die regel binnen een seconde
 * of pas na de wedstrijd wegloopt, merkt de invoerder niet.
 */

import type { ScoutingDb } from '../db/database';
import type { OutboxEntry } from '../db/schema';
import { compareRev } from '../domain/clock';
import type { BaseRecord } from '../domain/types';
import type { ChangeEnvelope } from './types';

export interface PeekOptions {
  limit?: number;
  /** Alleen wijzigingen van deze wedstrijd (plus teams/spelers, die overal bij horen). */
  matchId?: string | null;
}

export async function pendingCount(db: ScoutingDb): Promise<number> {
  return db.count('outbox');
}

export async function peekOutbox(
  db: ScoutingDb,
  options: PeekOptions = {},
): Promise<OutboxEntry[]> {
  const { limit = 100, matchId = null } = options;
  const entries: OutboxEntry[] = [];

  let cursor = await db.transaction('outbox').store.openCursor();
  while (cursor && entries.length < limit) {
    const entry = cursor.value;
    if (matchId == null || entry.matchId == null || entry.matchId === matchId) {
      entries.push(entry);
    }
    cursor = await cursor.continue();
  }
  return entries;
}

export function toEnvelopes(entries: readonly OutboxEntry[]): ChangeEnvelope[] {
  return entries.map((entry) => ({
    entity: entry.entity,
    record: entry.payload as BaseRecord,
  }));
}

/** Verstuurd en bevestigd: weg ermee. */
export async function ackOutbox(db: ScoutingDb, seqs: readonly number[]): Promise<void> {
  if (seqs.length === 0) return;
  const tx = db.transaction('outbox', 'readwrite');
  await Promise.all(seqs.map((seq) => tx.store.delete(seq)));
  await tx.done;
}

/** Mislukt: pogingteller bijwerken zodat de engine kan afbouwen in tempo. */
export async function markOutboxFailure(
  db: ScoutingDb,
  seqs: readonly number[],
  message: string,
): Promise<void> {
  if (seqs.length === 0) return;
  const tx = db.transaction('outbox', 'readwrite');
  for (const seq of seqs) {
    const entry = await tx.store.get(seq);
    if (!entry) continue;
    await tx.store.put({ ...entry, attempts: entry.attempts + 1, lastError: message });
  }
  await tx.done;
}

/**
 * Verwijdert achterhaalde regels: van hetzelfde record telt alleen de nieuwste
 * revisie, want elke regel bevat het volledige record. Na een lange wedstrijd
 * zonder verbinding scheelt dat flink in wat er alsnog de lucht in moet.
 */
export async function compactOutbox(db: ScoutingDb): Promise<number> {
  const tx = db.transaction('outbox', 'readwrite');
  const newestPerRecord = new Map<string, { seq: number; rev: string }>();
  const superseded: number[] = [];

  let cursor = await tx.store.openCursor();
  while (cursor) {
    const entry = cursor.value;
    const seq = entry.seq;
    if (seq != null) {
      const key = `${entry.entity}#${entry.recordId}`;
      const known = newestPerRecord.get(key);
      if (!known) {
        newestPerRecord.set(key, { seq, rev: entry.rev });
      } else if (compareRev(entry.rev, known.rev) > 0) {
        superseded.push(known.seq);
        newestPerRecord.set(key, { seq, rev: entry.rev });
      } else {
        superseded.push(seq);
      }
    }
    cursor = await cursor.continue();
  }

  await Promise.all(superseded.map((seq) => tx.store.delete(seq)));
  await tx.done;
  return superseded.length;
}
