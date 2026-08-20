/**
 * Schermkeuze. Bewust geen router: de app heeft drie schermen en moet ook als
 * los bestand vanaf het startscherm van een tablet openen, zonder URL-gedoe.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { NewMatchScreen } from './screens/NewMatchScreen';
import { ScoringScreen } from './screens/ScoringScreen';
import { useStore } from './StoreProvider';

type View = { name: 'home' } | { name: 'new' } | { name: 'scoring'; matchId: string };

export function App(): ReactElement {
  const store = useStore();
  const [view, setView] = useState<View>({ name: 'home' });
  const [restored, setRestored] = useState(false);

  // Een tablet die tijdens de wedstrijd op slot gaat of de app afsluit, komt
  // terug in de wedstrijd waar hij mee bezig was.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const matchId = await store.getActiveMatchId();
      if (cancelled) {
        return;
      }
      if (matchId && (await store.matches.get(matchId))) {
        setView({ name: 'scoring', matchId });
      }
      setRestored(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  if (!restored) return <div className="boot">Even geduld…</div>;

  switch (view.name) {
    case 'new':
      return (
        <NewMatchScreen
          onCreated={(matchId) => setView({ name: 'scoring', matchId })}
          onCancel={() => setView({ name: 'home' })}
        />
      );
    case 'scoring':
      return (
        <ScoringScreen
          matchId={view.matchId}
          onExit={() => {
            void store.setActiveMatchId(null);
            setView({ name: 'home' });
          }}
        />
      );
    case 'home':
    default:
      return (
        <HomeScreen
          onNewMatch={() => setView({ name: 'new' })}
          onOpenMatch={(matchId) => {
            void store.setActiveMatchId(matchId);
            setView({ name: 'scoring', matchId });
          }}
        />
      );
  }
}
