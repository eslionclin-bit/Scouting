/**
 * Welke wijziging gaat waarheen.
 *
 * Eén regel, en die staat hier zodat hij op één plek te lezen en te testen is:
 * een record gaat naar de scopes die zijn zichtbaarheid noemt, en naar geen
 * enkele andere. Privé betekent dat er niets verstuurd wordt — ook niet naar
 * een groep waar je zelf in zit.
 */

import type { Group, StoredRecord, Visibility } from '../domain/types';
import type { ScopeRef } from './types';

export const PUBLIC_SCOPE: ScopeRef = {
  kind: 'public',
  code: null,
  key: 'public',
  label: 'Openbaar',
};

export function groupScope(group: Group): ScopeRef {
  return { kind: 'group', code: group.code, key: `group:${group.id}`, label: group.name };
}

/** Records die gedeeld worden, dragen deze twee velden. */
interface Shareable extends StoredRecord {
  visibility: Visibility;
  groupIds: string[];
}

export function isShareable(record: StoredRecord): record is Shareable {
  const candidate = record as Partial<Shareable>;
  return typeof candidate.visibility === 'string' && Array.isArray(candidate.groupIds);
}

/**
 * Naar welke scopes dit record moet.
 *
 * Een team of een speler heeft geen zichtbaarheid: die horen bij jou en blijven
 * op je eigen apparaten. Ze komen hier dus niet doorheen.
 */
export function scopesFor(record: StoredRecord, groups: readonly Group[]): ScopeRef[] {
  if (!isShareable(record)) return [];
  if (record.visibility === 'public') return [PUBLIC_SCOPE];
  if (record.visibility !== 'group') return [];
  return groups
    .filter((group) => record.groupIds.includes(group.id) && !group.deletedAt)
    .map(groupScope);
}

/** Scopes waar deze app uit ophaalt: je groepen, en openbaar als je dat wil. */
export function subscribedScopes(groups: readonly Group[], followPublic: boolean): ScopeRef[] {
  const scopes = groups.filter((group) => !group.deletedAt).map(groupScope);
  return followPublic ? [PUBLIC_SCOPE, ...scopes] : scopes;
}

/**
 * Een nieuwe groepscode.
 *
 * Dat dit veilig is, hangt aan de lengte: er is verder geen wachtwoord. Vandaar
 * dat de app hem maakt en niemand hem zelf verzint. Vier blokken van vijf
 * tekens uit een alfabet zonder i, l, o, 0 en 1 — te dicteren over de telefoon,
 * en met 20 tekens uit 32 mogelijkheden niet te raden.
 */
export function newGroupCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(20);
  const crypto = globalThis.crypto;
  if (crypto && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const letters = Array.from(bytes, (byte) => alphabet[byte % alphabet.length] ?? 'x');
  return [0, 5, 10, 15].map((start) => letters.slice(start, start + 5).join('')).join('-');
}

/** Losse streepjes en hoofdletters mogen: mensen typen een code over van papier. */
export function normalizeGroupCode(code: string): string {
  return code.trim().toLowerCase().replace(/\s+/g, '');
}
