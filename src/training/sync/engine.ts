/**
 * De deel-engine: één ronde versturen en ophalen.
 *
 * Alles eromheen is expres saai gehouden. Er is geen achtergrondproces dat
 * dingen bijhoudt: de app roept `syncOnce()` aan bij het openen, na een
 * wijziging en als je op 'nu delen' drukt. Mislukt het, dan blijft de wijziging
 * gewoon in de outbox staan en gebeurt er verder niets — de app is zonder
 * verbinding volledig bruikbaar, dus een mislukte deelronde mag nooit iets
 * blokkeren of een melding opdringen.
 */

import { ShareAuthError } from './cloud';
import type { TrainingStore } from '../db/store';
import type { EntityName, Group, StoredRecord } from '../domain/types';
import { scopesFor, subscribedScopes } from './scopes';
import type { ChangeEnvelope, ScopeRef, Transport } from './types';

export interface SyncReport {
  pushed: number;
  received: number;
  /** Wijzigingen die nergens heen hoefden en dus uit de outbox konden. */
  local: number;
  scopes: string[];
  errors: string[];
  /**
   * De server zegt dat we niet (meer) ingelogd zijn. Anders dan de andere
   * fouten helpt opnieuw proberen hier niet: er moet iemand een wachtwoord
   * intikken, en de app hoort het inlogscherm te tonen.
   */
  authExpired: boolean;
}

const BATCH = 200;

export class ShareEngine {
  constructor(
    private readonly store: TrainingStore,
    private readonly transport: Transport,
  ) {}

  async syncOnce(): Promise<SyncReport> {
    const report: SyncReport = {
      pushed: 0, received: 0, local: 0, scopes: [], errors: [], authExpired: false,
    };
    const available = (await this.transport.isAvailable?.()) ?? true;
    if (!available) {
      report.errors.push('Geen verbinding.');
      return report;
    }

    const groups = await this.store.groups.all();
    const settings = await this.store.settings();

    await this.push(groups, report);
    for (const scope of subscribedScopes(groups, settings.followPublic)) {
      report.scopes.push(scope.label);
      await this.pull(scope, report);
    }
    return report;
  }

  /**
   * De outbox opschonen zonder iets te versturen.
   *
   * Nodig omdat verreweg de meeste wijzigingen nergens heen hoeven: wie niets
   * deelt, schrijft alleen privé-records. Zonder dit zou de outbox een seizoen
   * lang volstromen en zou de app melden dat er honderden dingen 'nog verstuurd
   * moeten worden' terwijl er niets te versturen valt.
   *
   * Levert op wat er wél de deur uit moet, gebundeld per scope.
   */
  async prune(groups?: readonly Group[]): Promise<{
    cleared: number;
    buckets: Map<string, { scope: ScopeRef; changes: ChangeEnvelope[]; seqs: number[] }>;
  }> {
    if (this.store.isClosed) return { cleared: 0, buckets: new Map() };
    const known = groups ?? (await this.store.groups.all());
    const pending = await this.store.pending(BATCH);
    const buckets = new Map<string, { scope: ScopeRef; changes: ChangeEnvelope[]; seqs: number[] }>();
    const doneLocally: number[] = [];

    for (const entry of pending) {
      if (entry.seq === undefined) continue;
      const record = (await this.store.db.get(entry.entity, entry.recordId)) as StoredRecord | undefined;
      if (!record || record.rev !== entry.rev) {
        // Er is inmiddels een nieuwere versie; die heeft zijn eigen outboxregel.
        doneLocally.push(entry.seq);
        continue;
      }
      const scopes = scopesFor(record, known);
      if (scopes.length === 0) {
        doneLocally.push(entry.seq);
        continue;
      }
      // Per scope verzamelen, want elke scope is een aparte aanroep. Een oefening
      // die met twee groepen gedeeld is, gaat dus twee keer de deur uit.
      for (const scope of scopes) {
        const bucket = buckets.get(scope.key) ?? { scope, changes: [], seqs: [] };
        bucket.changes.push({ entity: entry.entity as EntityName, record });
        bucket.seqs.push(entry.seq);
        buckets.set(scope.key, bucket);
      }
    }

    if (doneLocally.length > 0) await this.store.clearOutbox(doneLocally);
    return { cleared: doneLocally.length, buckets };
  }

  /** Alles versturen wat in de outbox staat en ergens heen moet. */
  private async push(groups: readonly Group[], report: SyncReport): Promise<void> {
    const { cleared, buckets: perScope } = await this.prune(groups);
    report.local += cleared;

    for (const bucket of perScope.values()) {
      try {
        const response = await this.transport.push({ scope: bucket.scope, changes: bucket.changes });
        const accepted = new Set(response.acceptedRevs);
        const done = bucket.changes
          .map((change, index) => (accepted.has(change.record.rev) ? bucket.seqs[index] : undefined))
          .filter((seq): seq is number => seq !== undefined);
        await this.store.clearOutbox(done);
        report.pushed += done.length;
      } catch (error) {
        if (error instanceof ShareAuthError) report.authExpired = true;
        report.errors.push(message(error));
        for (const seq of bucket.seqs) await this.store.markFailed(seq, message(error));
      }
    }
  }

  /** Ophalen wat er sinds de vorige keer in een scope bij kwam. */
  private async pull(scope: ScopeRef, report: SyncReport): Promise<void> {
    try {
      let cursor = await this.store.cursor(scope.key);
      for (let round = 0; round < 20; round++) {
        const response = await this.transport.pull({ scope, cursor, batch: BATCH });
        const result = await this.store.applyRemote(response.changes);
        report.received += result.applied;
        cursor = response.cursor;
        await this.store.setCursor(scope.key, cursor);
        if (!response.hasMore) break;
      }
    } catch (error) {
      if (error instanceof ShareAuthError) report.authExpired = true;
      report.errors.push(message(error));
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
