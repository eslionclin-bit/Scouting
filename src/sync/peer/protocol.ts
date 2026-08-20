/**
 * Berichten tussen twee gekoppelde apparaten.
 *
 * Bewust klein gehouden: één invoerder deelt wat hij vastlegt, een meelezer
 * vraagt bij het koppelen op wat hij gemist heeft. Alles wat over de lijn gaat
 * is een volledig record, net als bij de gewone sync — opnieuw sturen is dus
 * ongevaarlijk.
 */

import type { ChangeEnvelope } from '../types';

export type PeerRole = 'scorer' | 'viewer';

export interface HelloMessage {
  t: 'hello';
  deviceId: string;
  role: PeerRole;
  matchId: string | null;
}

export interface PullMessage {
  t: 'pull';
  id: string;
  cursor: string | null;
  matchId: string | null;
}

export interface PulledMessage {
  t: 'pulled';
  id: string;
  changes: ChangeEnvelope[];
  cursor: string | null;
  hasMore: boolean;
}

export interface PushMessage {
  t: 'push';
  id: string;
  changes: ChangeEnvelope[];
}

export interface PushedMessage {
  t: 'pushed';
  id: string;
  acceptedRevs: string[];
}

/** Ongevraagd doorgestuurde wijziging: dit is wat 'live meelezen' live maakt. */
export interface ChangesMessage {
  t: 'changes';
  changes: ChangeEnvelope[];
}

export type PeerMessage =
  | HelloMessage
  | PullMessage
  | PulledMessage
  | PushMessage
  | PushedMessage
  | ChangesMessage;

export function isPeerMessage(value: unknown): value is PeerMessage {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as { t?: unknown };
  return (
    candidate.t === 'hello' ||
    candidate.t === 'pull' ||
    candidate.t === 'pulled' ||
    candidate.t === 'push' ||
    candidate.t === 'pushed' ||
    candidate.t === 'changes'
  );
}
