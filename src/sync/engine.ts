/**
 * Sync-engine.
 *
 * Uitgangspunt uit de projectbrief: synchronisatie mag nooit blokkeren. Deze
 * engine gooit daarom niets naar buiten — mislukt een ronde, dan blijft alles in
 * de outbox staan, loopt de wachttijd op, en gaat de invoer gewoon door.
 *
 * De engine kent maar één transport tegelijk, maar het maakt niet uit welk:
 * lokaal netwerk (live meelezen) of cloud. De logica is identiek.
 */

import type { ScoutingStore } from '../db/store';
import { META_KEYS } from '../db/schema';
import {
  ackOutbox,
  markOutboxFailure,
  peekOutbox,
  pendingCount,
  toEnvelopes,
} from './outbox';
import type { SyncState, SyncTransport } from './types';

export interface SyncEngineOptions {
  batchSize?: number;
  /** Hoe vaak we het uit onszelf proberen als er iets in de outbox staat. */
  intervalMs?: number;
  /** Eerste wachttijd na een mislukking; verdubbelt tot `maxBackoffMs`. */
  retryBaseMs?: number;
  maxBackoffMs?: number;
  /** Beperkt de sync tot één wedstrijd (live meelezen). */
  matchId?: string | null;
  /** Hoe lang wachten na een eigen wijziging voordat we hem doorsturen. */
  pushDelayMs?: number;
  now?: () => number;
}

export type SyncListener = (state: SyncState) => void;

export class SyncEngine {
  private state: SyncState = {
    status: 'idle',
    pending: 0,
    lastSyncAt: null,
    lastError: null,
    failures: 0,
  };

  private readonly listeners = new Set<SyncListener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private soonTimer: ReturnType<typeof setTimeout> | null = null;
  private unsubscribeStore: (() => void) | null = null;
  private running = false;
  /**
   * Gestopt betekent: niets meer aanraken.
   *
   * Zonder deze vlag kan een tik die al onderweg was alsnog de database
   * aanspreken nadat die gesloten is — dan valt de app over een fout die er
   * niet toe doet. Dat gebeurde in de praktijk bij het verlaten van een
   * wedstrijd, en in de tests als een unhandled rejection ná de laatste test.
   */
  private stopped = false;
  private nextAttemptAt = 0;
  private matchId: string | null;
  private readonly options: Required<Omit<SyncEngineOptions, 'matchId'>>;
  private readonly onOnline = () => {
    // Verbinding terug: meteen proberen, niet wachten op de volgende tik.
    this.nextAttemptAt = 0;
    void this.syncNow();
  };

  constructor(
    private readonly store: ScoutingStore,
    private readonly transport: SyncTransport,
    options: SyncEngineOptions = {},
  ) {
    this.matchId = options.matchId ?? null;
    this.options = {
      batchSize: options.batchSize ?? 100,
      intervalMs: options.intervalMs ?? 15_000,
      retryBaseMs: options.retryBaseMs ?? 2_000,
      maxBackoffMs: options.maxBackoffMs ?? 60_000,
      pushDelayMs: options.pushDelayMs ?? 250,
      now: options.now ?? (() => Date.now()),
    };
  }

  getState(): SyncState {
    return { ...this.state };
  }

  subscribe(listener: SyncListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  /** Beperk de sync tot deze wedstrijd; null is alles. */
  setMatchScope(matchId: string | null): void {
    this.matchId = matchId;
  }

  start(): void {
    if (this.timer) return;
    this.stopped = false;
    this.timer = setInterval(() => void this.syncNow(), this.options.intervalMs);
    globalThis.addEventListener?.('online', this.onOnline);

    // Wachten op de volgende tik zou live meelezen traag maken; een eigen
    // wijziging gaat daarom vrijwel meteen mee. Binnengekomen wijzigingen
    // tellen niet: die hoeven niet teruggestuurd te worden.
    this.unsubscribeStore = this.store.subscribe((ops) => {
      if (ops.some((op) => !op.skipOutbox)) this.scheduleSoon();
    });

    void this.syncNow();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.soonTimer) clearTimeout(this.soonTimer);
    this.soonTimer = null;
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
    globalThis.removeEventListener?.('online', this.onOnline);
  }

