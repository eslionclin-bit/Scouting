/**
 * Schrijflaag.
 *
 * Elke schrijfactie doet in één IndexedDB-transactie drie dingen:
 *   1. het record wegschrijven met een verse revisie,
 *   2. een outbox-regel aanmaken voor sync,
 *   3. de stand van de logische klok bewaren.
 *
 * Dat het in één transactie zit is het punt: er kan geen actie in de database
 * staan die de sync nooit meer meeneemt, en andersom ook niet.
 */

import type { HybridClock } from '../domain/clock';
import { newId } from '../domain/ids';
import { matchScopeOf } from '../domain/scope';
import type { Mutex } from './mutex';
import type { BaseRecord, EntityMap, EntityName } from '../domain/types';
import { META_KEYS, type OutboxEntry } from './schema';
import type { ScoutingDb } from './database';

export interface WriteContext {
  db: ScoutingDb;
  clock: HybridClock;
  deviceId: string;
  now: () => Date;
  /** Serialiseert operaties die eerst lezen en daarna schrijven. */
  lock: Mutex;
  /** Aangeroepen na een geslaagde transactie, zodat de UI kan bijwerken. */
  onCommit?: (ops: readonly WriteOp[]) => void;
}

/** Velden die de aanroeper aanlevert; de metadata vult de schrijflaag zelf in. */
export type Draft<K extends EntityName> = Omit<EntityMap[K], keyof BaseRecord> &
  Partial<Pick<BaseRecord, 'id' | 'createdAt'>>;

export interface WriteOp<K extends EntityName = EntityName> {
  entity: K;
  record: EntityMap[K];
  /** Lokale wijzigingen gaan de outbox in; binnengehaalde wijzigingen niet. */
  skipOutbox?: boolean;
}

export function buildRecord<K extends EntityName>(
  ctx: WriteContext,
  entity: K,
  draft: Draft<K>,
): EntityMap[K] {
  const timestamp = ctx.now().toISOString();
  const record = {
    ...(draft as object),
    id: draft.id ?? newId(),
    rev: ctx.clock.tick(),
    updatedBy: ctx.deviceId,
    createdAt: draft.createdAt ?? timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  } as EntityMap[K];
  void entity;
  return record;
}

export function reviseRecord<T extends BaseRecord>(
  ctx: WriteContext,
  current: T,
  patch: Partial<Omit<NoInfer<T>, keyof BaseRecord>> & Partial<Pick<BaseRecord, 'deletedAt'>>,
): T {
  return {
    ...current,
    ...patch,
    rev: ctx.clock.tick(),
    updatedBy: ctx.deviceId,
    updatedAt: ctx.now().toISOString(),
  } as T;
}

/** Schrijft alle opgegeven records atomair weg, inclusief outbox en klokstand. */
export async function commit(ctx: WriteContext, ops: readonly WriteOp[]): Promise<void> {
  if (ops.length === 0) return;

  const stores = Array.from(new Set(ops.map((op) => op.entity)));
  const tx = ctx.db.transaction([...stores, 'outbox', 'meta'], 'readwrite');
  const createdAt = ctx.now().toISOString();

  const writes: Promise<unknown>[] = [];
  for (const op of ops) {
    // idb kan een union van storenamen niet zelf narrowen; de storenaam komt uit
    // WriteOp en hoort per constructie bij het recordtype.
    const store = tx.objectStore(op.entity) as unknown as {
      put(value: unknown): Promise<unknown>;
    };
    writes.push(store.put(op.record));

    if (!op.skipOutbox) {
      const entry: OutboxEntry = {
        entity: op.entity,
        recordId: op.record.id,
        rev: op.record.rev,
        matchId: matchScopeOf(op.entity, op.record),
        payload: op.record,
        createdAt,
        attempts: 0,
        lastError: null,
      };
      writes.push(tx.objectStore('outbox').add(entry));
    }
  }

  writes.push(tx.objectStore('meta').put({ key: META_KEYS.clock, value: ctx.clock.state() }));
  await Promise.all(writes);
  await tx.done;
  ctx.onCommit?.(ops);
}
