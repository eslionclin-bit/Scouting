/**
 * `ScoutingStore` is de enige ingang tot de lokale opslag.
 *
 * De UI (die later komt) praat nooit rechtstreeks met IndexedDB: hij vraagt
 * repositories op via deze store. Daardoor blijft er één plek waar transacties,
 * revisies en de outbox geregeld worden.
 */

import { HybridClock, type HlcState } from '../domain/clock';
import { getDeviceId } from '../domain/ids';
import { withDefaults, type AppSettings } from '../domain/settings';
import type { DeviceRole } from '../domain/types';
import { applyRemoteChanges, type MergeResult } from '../sync/merge';
import type { ChangeEnvelope } from '../sync/types';
import { openScoutingDb, type ScoutingDb, type OpenOptions } from './database';
import { Mutex } from './mutex';
import type { WriteContext, WriteOp } from './mutations';
import { META_KEYS } from './schema';
import { ActionRepository } from './repositories/actions';
import { ImportRepository } from './repositories/imports';
import { LineupRepository, SubstitutionRepository } from './repositories/lineups';
import { MatchRepository } from './repositories/matches';
import { PlayerRepository } from './repositories/players';
import { RallyRepository } from './repositories/rallies';
import { SetRepository } from './repositories/sets';
import { TeamRepository } from './repositories/teams';

export interface StoreOptions extends OpenOptions {
  deviceId?: string;
  /** Injecteerbaar voor tests; standaard de wandklok. */
  now?: () => Date;
}

export class ScoutingStore {
  readonly teams: TeamRepository;
  readonly players: PlayerRepository;
  readonly matches: MatchRepository;
  readonly sets: SetRepository;
  readonly rallies: RallyRepository;
  readonly actions: ActionRepository;
  readonly lineups: LineupRepository;
  readonly substitutions: SubstitutionRepository;
  /** Wedstrijden uit scoutbestanden van anderen, als referentiemateriaal. */
  readonly imports: ImportRepository;

  private readonly listeners = new Set<(ops: readonly WriteOp[]) => void>();

  private constructor(private readonly ctx: WriteContext) {
    ctx.onCommit = (ops) => this.emit(ops);
    this.teams = new TeamRepository(ctx);
    this.players = new PlayerRepository(ctx);
    this.matches = new MatchRepository(ctx);
    this.sets = new SetRepository(ctx);
    this.rallies = new RallyRepository(ctx, this.sets);
    this.actions = new ActionRepository(ctx, this.rallies, this.players);
    this.lineups = new LineupRepository(ctx);
    this.substitutions = new SubstitutionRepository(ctx);
    this.imports = new ImportRepository(ctx, this.teams, this.players);
  }

  static async open(options: StoreOptions = {}): Promise<ScoutingStore> {
    const db = await openScoutingDb(options);
    const deviceId = options.deviceId ?? getDeviceId();
    const clock = new HybridClock(deviceId);

    // De klokstand overleeft het sluiten van de app: anders zou een herstart
    // revisies kunnen produceren die 'ouder' zijn dan wat al is opgeslagen.
    const stored = await db.get('meta', META_KEYS.clock);
    if (stored && isClockState(stored.value)) clock.restore(stored.value);

    return new ScoutingStore({
      db,
      clock,
      deviceId,
      lock: new Mutex(),
      now: options.now ?? (() => new Date()),
    });
  }

  /**
   * Meelezen met wijzigingen. De UI hoeft niet te pollen: elke geslaagde
   * transactie — lokaal ingevoerd of binnengekomen via sync — meldt zich hier.
   */
  subscribe(listener: (ops: readonly WriteOp[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(ops: readonly WriteOp[] = []): void {
    for (const listener of this.listeners) listener(ops);
  }

  get db(): ScoutingDb {
    return this.ctx.db;
  }

  get deviceId(): string {
    return this.ctx.deviceId;
  }

  /** Schrijfcontext voor de sync-laag; niet bedoeld voor de UI. */
  get writeContext(): WriteContext {
    return this.ctx;
  }

  /** Voegt wijzigingen van een ander apparaat samen met de lokale data. */
  async applyRemote(changes: readonly ChangeEnvelope[]): Promise<MergeResult> {
    return applyRemoteChanges(this.ctx, changes);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const entry = await this.ctx.db.get('meta', key);
    return entry?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.ctx.db.put('meta', { key, value });
    this.emit();
  }

  /** Rolkeuze bij het starten van een wedstrijd: invoeren of meelezen (§6). */
  async getDeviceRole(): Promise<DeviceRole> {
    return (await this.getMeta<DeviceRole>(META_KEYS.deviceRole)) ?? 'scorer';
  }

  async setDeviceRole(role: DeviceRole): Promise<void> {
    await this.setMeta(META_KEYS.deviceRole, role);
  }

  /** Rolkeuze geldt per wedstrijd: dezelfde tablet kan de ene keer invoeren en de andere keer meelezen. */
  async getMatchRole(matchId: string): Promise<DeviceRole | null> {
    return (await this.getMeta<DeviceRole>(`${META_KEYS.deviceRole}.${matchId}`)) ?? null;
  }

  async setMatchRole(matchId: string, role: DeviceRole): Promise<void> {
    await this.setMeta(`${META_KEYS.deviceRole}.${matchId}`, role);
  }

  /** Voorkeuren van dit apparaat; ontbrekende velden vallen terug op de standaard. */
  async getSettings(): Promise<AppSettings> {
    return withDefaults(await this.getMeta<Partial<AppSettings>>(META_KEYS.settings));
  }

  async updateSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
    const next = { ...(await this.getSettings()), ...patch };
    await this.setMeta(META_KEYS.settings, next);
    return next;
  }

  async getActiveMatchId(): Promise<string | null> {
    return (await this.getMeta<string>(META_KEYS.activeMatchId)) ?? null;
  }

  async setActiveMatchId(matchId: string | null): Promise<void> {
    await this.setMeta(META_KEYS.activeMatchId, matchId);
  }

  close(): void {
    this.ctx.db.close();
  }
}

function isClockState(value: unknown): value is HlcState {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as Partial<HlcState>;
  return typeof candidate.millis === 'number' && typeof candidate.counter === 'number';
}
