/** Hoe een speler op het scherm heet. */

import type { Player, PlayerRole } from './types';

/** Rollen zoals ze in de zaal heten. */
export const PLAYER_ROLE_LABELS: Record<PlayerRole, string> = {
  setter: 'Spelverdeler',
  middle: 'Midden',
  outside: 'Passer-loper',
  opposite: 'Diagonaal',
  libero: 'Libero',
};

export const PLAYER_ROLES: readonly PlayerRole[] = [
  'setter',
  'middle',
  'outside',
  'opposite',
  'libero',
] as const;

/**
 * Bij de tegenstander ken je meestal alleen een rugnummer. Dan is '#7' de naam;
 * er hoort geen verzonnen naam achter geplakt te worden, en zeker niet het
 * nummer twee keer.
 */
export function playerLabel(player: Pick<Player, 'number' | 'name'>): string {
  const name = player.name.trim();
  return name.length > 0 ? `#${player.number} ${name}` : `#${player.number}`;
}
