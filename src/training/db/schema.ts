/**
 * IndexedDB-schema van de trainingsapp.
 *
 * Alles staat lokaal: een trainingsblad moet in een sporthal zonder bereik open
 * kunnen. Delen is een laag erbovenop en nooit een voorwaarde — wie niets deelt,
 * merkt van de hele sync-laag niets.
 *
 * Aparte database van de scouting-app, met een eigen naam: het zijn twee apps
 * die toevallig dezelfde bouwstenen delen, geen twee helften van één app.
 */

import type { DBSchema } from 'idb';
import type {
  EntityName,
  Exercise,
  Group,
  Player,
  Series,
  Team,
  Training,
} from '../domain/types';

export const DB_NAME = 'volley-training';
export const DB_VERSION = 1;

/** Wijziging die nog gedeeld moet worden. Bevat het hele record, geen delta. */
export interface OutboxEntry {
  seq?: number;
  entity: EntityName;
  recordId: string;
  rev: string;
  createdAt: string;
  attempts: number;
  lastError: string | null;
}

export interface MetaEntry {
  key: string;
  value: unknown;
}

export const META_KEYS = {
  clock: 'clock',
  profile: 'profile',
  settings: 'settings',
  /** Per scope waar we gebleven waren bij het ophalen: `cursor:public`. */
  cursor: (scope: string) => `cursor:${scope}`,
} as const;

export interface TrainingSchema extends DBSchema {
  teams: { key: string; value: Team; indexes: { by_name: string } };
  players: { key: string; value: Player; indexes: { by_team: string } };
  exercises: { key: string; value: Exercise; indexes: { by_author: string } };
  trainings: {
    key: string;
    value: Training;
    indexes: { by_date: string; by_series: string; by_team: string };
  };
  series: { key: string; value: Series; indexes: { by_team: string } };
  groups: { key: string; value: Group; indexes: { by_name: string } };
  outbox: { key: number; value: OutboxEntry; indexes: { by_record: [string, string] } };
  meta: { key: string; value: MetaEntry };
}

export const ENTITY_STORES: readonly EntityName[] = [
  'teams',
  'players',
  'exercises',
  'trainings',
  'series',
  'groups',
] as const;
