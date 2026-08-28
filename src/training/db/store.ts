/**
 * `TrainingStore` is de enige ingang tot de lokale opslag.
 *
 * Eén klasse met zes collecties, want de records van deze app zijn plat: een
 * training draagt zijn blokken bij zich, een oefening zijn animatie. Er is dus
 * geen tabel om aan te sluiten en geen transactie die over meerdere stores moet
 * — het enige dat centraal geregeld moet worden is de revisie en de outbox, en
 * dat gebeurt hier.
 */

import { HybridClock, compareRev, type HlcState } from '../../domain/clock';
import { getDeviceId, newId } from '../../domain/ids';
import type {
  EntityName,
  Exercise,
  Group,
  Player,
  Profile,
  Series,
  StoredRecord,
  Team,
  Training,
} from '../domain/types';
import {
  DEFAULT_DEVICE_SETTINGS,
  loadDeviceSettings,
  saveDeviceSettings,
  type DeviceSettings,
} from '../app/deviceSettings';
import { openTrainingDb, type OpenOptions, type TrainingDb } from './database';
import { ENTITY_STORES, META_KEYS, type OutboxEntry } from './schema';

/**
 * Instellingen van dit apparaat; reizen niet mee met de sync en staan daarom
 * niet in de database maar bij het apparaat zelf (zie `app/deviceSettings.ts`).
 */
export type AppSettings = DeviceSettings;

export const DEFAULT_SETTINGS: AppSettings = DEFAULT_DEVICE_SETTINGS;

export interface WriteEvent {
  entity: EntityName;
  id: string;
  kind: 'put' | 'delete';
}

export interface StoreOptions extends OpenOptions {
  deviceId?: string;
  now?: () => Date;
}

/** Velden die de store zelf invult; die geef je bij het aanmaken niet mee. */
type Managed = 'id' | 'rev' | 'updatedAt' | 'deletedAt';

export class TrainingStore {
  readonly teams: Collection<Team>;
  readonly players: Collection<Player>;
  readonly exercises: Collection<Exercise>;
  readonly trainings: Collection<Training>;
  readonly series: Collection<Series>;
  readonly groups: Collection<Group>;

  private readonly listeners = new Set<(events: readonly WriteEvent[]) => void>();

  private constructor(
    readonly db: TrainingDb,
    private readonly clock: HybridClock,
    readonly deviceId: string,
    private readonly now: () => Date,
  ) {
    const emit = (events: readonly WriteEvent[]) => this.emit(events);
    const write = <T extends StoredRecord>(entity: EntityName) =>
      new Collection<T>(entity, db, () => this.tick(), () => this.now().toISOString(), emit);

    this.teams = write<Team>('teams');
    this.players = write<Player>('players');
    this.exercises = write<Exercise>('exercises');
    this.trainings = write<Training>('trainings');
    this.series = write<Series>('series');
    this.groups = write<Group>('groups');
  }

  static async open(options: StoreOptions = {}): Promise<TrainingStore> {
    const db = await openTrainingDb(options);
    const deviceId = options.deviceId ?? getDeviceId();
    const clock = new HybridClock(deviceId);

    // De klokstand overleeft het sluiten van de app; anders zou een herstart
    // revisies opleveren die ouder lijken dan wat er al staat.
    const stored = await db.get('meta', META_KEYS.clock);
    if (stored && isClockState(stored.value)) clock.restore(stored.value);

    return new TrainingStore(db, clock, deviceId, options.now ?? (() => new Date()));
  }

  close(): void {
    this.db.close();
  }

