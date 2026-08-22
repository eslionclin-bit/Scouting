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

import { useEffect, useState } from 'react';
import { SyncEngine } from '../../sync/engine';
import { SupabaseTransport } from '../../sync/supabase';
import { cloudProject, isCloudConfigured } from '../../sync/cloudConfig';
import type { SyncState } from '../../sync/types';
import { useStore } from '../StoreProvider';

export interface CloudSync {
  /** Is er überhaupt een project ingebouwd om mee te koppelen? */
  available: boolean;
  /** Draait de koppeling nu? */
  connected: boolean;
  state: SyncState;
}

const IDLE: SyncState = {
  status: 'idle',
  pending: 0,
  lastSyncAt: null,
  lastError: null,
  failures: 0,
};

export function useCloudSync(teamCode: string | null): CloudSync {
  const store = useStore();
  const [state, setState] = useState<SyncState>(IDLE);
  const available = isCloudConfigured();
  const active = available && teamCode !== null && teamCode.length > 0;

  useEffect(() => {
    if (!active || teamCode === null) {
      setState(IDLE);
      return;
    }

    const engine = new SyncEngine(
      store,
      new SupabaseTransport({ ...cloudProject(), teamCode }),
      // Rustiger dan de koppeling in de zaal: dit is bijwerken, geen meelezen.
      { intervalMs: 30_000 },
    );
    const unsubscribe = engine.subscribe(setState);
    engine.start();

    return () => {
      unsubscribe();
      engine.stop();
    };
  }, [store, active, teamCode]);

  return { available, connected: active, state };
}
