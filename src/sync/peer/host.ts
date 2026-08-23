/**
 * De invoerkant van live meelezen.
 *
 * De host deelt wat hij vastlegt: elke geslaagde transactie gaat meteen naar de
 * gekoppelde apparaten, en wie later koppelt vraagt eerst op wat hij gemist
 * heeft. Valt de verbinding weg, dan merkt de invoerder daar niets van — hij
 * schrijft immers gewoon lokaal door.
 */

import type { ScoutingStore } from '../../db/store';
import type { WriteOp } from '../../db/mutations';
import { matchScopeOf } from '../../domain/scope';
import type { ChangeEnvelope } from '../types';
import { collectChanges, latestRev } from './changes';
import type { PeerChannel } from './channel';
import type { PeerMessage } from './protocol';

export interface PeerHostOptions {
  /** Alleen deze wedstrijd delen. */
  matchId?: string | null;
}

export interface PeerHostState {
  peers: number;
  lastSharedAt: string | null;
}

export class PeerHost {
  private matchId: string | null;
  private readonly channels = new Set<PeerChannel>();
  private readonly listeners = new Set<(state: PeerHostState) => void>();
  private unsubscribeStore: (() => void) | null = null;
  private lastSharedAt: string | null = null;

  constructor(
    private readonly store: ScoutingStore,
    options: PeerHostOptions = {},
  ) {
    this.matchId = options.matchId ?? null;
  }

  setMatchScope(matchId: string | null): void {
    this.matchId = matchId;
  }

  getState(): PeerHostState {
    return { peers: this.channels.size, lastSharedAt: this.lastSharedAt };
  }

  subscribe(listener: (state: PeerHostState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  /** Koppelt een apparaat; de teruggegeven functie ontkoppelt het weer. */
  attach(channel: PeerChannel): () => void {
    this.channels.add(channel);
    this.ensureStoreSubscription();

    // Bewust met een vangnet. `handle` praat met de opslag, en die kan dicht
    // zijn tegen de tijd dat een verzoek binnenkomt — het scherm werd net
    // gesloten, of de wedstrijd verlaten. Zonder deze catch blijft er een losse
    // afwijzing achter, en die trekt in een test de hele run onderuit en in de
    // browser de rest van de afhandeling.
    //
    // Herstellen valt er niets: de invoerder schrijft gewoon lokaal door, en de
    // meelezer haalt het bij de volgende koppeling opnieuw op. Dus laten we dit
    // apparaat los in plaats van te doen alsof het nog bediend wordt.
    const offMessage = channel.onMessage((message) => {
      void this.handle(channel, message).catch(() => detach());
    });
    const offClose = channel.onClose(() => detach());

    const detach = (): void => {
      offMessage();
      offClose();
      this.channels.delete(channel);
      if (this.channels.size === 0) this.stopStoreSubscription();
      this.emit();
    };

    this.emit();
    return detach;
  }

  stop(): void {
    for (const channel of [...this.channels]) channel.close();
    this.channels.clear();
    this.stopStoreSubscription();
    this.emit();
  }

  private ensureStoreSubscription(): void {
    if (this.unsubscribeStore) return;
    this.unsubscribeStore = this.store.subscribe((ops) => this.broadcastOps(ops));
  }

  private stopStoreSubscription(): void {
    this.unsubscribeStore?.();
    this.unsubscribeStore = null;
  }

  private broadcastOps(ops: readonly WriteOp[]): void {
    if (this.channels.size === 0 || ops.length === 0) return;

    const changes: ChangeEnvelope[] = ops
      .filter((op) => this.inScope(op))
      .map((op) => ({ entity: op.entity, record: op.record }));
    if (changes.length === 0) return;

    this.send({ t: 'changes', changes });
    this.lastSharedAt = new Date().toISOString();
    this.emit();
  }

  private inScope(op: WriteOp): boolean {
    if (this.matchId === null) return true;
    const scope = matchScopeOf(op.entity, op.record);
    // Teams en spelers horen bij geen enkele wedstrijd en gaan altijd mee.
    return scope === null || scope === this.matchId;
  }

  private async handle(channel: PeerChannel, message: PeerMessage): Promise<void> {
    switch (message.t) {
      case 'pull': {
        const changes = await collectChanges(
          this.store,
          message.matchId ?? this.matchId,
          message.cursor,
        );
        channel.send({
          t: 'pulled',
          id: message.id,
          changes,
          cursor: latestRev(changes) ?? message.cursor,
          hasMore: false,
        });
        return;
      }
      case 'push': {
        // Een meelezer stuurt niets, maar een tweede invoerder straks wel.
        await this.store.applyRemote(message.changes);
        channel.send({
          t: 'pushed',
          id: message.id,
          acceptedRevs: message.changes.map((change) => change.record.rev),
        });
        return;
      }
      default:
        return;
    }
  }

  private send(message: PeerMessage): void {
    for (const channel of this.channels) {
      if (channel.isOpen()) channel.send(message);
    }
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}
