/**
 * Sync-contract.
 *
 * De opslaglaag weet niet hoe wijzigingen bij een ander apparaat komen. Dat is
 * expres: v1 heeft alleen lokale opslag nodig, v3 spiegelt over het lokale
 * netwerk naar de coach, v5 doet meerdere invoerders tegelijk. Alle drie
 * implementeren ze hetzelfde `SyncTransport`, zonder dat het datamodel wijzigt.
 */

import type { BaseRecord, EntityName } from '../domain/types';

/**
 * Eén wijziging onderweg: altijd het volledige record, nooit een delta.
 * Daardoor is opnieuw versturen ongevaarlijk en is samenvoegen niets meer dan
 * revisies vergelijken.
 */
export interface ChangeEnvelope {
  entity: EntityName;
  record: BaseRecord;
}

export interface PushRequest {
  deviceId: string;
  changes: ChangeEnvelope[];
}

export interface PushResponse {
  /** Revisies die de tegenpartij heeft verwerkt; de rest blijft in de outbox. */
  acceptedRevs: string[];
}

export interface PullRequest {
  deviceId: string;
  /** Cursor van de vorige pull; null bij een eerste synchronisatie. */
  cursor: string | null;
  /** Beperk tot één wedstrijd — dat is wat live meelezen nodig heeft. */
  matchId?: string | null;
}

export interface PullResponse {
  changes: ChangeEnvelope[];
  cursor: string | null;
  /** Er staat nog meer klaar; de engine haalt direct nog een batch op. */
  hasMore?: boolean;
}

export interface SyncTransport {
  readonly name: string;
  /** Of er op dit moment een verbinding is. Onbekend mag: dan gewoon proberen. */
  isAvailable?(): boolean | Promise<boolean>;
  push(request: PushRequest): Promise<PushResponse>;
  pull(request: PullRequest): Promise<PullResponse>;
}

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncState {
  status: SyncStatus;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
  /** Aantal mislukte pogingen op rij; bepaalt de wachttijd voor de volgende. */
  failures: number;
}
