/**
 * Loopback-hub: een sync-tegenpartij in het geheugen.
 *
 * Hiermee is het volledige sync-pad te draaien zonder server — nodig voor de
 * tests, en tegelijk de vorm die de latere relay over het lokale netwerk (§6)
 * moet nabootsen: een append-only log met een cursor per apparaat.
 */

import { matchScopeOf } from '../domain/scope';
import type { ChangeEnvelope, PullRequest, PullResponse, PushRequest, PushResponse, SyncTransport } from './types';

interface LogEntry {
  seq: number;
  deviceId: string;
  matchId: string | null;
  envelope: ChangeEnvelope;
}

export class LoopbackHub {
  private readonly log: LogEntry[] = [];
  private seq = 0;
  /** Simuleert een wegvallende verbinding: alles blijft dan in de outbox staan. */
  online = true;

  push(request: PushRequest): PushResponse {
    if (!this.online) throw new Error('Geen verbinding met de hub.');
    const acceptedRevs: string[] = [];
    for (const envelope of request.changes) {
      this.log.push({
        seq: ++this.seq,
        deviceId: request.deviceId,
        matchId: matchScopeOf(envelope.entity, envelope.record),
        envelope,
      });
      acceptedRevs.push(envelope.record.rev);
    }
    return { acceptedRevs };
  }

  pull(request: PullRequest, batchSize = 200): PullResponse {
    if (!this.online) throw new Error('Geen verbinding met de hub.');
    const from = request.cursor ? Number(request.cursor) : 0;
    const matches = this.log.filter(
      (entry) =>
        entry.seq > from &&
        entry.deviceId !== request.deviceId &&
        (request.matchId == null || entry.matchId == null || entry.matchId === request.matchId),
    );
    const batch = matches.slice(0, batchSize);
    // De cursor loopt door over álle regels, ook de eigen en de weggefilterde:
    // anders zou een apparaat zijn eigen wijzigingen eeuwig opnieuw overwegen.
    const lastSeq = batch.at(-1)?.seq ?? this.log.at(-1)?.seq ?? from;
    return {
      changes: batch.map((entry) => entry.envelope),
      cursor: String(lastSeq),
      hasMore: matches.length > batch.length,
    };
  }

  /** Transport voor één apparaat; meerdere apparaten delen dezelfde hub. */
  transport(name = 'loopback'): SyncTransport {
    return {
      name,
      isAvailable: () => this.online,
      push: async (request) => this.push(request),
      pull: async (request) => this.pull(request),
    };
  }

  size(): number {
    return this.log.length;
  }
}
