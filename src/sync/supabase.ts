/**
 * Online koppeling via Supabase.
 *
 * Dit is een transport zoals elk ander: de engine erboven weet niet of hij met
 * een tablet in dezelfde zaal praat of met een server in Frankfurt. Dat is de
 * reden dat er hier zo weinig staat — de outbox, het opnieuw proberen, het
 * samenvoegen op revisie, dat zit allemaal al in de laag erboven.
 *
 * Twee keuzes die uitleg verdienen:
 *
 *  - **Geen SDK.** Twee `fetch`-aanroepen naar twee functies; de Supabase-client
 *    zou honderd kilobyte toevoegen aan een app die op een tablet in een zaal
 *    moet laden. De publieke anon-sleutel mag in de gebouwde app staan, want op
 *    de server mag die sleutel helemaal niets: alles loopt via functies die om
 *    de ploegcode vragen (zie `server/supabase/schema.sql`).
 *  - **De ploegcode staat alleen op het apparaat.** Hij komt niet in de code en
 *    niet in de repository; je vult hem één keer in per tablet.
 */

import { matchScopeOf } from '../domain/scope';
import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  SyncTransport,
} from './types';

export interface SupabaseConfig {
  /** https://<project>.supabase.co */
  url: string;
  /** De publieke anon-sleutel van het project. */
  anonKey: string;
  /** De ploegcode; alleen op dit apparaat opgeslagen. */
  teamCode: string;
}

/** Zoveel wijzigingen per keer ophalen. */
const BATCH = 200;

/** Na deze tijd geven we het op — een hangende sync mag de app niet ophouden. */
const TIMEOUT_MS = 15_000;

export class SupabaseTransport implements SyncTransport {
  readonly name = 'supabase';

  constructor(private readonly config: SupabaseConfig) {}

  isAvailable(): boolean {
    const online = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine;
    return online ?? true;
  }

  async push(request: PushRequest): Promise<PushResponse> {
    if (request.changes.length === 0) return { acceptedRevs: [] };

    const result = await this.rpc<{ acceptedRevs: string[] }>('sync_push', {
      team_code: this.config.teamCode,
      changes: request.changes.map((change) => ({
        entity: change.entity,
        record: change.record,
        // De server bewaart hem apart, zodat meelezen met één wedstrijd kan
        // zonder de hele geschiedenis op te halen. Dezelfde afleiding als de
        // outbox gebruikt, zodat beide kanten hetzelfde bedoelen.
        matchId: matchScopeOf(change.entity, change.record),
      })),
    });
    return { acceptedRevs: result.acceptedRevs ?? [] };
  }

  async pull(request: PullRequest): Promise<PullResponse> {
    const result = await this.rpc<{
      changes: PullResponse['changes'];
      cursor: number;
      hasMore: boolean;
    }>('sync_pull', {
      team_code: this.config.teamCode,
      cursor_seq: Number(request.cursor ?? 0) || 0,
      match_filter: request.matchId ?? null,
      batch: BATCH,
    });

    return {
      changes: result.changes ?? [],
      cursor: String(result.cursor ?? 0),
      hasMore: result.hasMore === true,
    };
  }

  private async rpc<T>(fn: string, body: unknown): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(`${this.config.url.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: this.config.anonKey,
          authorization: `Bearer ${this.config.anonKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        // De ploegcode is het enige dat een mens hier fout kan doen, dus die
        // krijgt een zin in plaats van een foutcode.
        if (text.includes('onbekende ploegcode')) {
          throw new SyncAuthError('De ploegcode klopt niet. Controleer hem onder Instellingen.');
        }
        throw new Error(`Synchroniseren mislukt (${response.status}). ${text.slice(0, 200)}`);
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Een verkeerde ploegcode is geen storing: opnieuw proberen helpt niet. */
export class SyncAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncAuthError';
  }
}

