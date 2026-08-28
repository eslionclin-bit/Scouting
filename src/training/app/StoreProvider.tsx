/**
 * Eén plek waar de opslag opengaat en waar de app zijn gegevens vandaan haalt.
 *
 * Alles wordt in het geheugen gehouden en na elke schrijfactie opnieuw
 * geladen. Dat mag hier: een seizoen trainingen is een paar honderd records,
 * en het scheelt overal in de schermen het bijhouden van losse laadtoestanden.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { TrainingStore, DEFAULT_SETTINGS, type AppSettings } from '../db/store';
import { fullLibrary } from '../bank';
import { useAuth } from '../auth/AuthProvider';
import { AUTH_EXPIRED_EVENT } from '../auth/events';
import { loadSession } from '../auth/session';
import { databaseFor } from './deviceSettings';
import { ShareEngine } from '../sync/engine';
import { CloudTransport, ShareAuthError } from '../sync/cloud';
import { LoopbackTransport } from '../sync/loopback';
import { resolveServerUrl } from '../sync/serverUrl';
import type { SyncState } from '../sync/types';
import type {
  Exercise,
  Group,
  Player,
  Profile,
  Series,
  Team,
  Training,
} from '../domain/types';

export interface Data {
  teams: Team[];
  players: Player[];
  /** Alleen wat er in de database staat, zonder de ingebouwde bank. */
  exercises: Exercise[];
  /** De hele bank: ingebouwd plus eigen plus binnengekomen. */
  library: Exercise[];
  trainings: Training[];
  series: Series[];
  groups: Group[];
  profile: Profile;
  settings: AppSettings;
}

