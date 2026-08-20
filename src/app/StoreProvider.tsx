/**
 * Toegang tot de lokale opslag vanuit React.
 *
 * De store wordt één keer geopend en daarna gedeeld. Elke geslaagde transactie
 * verhoogt een versienummer; queries draaien opnieuw zodra dat verandert. Geen
 * polling, en ook geen handmatig 'vergeet niet te verversen' na elke actie.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, type ReactElement } from 'react';
import { ScoutingStore } from '../db/store';

interface StoreContextValue {
  store: ScoutingStore;
  version: number;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export interface StoreProviderProps {
  children: ReactNode;
  /** Een al geopende store meegeven; anders opent de provider er zelf een. */
  store?: ScoutingStore;
}

export function StoreProvider({ children, store: provided }: StoreProviderProps): ReactElement {
  const [store, setStore] = useState<ScoutingStore | null>(provided ?? null);
  const [error, setError] = useState<Error | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (provided) return;
    let cancelled = false;
    let opened: ScoutingStore | null = null;

    ScoutingStore.open()
      .then((instance) => {
        if (cancelled) {
          instance.close();
          return;
        }
        opened = instance;
        setStore(instance);
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause : new Error(String(cause)));
      });

    return () => {
      cancelled = true;
      opened?.close();
    };
  }, [provided]);

  useEffect(() => {
    if (!store) return;
    return store.subscribe(() => setVersion((current) => current + 1));
  }, [store]);

  const value = useMemo(() => (store ? { store, version } : null), [store, version]);

  if (error) {
    return (
      <div className="boot boot--error">
        <h1>De opslag kon niet worden geopend</h1>
        <p>{error.message}</p>
        <p>Werkt de browser in privémodus? Dan is IndexedDB soms geblokkeerd.</p>
      </div>
    );
  }
  if (!value) return <div className="boot">Bezig met openen…</div>;

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): ScoutingStore {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore() kan alleen binnen <StoreProvider> gebruikt worden.');
  return context.store;
}

function useStoreVersion(): number {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStoreVersion() kan alleen binnen <StoreProvider> gebruikt worden.');
  return context.version;
}

export interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
}

/**
 * Leest uit de store en herhaalt dat na elke wijziging. `deps` werkt als bij
 * `useEffect`: alles wat de query anders maakt, hoort erin.
 */
export function useQuery<T>(
  run: (store: ScoutingStore) => Promise<T>,
  deps: readonly unknown[],
): QueryResult<T> {
  const store = useStore();
  const version = useStoreVersion();
  const [state, setState] = useState<QueryResult<T>>({
    data: undefined,
    loading: true,
    error: null,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps -- deps zijn expres van de aanroeper
  const runner = useCallback(run, deps);

  useEffect(() => {
    let cancelled = false;
    runner(store)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({
          data: undefined,
          loading: false,
          error: cause instanceof Error ? cause : new Error(String(cause)),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [runner, store, version]);

  return state;
}
