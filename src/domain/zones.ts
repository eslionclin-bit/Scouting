/**
 * Zonelogica volgens het standaard rotatieschema (1 t/m 6, 1 = rechtsachter bij
 * de opslag). Zowel de invoer (mini-veld met 6 vakken) als de heatmap in het
 * analysedashboard leunen hierop.
 */

import type { Zone } from './types';
import { ZONES } from './types';

export function isZone(value: unknown): value is Zone {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6;
}

export function toZone(value: unknown): Zone | null {
  return isZone(value) ? value : null;
}

/** Voorste zones (bij het net) versus achterste zones. */
export const FRONT_ZONES: readonly Zone[] = [4, 3, 2] as const;
export const BACK_ZONES: readonly Zone[] = [5, 6, 1] as const;

export function isFrontZone(zone: Zone): boolean {
  return FRONT_ZONES.includes(zone);
}

/**
 * Indeling van het mini-veld, gezien vanaf de eigen kant met het net bovenaan.
 * Rij 0 is de netlijn. Deze volgorde is de bron voor zowel de tikbare vakken
 * als de heatmap-cellen, zodat beide gegarandeerd hetzelfde veld tonen.
 */
export const COURT_GRID: readonly (readonly Zone[])[] = [
  [4, 3, 2],
  [5, 6, 1],
] as const;

/**
 * Hetzelfde veld, maar dan de helft van de tegenstander, gezien vanaf onze kant.
 *
 * Twee dingen draaien om ten opzichte van `COURT_GRID`, en ze draaien allebei om
 * omdat je van de andere kant kijkt:
 *
 *  - **Boven/onder.** Hun helft staat boven het net, dus hun voorlijn (4-3-2)
 *    hoort onderaan die helft, tegen het net aan. Hun achterlijn ligt van ons af.
 *  - **Links/rechts.** Hun zone 4 is hun linksvoor, en dat is voor ons rechts.
 *
 * Rij 0 is dus hun achterlijn (1-6-5), rij 1 staat aan het net (2-3-4).
 */
export const OPPONENT_GRID: readonly (readonly Zone[])[] = [
  [1, 6, 5],
  [2, 3, 4],
] as const;

export const ZONE_LABELS: Record<Zone, string> = {
  1: 'Zone 1 (rechtsachter)',
  2: 'Zone 2 (rechtsvoor)',
  3: 'Zone 3 (midvoor)',
  4: 'Zone 4 (linksvoor)',
  5: 'Zone 5 (linksachter)',
  6: 'Zone 6 (midachter)',
};

/** Lege telling per zone — startpunt voor heatmaps en zoneverdelingen. */
export function emptyZoneTally(): Record<Zone, number> {
  return { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
}

export function allZones(): readonly Zone[] {
  return ZONES;
}
