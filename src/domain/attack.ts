/**
 * Namen voor het aanvalstempo en het blok, zoals ze in de hal heten.
 *
 * Vier soorten aanval, en ze gaan over tempo, niet over plaats: een gestrekte
 * bal naar de antenne is net zo goed 'snel' als een korte bal in het midden.
 * 'Achter' is de uitzondering — die zegt wél waar de speler stond, omdat dat de
 * aanval fundamenteel anders maakt.
 */

import type { AttackTempo, BlockCount } from './types';

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
