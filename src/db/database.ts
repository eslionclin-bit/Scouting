/** Openen en migreren van de lokale IndexedDB-database. */

import { openDB, deleteDB, type IDBPDatabase } from 'idb';
import { DB_NAME, DB_VERSION, type ScoutingSchema } from './schema';

export type ScoutingDb = IDBPDatabase<ScoutingSchema>;

export interface OpenOptions {
  /** Aparte naam per test of per omgeving. */
  name?: string;
  /** Aangeroepen als een ander tabblad een migratie blokkeert. */
  onBlocked?: () => void;
}

export async function openScoutingDb(options: OpenOptions = {}): Promise<ScoutingDb> {
  const name = options.name ?? DB_NAME;
  return openDB<ScoutingSchema>(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      // Migraties zijn cumulatief: elke versie voegt toe aan de vorige, zodat een
      // tablet die een seizoen niet geopend is toch netjes bijwerkt.
      if (oldVersion < 1) {
        const teams = db.createObjectStore('teams', { keyPath: 'id' });
        teams.createIndex('by_name', 'name');

        const players = db.createObjectStore('players', { keyPath: 'id' });
        players.createIndex('by_team', 'teamId');
        players.createIndex('by_team_number', ['teamId', 'number']);

        const matches = db.createObjectStore('matches', { keyPath: 'id' });
        matches.createIndex('by_date', 'date');
        matches.createIndex('by_opponent', 'opponentTeamId');
        matches.createIndex('by_status', 'status');

        const sets = db.createObjectStore('sets', { keyPath: 'id' });
        sets.createIndex('by_match', 'matchId');
        sets.createIndex('by_match_number', ['matchId', 'setNumber']);

        const rallies = db.createObjectStore('rallies', { keyPath: 'id' });
        rallies.createIndex('by_match', 'matchId');
        rallies.createIndex('by_set', 'setId');
        rallies.createIndex('by_set_sequence', ['setId', 'sequence']);

        const actions = db.createObjectStore('actions', { keyPath: 'id' });
        actions.createIndex('by_match', 'matchId');
        actions.createIndex('by_set', 'setId');
        actions.createIndex('by_rally', 'rallyId');
        actions.createIndex('by_rally_sequence', ['rallyId', 'sequence']);
        actions.createIndex('by_player', 'playerId');
        actions.createIndex('by_match_type', ['matchId', 'type']);

        const outbox = db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        outbox.createIndex('by_record', ['entity', 'recordId']);

        db.createObjectStore('meta', { keyPath: 'key' });
      }
    },
    blocked() {
      options.onBlocked?.();
    },
    blocking() {
      // Een ander tabblad wil migreren: sluiten, zodat de app niet vastloopt.
      // De store heropent zichzelf bij de volgende schrijfactie.
    },
  });
}

export async function deleteScoutingDb(name: string = DB_NAME): Promise<void> {
  await deleteDB(name);
}
