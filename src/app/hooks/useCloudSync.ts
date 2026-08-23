/**
 * De online koppeling aan- en uitzetten.
 *
 * Eén engine voor het hele apparaat, niet één per scherm: de wedstrijd die
 * gisteren is ingevoerd moet ook weglopen terwijl je vandaag naar de cijfers
 * kijkt. Hij loopt zolang de app open is, en hij loopt alleen als er een
 * ploegcode is ingevuld — zonder code is er niets om mee te praten.
 *
 * Valt de verbinding weg, dan gebeurt er niets bijzonders: de outbox loopt vol,
 * de invoer gaat door, en zodra er weer bereik is loopt hij leeg. Dat is het
 * hele punt van offline-first, en het is de reden dat dit bestand zo kort is.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SyncEngine } from '../../sync/engine';
import { CloudTransport } from '../../sync/cloud';

import type { SyncState } from '../../sync/types';
import { useStore } from '../StoreProvider';

export interface CloudSync {
  /** Is er een serveradres bekend om mee te koppelen? */
  available: boolean;
  /** Draait de koppeling nu? */
  connected: boolean;
  state: SyncState;
  /** Nu een ronde draaien, zonder te wachten op de klok. */
  syncNow: () => Promise<void>;
  /**
   * Staat er al iets onder deze code?
   *
   * De server kent geen accounts: de ploeg ís de code. Een typefout levert dus
   * geen foutmelding op maar een andere, lege ploeg — en dat is het enige
   * geval dat de server niet zelf kan zien. Vandaar dit getal: staat het op nul
   * terwijl je verwacht dat er wedstrijden zijn, dan klopt de code niet.
   */
  onServer: number | null;
}

const IDLE: SyncState = {
  status: 'idle',
  pending: 0,
  lastSyncAt: null,
  lastError: null,
  failures: 0,
};

export function useCloudSync(teamCode: string | null, url: string | null): CloudSync {
  const store = useStore();
  const [state, setState] = useState<SyncState>(IDLE);
  const [onServer, setOnServer] = useState<number | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const transportRef = useRef<CloudTransport | null>(null);

  /**
   * Zelf een ronde starten, en meteen opnieuw tellen wat er op de server staat.
   *
   * Dat tweede is waar het om gaat: zonder dat getal is 'het werkt niet' niet te
   * onderscheiden van 'het is nog niet klaar', en dat verschil bepaalt volledig
   * wat je eraan moet doen.
   */
  const syncNow = useCallback(async (): Promise<void> => {
    await engineRef.current?.syncNow({ force: true });
    const transport = transportRef.current;
    if (!transport) return;
    try {
      const response = await transport.pull({ deviceId: store.deviceId, cursor: '0' });
      setOnServer(response.total ?? null);
    } catch {
      setOnServer(null);
    }
  }, [store]);
  const available = (url ?? '').length > 0;
  const active = available && teamCode !== null && teamCode.length > 0;

  useEffect(() => {
    if (!active || teamCode === null || url === null) {
      setState(IDLE);
      setOnServer(null);
      return;
    }

    const transport = new CloudTransport({ url, teamCode });
    transportRef.current = transport;
    let cancelled = false;

    // Eén keer kijken wat er onder deze code staat. Dat is puur om een typefout
    // in de code te kunnen benoemen; de sync zelf loopt langs de engine.
    void transport
      .pull({ deviceId: store.deviceId, cursor: '0' })
      .then((response) => {
        if (!cancelled) setOnServer(response.total ?? null);
      })
      .catch(() => {
        if (!cancelled) setOnServer(null);
      });

    const engine = new SyncEngine(
      store,
      transport,
      // Rustiger dan de koppeling in de zaal: dit is bijwerken, geen meelezen.
      { intervalMs: 30_000 },
    );
    engineRef.current = engine;
    const unsubscribe = engine.subscribe(setState);
    engine.start();

    return () => {
      cancelled = true;
      unsubscribe();
      engine.stop();
      engineRef.current = null;
      transportRef.current = null;
    };
  }, [store, active, teamCode, url]);

  return { available, connected: active, state, onServer, syncNow };
}
