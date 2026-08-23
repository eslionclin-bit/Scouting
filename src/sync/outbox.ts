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
import { ENTITY_NAMES, type BaseRecord } from '../domain/types';
import { matchScopeOf } from '../domain/scope';
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

/**
 * Alles opnieuw in de outbox zetten.
 *
 * Nodig wanneer je van ploeg wisselt — een nieuwe of gecorrigeerde ploegcode.
 * De outbox is namelijk geen kopie van de data maar een wachtrij: zodra een
 * wijziging is aangekomen, gaat de regel eruit. Koppel je daarna aan een andere
 * ploeg, dan staat daar niets van wat dit apparaat al eens verstuurd had, en
 * niets zou dat ooit alsnog opsturen.
 *
 * Dat is precies het geval van een telefoon die per ongeluk aan de verkeerde
 * code hing: zijn wedstrijden zijn weg naar een ploeg die niemand kent, en na
 * het herstellen van de code zouden ze nergens meer opduiken. Vandaar dat het
 * wisselen van code hier langskomt.
 *
 * Tombstones gaan mee: een verwijderde actie hoort ook op het andere apparaat
 * verwijderd te zijn.
 */
export async function enqueueAll(db: ScoutingDb): Promise<number> {
  const createdAt = new Date().toISOString();
  let queued = 0;

  for (const entity of ENTITY_NAMES) {
    const records = (await db.getAll(entity)) as BaseRecord[];
    if (records.length === 0) continue;

    // Per entiteit een transactie: één transactie over alles zou bij een lange
    // geschiedenis te lang openstaan, en de invoer mag er niet op wachten.
    const tx = db.transaction('outbox', 'readwrite');
    for (const record of records) {
      const entry: OutboxEntry = {
        entity,
        recordId: record.id,
        rev: record.rev,
        matchId: matchScopeOf(entity, record),
        payload: record,
        createdAt,
        attempts: 0,
        lastError: null,
      };
      void tx.store.add(entry);
      queued++;
    }
    await tx.done;
  }

  return queued;
}
