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
 * Alle posities die deze speelster kan spelen.
 *
 * Eén speelster kan meer dan één positie aan, en dat is bij een amateurploeg
 * eerder regel dan uitzondering. `roles` is de volledige lijst; `role` is de
 * positie waar ze normaal staat en blijft de terugval voor spelers die zijn
 * opgeslagen voordat dit veld bestond.
 */
export function rolesOf(player: Pick<Player, 'role' | 'roles'>): PlayerRole[] {
  const listed = player.roles ?? [];
  if (listed.length > 0) return listed;
  return player.role ? [player.role] : [];
}

/** De positie waar ze normaal staat, als er één aan te wijzen is. */
export function primaryRoleOf(player: Pick<Player, 'role' | 'roles'>): PlayerRole | null {
  return player.role ?? player.roles?.[0] ?? null;
}

export function canPlay(player: Pick<Player, 'role' | 'roles'>, role: PlayerRole): boolean {
  return rolesOf(player).includes(role);
}

/** Hoe je haar posities in één regel opschrijft. */
export function describeRoles(player: Pick<Player, 'role' | 'roles'>): string {
  const roles = rolesOf(player);
  if (roles.length === 0) return '';
  return roles.map((role) => PLAYER_ROLE_LABELS[role]).join(' / ');
}

/**
 * Bij de tegenstander ken je meestal alleen een rugnummer. Dan is '#7' de naam;
 * er hoort geen verzonnen naam achter geplakt te worden, en zeker niet het
 * nummer twee keer.
 */
export function playerLabel(player: Pick<Player, 'number' | 'name'>): string {
  const name = player.name.trim();
  return name.length > 0 ? `#${player.number} ${name}` : `#${player.number}`;
}
