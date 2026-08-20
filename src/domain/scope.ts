/** Bij welke wedstrijd hoort een record. */

import type { BaseRecord, EntityName } from './types';

/**
 * Teams en spelers horen bij geen enkele wedstrijd: die gaan altijd mee, anders
 * zou een gekoppeld apparaat namen en rugnummers missen. De rest is per
 * wedstrijd te filteren — precies wat live meelezen nodig heeft.
 */
export function matchScopeOf(entity: EntityName, record: BaseRecord): string | null {
  if (entity === 'matches') return record.id;
  const candidate = record as BaseRecord & { matchId?: string };
  return candidate.matchId ?? null;
}