  private scheduleSoon(): void {
    if (this.soonTimer) return;
    this.soonTimer = setTimeout(() => {
      this.soonTimer = null;
      void this.syncNow({ force: true });
    }, this.options.pushDelayMs);
  }

  /**
   * Eén ronde: eerst duwen wat wij hebben, dan halen wat er ligt.
   * Werpt nooit; de uitkomst staat in de teruggegeven status.
   */
  async syncNow(options: { force?: boolean } = {}): Promise<SyncState> {
    if (this.stopped || this.running) return this.getState();
    if (!options.force && this.options.now() < this.nextAttemptAt) return this.getState();

    if (!(await this.isOnline())) {
      this.update({ status: 'offline', pending: await this.pending() });
      return this.getState();
    }

    this.running = true;
    this.update({ status: 'syncing' });
    try {
      await this.pushOnce();
      await this.pullOnce();
      const lastSyncAt = new Date(this.options.now()).toISOString();
      await this.store.setMeta(META_KEYS.lastSyncAt, lastSyncAt);
      this.nextAttemptAt = 0;
      this.update({
        status: 'idle',
        pending: await this.pending(),
        lastSyncAt,
        lastError: null,
        failures: 0,
      });
    } catch (error) {
      const failures = this.state.failures + 1;
      // Exponentieel afbouwen: een sporthal zonder wifi hoeft niet elke seconde
      // opnieuw teleurgesteld te worden.
      const backoff = Math.min(
        this.options.retryBaseMs * 2 ** (failures - 1),
        this.options.maxBackoffMs,
      );
      this.nextAttemptAt = this.options.now() + backoff;
      this.update({
        status: 'error',
        pending: await this.pending(),
        lastError: error instanceof Error ? error.message : String(error),
        failures,
      });
    } finally {
      this.running = false;
    }
    return this.getState();
  }

  /**
   * Het aantal wachtende wijzigingen, en nooit een fout.
   *
   * Deze telling staat op elk pad in `syncNow` — ook op het foutpad. Als de
   * database net gesloten is, mag juist dát geen nieuwe fout opleveren; dan is
   * het antwoord simpelweg onbekend en houden we wat we hadden.
   */
  private async pending(): Promise<number> {
    if (this.stopped) return this.state.pending;
    try {
      return await pendingCount(this.store.db);
    } catch {
      return this.state.pending;
    }
  }

  private async pushOnce(): Promise<void> {
    const entries = await peekOutbox(this.store.db, {
      limit: this.options.batchSize,
      matchId: this.matchId,
    });
    if (entries.length === 0) return;

    try {
      const response = await this.transport.push({
        deviceId: this.store.deviceId,
        changes: toEnvelopes(entries),
      });
      const accepted = new Set(response.acceptedRevs);
      const done = entries
        .filter((entry) => accepted.has(entry.rev))
        .map((entry) => entry.seq)
        .filter((seq): seq is number => seq != null);
      await ackOutbox(this.store.db, done);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markOutboxFailure(
        this.store.db,
        entries.map((entry) => entry.seq).filter((seq): seq is number => seq != null),
        message,
      );
      throw error;
    }
  }

  private async pullOnce(): Promise<void> {
    let cursor = (await this.store.getMeta<string>(META_KEYS.syncCursor)) ?? null;
    let guard = 0;

    while (guard++ < 50) {
      const response = await this.transport.pull({
        deviceId: this.store.deviceId,
        cursor,
        matchId: this.matchId,
      });
      if (response.changes.length > 0) {
        await this.store.applyRemote(response.changes);
      }
      cursor = response.cursor;
      await this.store.setMeta(META_KEYS.syncCursor, cursor);
      if (!response.hasMore) break;
    }
  }

  private async isOnline(): Promise<boolean> {
    if (this.transport.isAvailable) return this.transport.isAvailable();
    const navigatorOnline = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine;
    return navigatorOnline ?? true;
  }

  private update(patch: Partial<SyncState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.getState());
  }
}
