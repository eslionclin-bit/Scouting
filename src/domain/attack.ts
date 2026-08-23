/**
 * Namen voor het aanvalstempo en het blok, zoals ze in de hal heten.
 *
 * Vier soorten aanval, en ze gaan over tempo, niet over plaats: een gestrekte
 * bal naar de antenne is net zo goed 'snel' als een korte bal in het midden.
 * 'Achter' is de uitzondering — die zegt wél waar de speler stond, omdat dat de
 * aanval fundamenteel anders maakt.
 */

import type { AttackTempo, BlockCount, Zone } from './types';
import { BACK_ZONES } from './zones';

export const ATTACK_TEMPO_LABELS: Record<AttackTempo, string> = {
  high: 'Hoog',
  quick: 'Snel',
  back: 'Achter',
  other: 'Overig',
};

/** Eén regel uitleg per tempo, voor onder de knop. */
export const ATTACK_TEMPO_HINTS: Record<AttackTempo, string> = {
  high: 'hoge, langzame bal',
  quick: 'snelle of gestrekte bal',
  back: 'aanval vanaf de achterlijn',
  other: 'prikbal, tweede bal, noodoplossing',
};

export const BLOCK_LABELS: Record<BlockCount, string> = {
  0: 'Geen blok',
  1: '1 blok',
  2: '2 blok',
  3: '3 blok',
};

/**
 * Het tempo van een achteraanval hoeft niet gevraagd te worden.
 *
 * Stond ze achterin, dan ís het een achteraanval — dat is precies wat 'achter'
 * betekent. De vraag stellen is de invoerder laten intikken wat er al staat, en
 * bij een bal die net gevallen is is elke overbodige tik er één te veel.
 *
 * Welke achteraanval het was staat trouwens ook al vast: dat volgt uit de zone
 * waar ze vandaan kwam. Daar is geen apart veld voor nodig.
 */
export function tempoFromZone(zone: Zone | null): AttackTempo | null {
  if (zone === null) return null;
  return BACK_ZONES.includes(zone) ? 'back' : null;
}

/**
 * Hoe deze achteraanval in de hal heet.
 *
 * Vanaf 6 is het een pipe, vanaf 1 een 10. Vanaf 5 wordt in principe niet
 * aangevallen; gebeurt het toch, dan staat er de zone bij in plaats van een
 * naam die niemand gebruikt.
 */
export function backAttackLabel(zone: Zone): string {
  if (zone === 6) return 'pipe';
  if (zone === 1) return 'de 10';
  return `achteraanval vanaf ${zone}`;
}
