/**
 * Online koppeling: het transport naar onze eigen server.
 *
 * Dit is een transport zoals elk ander — de engine erboven weet niet of hij met
 * een tablet in dezelfde zaal praat of met een server in West-Europa. Dat is de
 * reden dat er hier zo weinig staat: de outbox, het opnieuw proberen en het
 * samenvoegen op revisie zitten allemaal al in de laag erboven.
 *
 * De ploegcode gaat mee in elke aanroep en staat alleen op het apparaat: niet
 * in de code, niet in de repository, en op de server alleen als hash. Wat de
 * server ervan maakt staat in `server/cloud/worker.js`.
 */

import { matchScopeOf } from '../domain/scope';
import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncTransport,
} from './types';

export interface CloudConfig {
  /** Adres van de sync-server. */
  url: string;
  /** De ploegcode; alleen op dit apparaat opgeslagen. */
  teamCode: string;
}

/** Zoveel wijzigingen per keer ophalen. */
const BATCH = 200;

/** Na deze tijd geven we het op — een hangende sync mag de app niet ophouden. */
const TIMEOUT_MS = 15_000;

export interface CloudPullResponse extends PullResponse {
  /** Hoeveel records er in totaal onder deze code staan. */
  total?: number;
}

export class CloudTransport implements SyncTransport {
  readonly name = 'cloud';

  constructor(private readonly config: CloudConfig) {}

  isAvailable(): boolean {
    const online = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine;
    return online ?? true;
  }

  async push(request: PushRequest): Promise<PushResponse> {
    if (request.changes.length === 0) return { acceptedRevs: [] };

    const result = await this.call<{ acceptedRevs: string[] }>('push', {
      teamCode: this.config.teamCode,
      changes: request.changes.map((change) => ({
        entity: change.entity,
        record: change.record,
        // Apart meegestuurd zodat meelezen met één wedstrijd niet de hele
        // geschiedenis hoeft op te halen. Dezelfde afleiding als de outbox
        // gebruikt, zodat beide kanten hetzelfde bedoelen.
        matchId: matchScopeOf(change.entity, change.record),
      })),
    });
    return { acceptedRevs: result.acceptedRevs ?? [] };
  }

  async pull(request: PullRequest): Promise<CloudPullResponse> {
    const result = await this.call<{
      changes: PullResponse['changes'];
      cursor: string;
      hasMore: boolean;
      total: number;
    }>('pull', {
      teamCode: this.config.teamCode,
      cursor: request.cursor ?? '0',
      matchId: request.matchId ?? null,
      batch: BATCH,
    });

    return {
      changes: result.changes ?? [],
      cursor: String(result.cursor ?? '0'),
      hasMore: result.hasMore === true,
      total: Number(result.total ?? 0),
    };
  }

  private async call<T>(path: 'push' | 'pull', body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${this.config.url.replace(/\/$/, '')}/sync/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        // De ploegcode is het enige dat een mens hier fout kan doen; die krijgt
        // dus een zin in plaats van een foutcode.
        if (response.status === 400 && payload?.error) {
          throw new SyncCodeError(payload.error);
        }
        throw new Error(payload?.error ?? `Synchroniseren mislukt (${response.status}).`);
      }

      return payload as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Een code die niet deugt is geen storing: opnieuw proberen helpt niet. */
export class SyncCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncCodeError';
  }
}
