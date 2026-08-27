/**
 * Het transport naar de deelserver.
 *
 * Hier staat weinig, en dat hoort zo: de outbox, het opnieuw proberen en het
 * samenvoegen op revisie zitten in de laag erboven. De groepscode gaat mee in
 * elke aanroep en staat alleen op dit apparaat; wat de server ermee doet staat
 * in `server/training/worker.js` — hij bewaart hem niet, alleen een hash.
 */

import type {
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  Transport,
} from './types';

/** Een hangende deelronde mag de app niet ophouden. */
const TIMEOUT_MS = 15_000;

export class CloudTransport implements Transport {
  readonly name = 'cloud';

  constructor(private readonly url: string) {}

  isAvailable(): boolean {
    const online = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine;
    return (online ?? true) && this.url.trim() !== '';
  }

  async push(request: PushRequest): Promise<PushResponse> {
    if (request.changes.length === 0) return { acceptedRevs: [] };
    const result = await this.call<{ acceptedRevs?: string[] }>('push', {
      scope: request.scope.kind,
      code: request.scope.code,
      changes: request.changes,
    });
    return { acceptedRevs: result.acceptedRevs ?? [] };
  }

  async pull(request: PullRequest): Promise<PullResponse> {
    const result = await this.call<Partial<PullResponse> & { cursor?: string }>('pull', {
      scope: request.scope.kind,
      code: request.scope.code,
      cursor: request.cursor ?? '0',
      batch: request.batch ?? 200,
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
      const response = await fetch(`${this.url.replace(/\/$/, '')}/share/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        if (response.status === 400 && payload?.error) throw new ShareCodeError(payload.error);
        throw new Error(payload?.error ?? `Delen mislukt (${response.status}).`);
      }
      return payload as T;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** Een code die niet deugt is geen storing: opnieuw proberen helpt niet. */
export class ShareCodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShareCodeError';
  }
}
