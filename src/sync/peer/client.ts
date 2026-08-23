/**
 * De meeleeskant.
 *
 * `PeerClient` is gewoon een `SyncTransport`, dus de bestaande sync-engine doet
 * het werk: opnieuw proberen, afbouwen bij mislukking, nooit blokkeren. Wat er
 * bovenop komt is dat wijzigingen ook ongevraagd binnen kunnen komen — dat is
 * precies wat meelezen live maakt.
 */

import type { ScoutingStore } from '../../db/store';
import { compareRev } from '../../domain/clock';
import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncTransport,
} from '../types';
import { latestRev } from './changes';
import type { PeerChannel } from './channel';
import type { PeerMessage } from './protocol';

export interface PeerClientOptions {
  matchId?: string | null;
  /** Hoe lang op antwoord wachten voordat we het als mislukt beschouwen. */
  timeoutMs?: number;
}

interface Pending {
  resolve: (message: PeerMessage) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class PeerClient implements SyncTransport {
  readonly name = 'peer';

  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Set<(at: string) => void>();
  private readonly offMessage: () => void;
  private readonly offClose: () => void;
  private counter = 0;
  /** Hoogste revisie die we via een ongevraagde wijziging al hebben gezien. */
  private seenRev: string | null = null;

  constructor(
    private readonly store: ScoutingStore,
    private readonly channel: PeerChannel,
    private readonly options: PeerClientOptions = {},
  ) {
    // Zie de host: `handle` praat met de opslag en die kan dicht zijn tegen de
    // tijd dat er iets binnenkomt. Een losse afwijzing helpt dan niemand; de
    // openstaande verzoeken horen een fout te krijgen die ze kunnen tonen.
    this.offMessage = channel.onMessage((message) => {
      void this.handle(message).catch((cause: unknown) => {
        this.failAll(cause instanceof Error ? cause : new Error(String(cause)));
      });
    });
    this.offClose = channel.onClose(() => this.failAll(new Error('Verbinding verbroken.')));
  }

  isAvailable(): boolean {
    return this.channel.isOpen();
  }

  /** Melding dat er zojuist iets is binnengekomen; voor de statusregel op het scherm. */
  onUpdate(listener: (at: string) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async pull(request: PullRequest): Promise<PullResponse> {
    // Wat al via een ongevraagde wijziging binnenkwam, hoeft niet opnieuw.
    const cursor = newest(request.cursor, this.seenRev);
    const response = await this.request({
      t: 'pull',
      id: this.nextId(),
      cursor,
      matchId: request.matchId ?? this.options.matchId ?? null,
    });
    if (response.t !== 'pulled') throw new Error('Onverwacht antwoord op een pull.');

    return {
      changes: response.changes,
      cursor: newest(response.cursor, cursor),
      hasMore: response.hasMore,
    };
  }

  async push(request: PushRequest): Promise<PushResponse> {
    const response = await this.request({
      t: 'push',
      id: this.nextId(),
      changes: request.changes,
    });
    if (response.t !== 'pushed') throw new Error('Onverwacht antwoord op een push.');
    return { acceptedRevs: response.acceptedRevs };
  }

  close(): void {
    this.offMessage();
    this.offClose();
    this.failAll(new Error('Verbinding gesloten.'));
  }

  private async handle(message: PeerMessage): Promise<void> {
    if (message.t === 'pulled' || message.t === 'pushed') {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      pending.resolve(message);
      return;
    }

    if (message.t === 'changes') {
      await this.store.applyRemote(message.changes);
      this.seenRev = newest(this.seenRev, latestRev(message.changes));
      const at = new Date().toISOString();
      for (const listener of this.listeners) listener(at);
    }
  }

  private request(message: PeerMessage & { id: string }): Promise<PeerMessage> {
    if (!this.channel.isOpen()) return Promise.reject(new Error('Geen verbinding.'));

    return new Promise<PeerMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new Error('Geen antwoord van het andere apparaat.'));
      }, this.options.timeoutMs ?? 10_000);

      this.pending.set(message.id, { resolve, reject, timer });
      try {
        this.channel.send(message);
      } catch (cause) {
        clearTimeout(timer);
        this.pending.delete(message.id);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      }
    });
  }

  private failAll(error: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private nextId(): string {
    return `${this.store.deviceId}-${this.counter++}`;
  }
}

function newest(a: string | null, b: string | null): string | null {
  if (a === null) return b;
  if (b === null) return a;
  return compareRev(a, b) >= 0 ? a : b;
}
