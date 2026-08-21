/** Hoe een speler op het scherm heet. */

import type { Player } from './types';

/**
 * Bij de tegenstander ken je meestal alleen een rugnummer. Dan is '#7' de naam;
 * er hoort geen verzonnen naam achter geplakt te worden, en zeker niet het
 * nummer twee keer.
 */
export function playerLabel(player: Pick<Player, 'number' | 'name'>): string {
  const name = player.name.trim();
  return name.length > 0 ? `#${player.number} ${name}` : `#${player.number}`;
}