  subscribe(listener: (events: readonly WriteEvent[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(events: readonly WriteEvent[]): void {
    // De klokstand bewaren is nuttig maar nooit dringend: gaat de database net
    // dicht (bij uitloggen, of bij het wisselen van account), dan mag dat geen
    // fout opleveren die verder niets met de app te maken heeft.
    void this.db.put('meta', { key: META_KEYS.clock, value: this.clock.state() }).catch(() => undefined);
    for (const listener of [...this.listeners]) listener(events);
  }

  private tick(): string {
    return this.clock.tick();
  }

  collection(entity: EntityName): Collection<StoredRecord> {
    switch (entity) {
      case 'teams': return this.teams as unknown as Collection<StoredRecord>;
      case 'players': return this.players as unknown as Collection<StoredRecord>;
      case 'exercises': return this.exercises as unknown as Collection<StoredRecord>;
      case 'trainings': return this.trainings as unknown as Collection<StoredRecord>;
      case 'series': return this.series as unknown as Collection<StoredRecord>;
      case 'groups': return this.groups as unknown as Collection<StoredRecord>;
    }
  }

  // ---------- Profiel en instellingen ----------

  /**
   * Wie deze trainer is. Het id ontstaat bij het eerste gebruik en blijft; de
   * naam komt op alles wat je deelt te staan, zodat een oefening in de bank van
   * iemand ís.
   */
  async profile(): Promise<Profile> {
    const stored = await this.db.get('meta', META_KEYS.profile);
    const value = stored?.value as Partial<Profile> | undefined;
    if (value && typeof value.id === 'string') {
      return { id: value.id, name: typeof value.name === 'string' ? value.name : 'Trainer' };
    }
    const profile: Profile = { id: newId(), name: 'Trainer' };
    await this.db.put('meta', { key: META_KEYS.profile, value: profile });
    return profile;
  }

  /**
   * Het account overnemen als profiel.
   *
   * Zodra er ingelogd wordt, hoort alles wat je maakt op naam van dat account
   * te staan en niet op een naam die per apparaat verschilt — anders is 'van
   * mij' op je telefoon iets anders dan op je laptop. Wat er al stond op naam
   * van het oude profiel gaat mee: dat is jouw werk, alleen had het nog geen
   * account.
   *
   * Levert op hoeveel records er zijn omgezet.
   */
  async adoptAccount(account: { id: string; name: string }): Promise<number> {
    const profile = await this.profile();
    if (profile.id === account.id && profile.name === account.name) return 0;

    const previous = profile.id;
    await this.db.put('meta', {
      key: META_KEYS.profile,
      value: { id: account.id, name: account.name },
    });

    let changed = 0;
    for (const entity of ENTITY_STORES) {
      const records = (await this.db.getAll(entity)) as unknown as {
        id: string;
        authorId?: string;
      }[];
      for (const record of records) {
        if (record.authorId !== previous) continue;
        await this.collection(entity).update(record.id, {
          authorId: account.id,
          authorName: account.name,
        } as never);
        changed++;
      }
    }

    this.emit([]);
    return changed;
  }

  /**
   * De naam van deze trainer. Leeg laten mag niet — er moet iets op een
   * gedeelde oefening staan — maar die terugval geldt pas op het moment van
   * bewaren. Deed hij dat bij elke toetsaanslag, dan kon je het veld nooit
   * leegmaken om er iets anders in te typen.
   */
  async setProfileName(name: string): Promise<Profile> {
    const profile = await this.profile();
    const updated = { ...profile, name: name.trim() || 'Trainer' };
    await this.db.put('meta', { key: META_KEYS.profile, value: updated });
    this.emit([]);
    return updated;
  }

  async settings(): Promise<AppSettings> {
    return loadDeviceSettings();
  }

  async saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const settings = saveDeviceSettings(patch);
    this.emit([]);
    return settings;
  }

  async cursor(scope: string): Promise<string | null> {
    const stored = await this.db.get('meta', META_KEYS.cursor(scope));
    return typeof stored?.value === 'string' ? stored.value : null;
  }

  async setCursor(scope: string, cursor: string | null): Promise<void> {
    await this.db.put('meta', { key: META_KEYS.cursor(scope), value: cursor });
  }

  // ---------- Outbox ----------

  async pending(limit = 200): Promise<OutboxEntry[]> {
    return this.db.getAll('outbox', undefined, limit);
  }

  async pendingCount(): Promise<number> {
    return this.db.count('outbox');
  }

  async clearOutbox(seqs: readonly number[]): Promise<void> {
    const tx = this.db.transaction('outbox', 'readwrite');
    await Promise.all(seqs.map((seq) => tx.store.delete(seq)));
    await tx.done;
  }

  async markFailed(seq: number, error: string): Promise<void> {
    const entry = await this.db.get('outbox', seq);
    if (!entry) return;
    await this.db.put('outbox', { ...entry, attempts: entry.attempts + 1, lastError: error });
  }

  /**
   * Wijzigingen van iemand anders toepassen.
   *
   * Last-writer-wins op de revisie, net als in de scouting-app: de hybride klok
   * sorteert overal hetzelfde, dus twee apparaten komen op dezelfde uitkomst.
   * Wat we binnenhalen gaat niet de outbox in — anders stuur je aan de afzender
   * terug wat je net van hem kreeg.
   */
  async applyRemote(
    changes: readonly { entity: EntityName; record: StoredRecord }[],
  ): Promise<{ applied: number; skipped: number }> {
    let applied = 0;
    let skipped = 0;
    const events: WriteEvent[] = [];

    for (const change of changes) {
      if (!isRecord(change.record) || !ENTITY_STORES.includes(change.entity)) {
        skipped++;
        continue;
      }
      this.clock.observe(change.record.rev);
      const current = await this.db.get(change.entity, change.record.id);
      if (current && compareRev(change.record.rev, current.rev) <= 0) {
        skipped++;
        continue;
      }
      await this.db.put(change.entity, change.record as never);
      events.push({ entity: change.entity, id: change.record.id, kind: 'put' });
      applied++;
    }

    if (events.length > 0) this.emit(events);
    return { applied, skipped };
  }
}

/**
 * Eén soort record: lezen, schrijven, en bij elke schrijfactie een nieuwe
 * revisie plus een regel in de outbox.
 */
export class Collection<T extends StoredRecord> {
  constructor(
    readonly entity: EntityName,
    private readonly db: TrainingDb,
    private readonly tick: () => string,
    private readonly stamp: () => string,
    private readonly emit: (events: readonly WriteEvent[]) => void,
  ) {}

  async all(includeDeleted = false): Promise<T[]> {
    const records = (await this.db.getAll(this.entity)) as unknown as T[];
    return includeDeleted ? records : records.filter((record) => record.deletedAt === null);
  }

  async get(id: string): Promise<T | null> {
    const record = (await this.db.get(this.entity, id)) as unknown as T | undefined;
    if (!record || record.deletedAt !== null) return null;
    return record;
  }

  async create(input: Omit<T, Managed> & { id?: string }): Promise<T> {
    const record = {
      ...(input as object),
      id: input.id ?? newId(),
      rev: this.tick(),
      updatedAt: this.stamp(),
      deletedAt: null,
    } as T;
    await this.write(record);
    return record;
  }

  async update(id: string, patch: Partial<Omit<T, Managed>>): Promise<T> {
    const current = (await this.db.get(this.entity, id)) as unknown as T | undefined;
    if (!current) throw new Error(`${this.entity} met id ${id} bestaat niet.`);
    const record = {
      ...current,
      ...(patch as object),
      rev: this.tick(),
      updatedAt: this.stamp(),
    } as T;
    await this.write(record);
    return record;
  }

  /** Een volledig record wegschrijven, bijvoorbeeld een gekopieerde oefening. */
  async put(record: T): Promise<T> {
    const stored = { ...record, rev: this.tick(), updatedAt: this.stamp() } as T;
    await this.write(stored);
    return stored;
  }

  /**
   * Verwijderen is een tombstone: het record blijft staan met een datum erin.
   * Alleen zo weet een ander apparaat dat het weg moet — een verdwenen rij
   * synchroniseert niet.
   */
  async remove(id: string): Promise<void> {
    const current = (await this.db.get(this.entity, id)) as unknown as T | undefined;
    if (!current || current.deletedAt !== null) return;
    const record = {
      ...current,
      rev: this.tick(),
      updatedAt: this.stamp(),
      deletedAt: this.stamp(),
    } as T;
    await this.write(record, 'delete');
  }

  private async write(record: T, kind: WriteEvent['kind'] = 'put'): Promise<void> {
    const tx = this.db.transaction([this.entity, 'outbox'], 'readwrite');
    await tx.objectStore(this.entity).put(record as never);
    await tx.objectStore('outbox').put({
      entity: this.entity,
      recordId: record.id,
      rev: record.rev,
      createdAt: this.stamp(),
      attempts: 0,
      lastError: null,
    });
    await tx.done;
    this.emit([{ entity: this.entity, id: record.id, kind }]);
  }
}

function isRecord(value: unknown): value is StoredRecord {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredRecord>;
  return typeof candidate.id === 'string' && typeof candidate.rev === 'string';
}

function isClockState(value: unknown): value is HlcState {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as Partial<HlcState>;
  return typeof candidate.millis === 'number' && typeof candidate.counter === 'number';
}
