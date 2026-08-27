/**
 * Transport zonder server: alles blijft in het geheugen.
 *
 * Twee dingen doet dit. In tests speelt het de tegenpartij, zodat de engine
 * echt gedraaid wordt in plaats van nagebootst. En in de app zelf is het de
 * stille stand: is er geen adres van een deelserver ingevuld, dan komt er hier
 * niets aan en gebeurt er niets — precies wat 'alles blijft op dit apparaat'
 * hoort te betekenen.
 */

import type {
  ChangeEnvelope,
  PullRequest,
  PullResponse,
  PushRequest,
  PushResponse,
  Transport,
} from './types';

interface Stored extends ChangeEnvelope {
  seq: number;
}

export class LoopbackTransport implements Transport {
  readonly name = 'loopback';

  private readonly scopes = new Map<string, Stored[]>();
  private seq = 0;

  async push(request: PushRequest): Promise<PushResponse> {
    const key = keyOf(request);
    const bucket = this.scopes.get(key) ?? [];
    for (const change of request.changes) {
      const existing = bucket.findIndex(
        (stored) => stored.entity === change.entity && stored.record.id === change.record.id,
      );
      if (existing >= 0) bucket.splice(existing, 1);
      bucket.push({ ...change, seq: ++this.seq });
    }
    this.scopes.set(key, bucket);
    return { acceptedRevs: request.changes.map((change) => change.record.rev) };
  }

  async pull(request: PullRequest): Promise<PullResponse> {
    const bucket = this.scopes.get(keyOf(request)) ?? [];
    const since = Number(request.cursor ?? '0');
    const batch = request.batch ?? 200;
    const changes = bucket.filter((stored) => stored.seq > since).slice(0, batch);
    const last = changes[changes.length - 1];
    return {
      changes: changes.map(({ entity, record }) => ({ entity, record })),
      cursor: String(last?.seq ?? since),
      hasMore: changes.length === batch,
      total: bucket.length,
    };
  }

  /** Alleen voor tests: wat er op dit moment in een scope staat. */
  contents(key: string): ChangeEnvelope[] {
    return (this.scopes.get(key) ?? []).map(({ entity, record }) => ({ entity, record }));
  }
}

function keyOf(request: { scope: { kind: string; code: string | null } }): string {
  return request.scope.kind === 'public' ? 'public' : `group:${request.scope.code ?? ''}`;
}
