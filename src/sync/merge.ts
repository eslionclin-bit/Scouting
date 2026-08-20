/**
 * Samenvoegen van binnengekomen wijzigingen.
 *
 * Regel: last-writer-wins op de hybride klok, met het device-id als tiebreak.
 * Omdat acties append-only zijn en undo een tombstone is, is dit voor de
 * wedstrijddata geen compromis maar exact goed: twee apparaten die dezelfde
 * rally invoeren leveren twee losse acties op, geen halve.
 */

import { compareRev } from '../domain/clock';
import type { BaseRecord } from '../domain/types';
import { commit, type WriteContext, type WriteOp } from '../db/mutations';
import type { ChangeEnvelope } from './types';

export interface MergeResult {
  applied: number;
  /** Genegeerd omdat we een nieuwere of gelijke revisie hadden. */
  skipped: number;
}

export async function applyRemoteChanges(
  ctx: WriteContext,
  changes: readonly ChangeEnvelope[],
): Promise<MergeResult> {
  const ops: WriteOp[] = [];
  let skipped = 0;

  for (const change of changes) {
    const incoming = change.record;
    if (!isValidRecord(incoming)) {
      skipped++;
      continue;
    }

    // Onze eigen klok moet meelopen met wat we van anderen zien, anders zou een
    // volgende lokale wijziging 'ouder' lijken dan een al ontvangen wijziging.
    ctx.clock.observe(incoming.rev);

    const current = (await ctx.db.get(change.entity, incoming.id)) as BaseRecord | undefined;
    if (current && compareRev(incoming.rev, current.rev) <= 0) {
      skipped++;
      continue;
    }

    // skipOutbox: binnengehaalde wijzigingen niet terugsturen naar de afzender.
    ops.push({ entity: change.entity, record: incoming as never, skipOutbox: true });
  }

  await commit(ctx, ops);
  return { applied: ops.length, skipped };
}

function isValidRecord(record: unknown): record is BaseRecord {
  if (record == null || typeof record !== 'object') return false;
  const candidate = record as Partial<BaseRecord>;
  return typeof candidate.id === 'string' && typeof candidate.rev === 'string';
}
