/**
 * Verzamelen wat een meelezer nog niet heeft.
 *
 * Er is geen apart wijzigingslogboek nodig: elk record draagt zijn revisie, en
 * revisies zijn sorteerbaar. 'Alles nieuwer dan deze cursor' is dus gewoon een
 * filter over de records van deze wedstrijd.
 */

import type { ScoutingStore } from '../../db/store';
import { compareRev } from '../../domain/clock';
import type { BaseRecord, EntityName } from '../../domain/types';
import type { ChangeEnvelope } from '../types';

/** Stores die per wedstrijd te filteren zijn via de by_match-index. */
const MATCH_SCOPED = ['sets', 'rallies', 'actions', 'lineups', 'substitutions'] as const;

/** Teams en spelers horen bij geen wedstrijd en gaan altijd mee: anders mist de meelezer namen. */
const GLOBAL_SCOPED = ['teams', 'players'] as const;

export async function collectChanges(
  store: ScoutingStore,
  matchId: string | null,
  cursor: string | null,
): Promise<ChangeEnvelope[]> {
  const changes: ChangeEnvelope[] = [];

  const add = (entity: EntityName, records: readonly BaseRecord[]): void => {
    for (const record of records) {
      if (cursor && compareRev(record.rev, cursor) <= 0) continue;
      changes.push({ entity, record });
    }
  };

  for (const entity of GLOBAL_SCOPED) {
    add(entity, await store.db.getAll(entity));
  }

  if (matchId) {
    const match = await store.db.get('matches', matchId);
    if (match) add('matches', [match]);
    for (const entity of MATCH_SCOPED) {
      add(entity, await store.db.getAllFromIndex(entity, 'by_match', matchId));
    }
  } else {
    add('matches', await store.db.getAll('matches'));
    for (const entity of MATCH_SCOPED) {
      add(entity, await store.db.getAll(entity));
    }
  }

  // Op revisie sorteren zodat de ontvanger een betrouwbare cursor kan bewaren.
  return changes.sort((a, b) => compareRev(a.record.rev, b.record.rev));
}

export function latestRev(changes: readonly ChangeEnvelope[]): string | null {
  return changes.reduce<string | null>(
    (latest, change) =>
      latest === null || compareRev(change.record.rev, latest) > 0 ? change.record.rev : latest,
    null,
  );
}
