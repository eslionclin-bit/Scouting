/**
 * Deel-contract.
 *
 * Delen werkt met scopes in plaats van met accounts. Een scope is een emmer
 * waar wijzigingen in gaan en uit komen: 'openbaar' voor iedereen, of een groep
 * waarvan je de code hebt. Wie de code heeft hoort erbij; de server bewaart
 * alleen een hash ervan. Dezelfde opzet als de ploegcode van de scouting-app,
 * en om dezelfde reden: er valt niets te beheren, en een gestolen database
 * levert geen toegang op.
 *
 * Privé is geen scope maar de afwezigheid ervan: die records worden nooit
 * verstuurd.
 */

import type { EntityName, StoredRecord } from '../domain/types';

export interface ScopeRef {
  kind: 'public' | 'group';
  /** De groepscode; bij 'public' leeg. */
  code: string | null;
  /** Alleen voor de app zelf: welke groep dit is, om cursors bij te houden. */
  key: string;
  label: string;
}

/** Eén wijziging onderweg: altijd het volledige record, nooit een delta. */
export interface ChangeEnvelope {
  entity: EntityName;
  record: StoredRecord;
}

export interface PushRequest {
  scope: ScopeRef;
  changes: ChangeEnvelope[];
}

export interface PushResponse {
  /** Revisies die de tegenpartij verwerkt heeft; de rest blijft in de outbox. */
  acceptedRevs: string[];
}

export interface PullRequest {
  scope: ScopeRef;
  cursor: string | null;
  batch?: number;
}

export interface PullResponse {
  changes: ChangeEnvelope[];
  cursor: string | null;
  hasMore: boolean;
  /** Hoeveel er in totaal in deze scope staan; om een verkeerde code te zien. */
  total?: number;
}

export interface Transport {
  readonly name: string;
  isAvailable?(): boolean | Promise<boolean>;
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error' | 'off';

export interface SyncState {
  status: SyncStatus;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Wat er per scope binnenkwam bij de laatste ronde. */
  received: number;
}