interface StoreContextValue {
  store: TrainingStore;
  data: Data;
  reload: () => Promise<void>;
  sync: SyncState;
  syncNow: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const EMPTY: Data = {
  teams: [],
  players: [],
  exercises: [],
  library: [],
  trainings: [],
  series: [],
  groups: [],
  profile: { id: '', name: 'Trainer' },
  settings: DEFAULT_SETTINGS,
};

export interface StoreProviderProps {
  children: ReactNode;
  /** Een al geopende store meegeven; anders opent de provider er zelf een. */
  store?: TrainingStore;
}

export function StoreProvider({ children, store: provided }: StoreProviderProps) {
  // Elk account heeft zijn eigen opslag op dit apparaat. Zo ziet de tweede
  // trainer die op een gedeelde laptop inlogt niets van de eerste — een inlog
  // zonder gescheiden opslag zou een halve deur zijn.
  const { account } = useAuth();
  // Op het id en de naam, niet op het account zelf: dat object wordt vervangen
  // zodra de server bevestigt wie je bent, en op die identiteit meeluisteren zou
  // de database dichtdoen en weer openen terwijl er nog schrijfacties lopen.
  const accountId = account?.id ?? null;
  const accountName = account?.name ?? null;
  const databaseName = databaseFor(accountId);
  const [store, setStore] = useState<TrainingStore | null>(provided ?? null);
  const [data, setData] = useState<Data>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [sync, setSync] = useState<SyncState>({
    status: 'off',
    pending: 0,
    lastSyncAt: null,
    lastError: null,
    received: 0,
  });
  const syncing = useRef(false);

  useEffect(() => {
    if (provided) return;
    let cancelled = false;
    let opened: TrainingStore | null = null;

    setStore(null);
    setData(EMPTY);

    TrainingStore.open({ name: databaseName })
      .then(async (instance) => {
        if (cancelled) {
          instance.close();
          return;
        }
        opened = instance;
        // Alles wat je maakt hoort op naam van je account te staan, en niet op
        // een naam die per apparaat verschilt.
        if (accountId && accountName) {
          await instance.adoptAccount({ id: accountId, name: accountName });
        }
        if (cancelled) return;
        setStore(instance);
      })
      .catch((cause: unknown) => {
        // Een fout van een opening die we zelf hebben afgebroken is geen storing:
        // die database gaat toch dicht. Alleen wat er misgaat bij de opening die
        // nog telt, hoort op het scherm te komen.
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [accountId, accountName, databaseName, provided]);

  // Wordt de store van buiten meegegeven (in tests, en bij een tweede
  // apparaat-scherm), dan opent hij hier niet en moet het account er alsnog op
  // gezet worden.
  useEffect(() => {
    if (!provided || !accountId || !accountName) return;
    void provided.adoptAccount({ id: accountId, name: accountName });
  }, [accountId, accountName, provided]);

  const load = useCallback(async (target: TrainingStore): Promise<Data> => {
    const [teams, players, exercises, trainings, series, groups, profile, settings] =
      await Promise.all([
        target.teams.all(),
        target.players.all(),
        target.exercises.all(),
        target.trainings.all(),
        target.series.all(),
        target.groups.all(),
        target.profile(),
        target.settings(),
      ]);
    return {
      teams,
      players,
      exercises,
      library: fullLibrary(exercises),
      trainings,
      series,
      groups,
      profile,
      settings,
    };
  }, []);

  const reload = useCallback(async () => {
    if (!store) return;
    const next = await load(store);
    setData(next);
    // Opruimen wat nergens heen hoeft. Zonder dit zou de outbox bij wie niets
    // deelt een seizoen lang volstromen, en zou de app melden dat er van alles
    // klaarstaat om verstuurd te worden terwijl er niets te versturen is.
    await new ShareEngine(store, new LoopbackTransport()).prune(next.groups);
    const pending = await store.pendingCount();
    setSync((state) => ({ ...state, pending }));
  }, [load, store]);

  useEffect(() => {
    if (!store) return;
    void reload();
    return store.subscribe(() => {
      void reload();
    });
  }, [reload, store]);

  const syncNow = useCallback(async () => {
    if (!store || syncing.current) return;
    const settings = await store.settings();
    const url = resolveServerUrl(settings);
    if (!url) {
      setSync((state) => ({ ...state, status: 'off' }));
      return;
    }

    // Zonder sessie valt er niets te delen: de server neemt niets aan van wie
    // niet is ingelogd, en het heeft geen zin om dat elke keer te proberen.
    const session = loadSession();
    if (!session) {
      setSync((state) => ({ ...state, status: 'off' }));
      return;
    }

    syncing.current = true;
    setSync((state) => ({ ...state, status: 'syncing' }));
    try {
      const transport = new CloudTransport(url, () => loadSession()?.token ?? null);
      const report = await new ShareEngine(store, transport).syncOnce();
      if (report.authExpired) dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      setSync({
        status: report.errors.length > 0 ? 'error' : 'idle',
        pending: await store.pendingCount(),
        lastSyncAt: new Date().toISOString(),
        lastError: report.errors[0] ?? null,
        received: report.received,
      });
      if (report.received > 0) await reload();
    } catch (cause) {
      if (cause instanceof ShareAuthError) dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
      setSync((state) => ({
        ...state,
        status: 'error',
        lastError: cause instanceof Error ? cause.message : String(cause),
      }));
    } finally {
      syncing.current = false;
    }
  }, [reload, store]);

  // Delen gebeurt bij het openen en daarna als er iets te versturen is. Geen
  // achtergrondlus: de app hoort zonder verbinding niets te merken.
  useEffect(() => {
    if (!store) return;
    void syncNow();
  }, [store, syncNow]);

  const value = useMemo<StoreContextValue | null>(
    () => (store ? { store, data, reload, sync, syncNow } : null),
    [data, reload, store, sync, syncNow],
  );

  if (error) {
    return (
      <div className="boot boot--error">
        <h1>De app kan niet opstarten</h1>
        <p>{error}</p>
        <p>
          Meestal komt dit doordat de browser opslag blokkeert. Sta cookies en opslag toe voor deze
          pagina, of open hem niet in een privévenster.
        </p>
      </div>
    );
  }

  if (!value) return <div className="boot">Bezig met openen…</div>;

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreContextValue {
  const value = useContext(StoreContext);
  if (!value) throw new Error('useStore buiten een StoreProvider gebruikt.');
  return value;
}

/** Kortere ingang voor schermen die alleen gegevens nodig hebben. */
export function useData(): Data {
  return useStore().data;
}
