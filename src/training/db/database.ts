/** Openen en migreren van de lokale database van de trainingsapp. */

import { openDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type TrainingSchema } from './schema';

export type TrainingDb = IDBPDatabase<TrainingSchema>;

export interface OpenOptions {
  /** Aparte naam per test of per omgeving. */
  name?: string;
  onBlocked?: () => void;
}

export async function openTrainingDb(options: OpenOptions = {}): Promise<TrainingDb> {
  return openDB<TrainingSchema>(options.name ?? DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('teams', { keyPath: 'id' }).createIndex('by_name', 'name');

        db.createObjectStore('players', { keyPath: 'id' }).createIndex('by_team', 'teamId');

        db.createObjectStore('exercises', { keyPath: 'id' }).createIndex('by_author', 'authorId');

        const trainings = db.createObjectStore('trainings', { keyPath: 'id' });
        trainings.createIndex('by_date', 'date');
        trainings.createIndex('by_series', 'seriesId');
        trainings.createIndex('by_team', 'teamId');

        db.createObjectStore('series', { keyPath: 'id' }).createIndex('by_team', 'teamId');

        db.createObjectStore('groups', { keyPath: 'id' }).createIndex('by_name', 'name');

        db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true })
          .createIndex('by_record', ['entity', 'recordId']);

        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
    blocked() {
      options.onBlocked?.();
    },
  });
}
