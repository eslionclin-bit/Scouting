/**
 * IndexedDB-schema.
 *
 * Alle wedstrijddata staat lokaal; de app is volledig bruikbaar zonder
 * verbinding (projectbrief §1). Sync is een aanvulling bovenop deze store,
 * nooit een voorwaarde ervoor.
 */

import type { DBSchema } from 'idb';
import type {
  Action,
  EntityName,
  Lineup,
  Match,
  MatchSet,
  Player,
  Rally,
  Substitution,
  Team,
} from '../domain/types';

export const DB_NAME = 'volley-scouting';
export const DB_VERSION = 2;

/** Stores waarin domeinrecords staan; deze synchroniseren mee. */
export const ENTITY_STORES: readonly EntityName[] = [
  'teams',
  'players',
  'matches',
  'sets',
  'rallies',
  'actions',
  'lineups',
  'substitutions',
] as const;

/**
 * Wijziging die nog naar andere apparaten of de cloud moet.
 * Bevat een volledige snapshot van het record: dat maakt herverzenden
 * idempotent en samenvoegen een simpele revisievergelijking.
 */
export interface OutboxEntry {
  /** Oplopend, door IndexedDB toegekend. Bepaalt de verzendvolgorde. */
  seq?: number;
  entity: EntityName;
  recordId: string;
  rev: string;
  /** Scope voor live meelezen: alleen wijzigingen van de actieve wedstrijd sturen. */
  matchId: string | null;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

/** Vrije sleutel-waardeopslag voor klokstand, sync-cursor en apparaatrol. */
export interface MetaEntry {
  key: string;
  value: unknown;
}

export interface ScoutingSchema extends DBSchema {
  teams: {
    key: string;
    value: Team;
    indexes: { by_name: string };
  };
  players: {
    key: string;
    value: Player;
    indexes: { by_team: string; by_team_number: [string, number] };
  };
  matches: {
    key: string;
    value: Match;
    indexes: { by_date: string; by_opponent: string; by_status: string };
  };
  sets: {
    key: string;
    value: MatchSet;
    indexes: { by_match: string; by_match_number: [string, number] };
  };
  rallies: {
    key: string;
    value: Rally;
    indexes: { by_match: string; by_set: string; by_set_sequence: [string, number] };
  };
  actions: {
    key: string;
    value: Action;
    indexes: {
      by_match: string;
      by_set: string;
      by_rally: string;
      by_rally_sequence: [string, number];
      by_player: string;
      by_match_type: [string, string];
    };
  };
  lineups: {
    key: string;
    value: Lineup;
    indexes: { by_match: string; by_set: string };
  };
  substitutions: {
    key: string;
    value: Substitution;
    indexes: { by_match: string; by_set: string; by_rally: string };
  };
  outbox: {
    key: number;
    value: OutboxEntry;
    indexes: { by_record: [string, string] };
  };
  meta: {
    key: string;
    value: MetaEntry;
  };
}

export const META_KEYS = {
  clock: 'sync.clock',
  syncCursor: 'sync.cursor',
  lastSyncAt: 'sync.lastSyncAt',
  deviceRole: 'device.role',
  activeMatchId: 'app.activeMatchId',
} as const;
