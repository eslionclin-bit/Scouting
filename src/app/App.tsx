/**
 * Schermkeuze. Bewust geen router: de app heeft een handvol schermen en moet ook
 * vanaf het startscherm van een tablet openen, zonder URL-gedoe.
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { DeviceRole } from '../domain/types';
import { usePeerSession } from './hooks/usePeerSession';
import { DashboardScreen } from './screens/DashboardScreen';
import { HomeScreen } from './screens/HomeScreen';
import { NewMatchScreen } from './screens/NewMatchScreen';
import { OpponentScreen } from './screens/OpponentScreen';
import { ScoringScreen } from './screens/ScoringScreen';
import { ViewerScreen } from './screens/ViewerScreen';
import { useStore } from './StoreProvider';

type View =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'scoring'; matchId: string; role: 'scorer' | 'assistant' }
  | { name: 'viewer'; matchId: string }
  | { name: 'dashboard'; matchId: string }
  | { name: 'opponent'; opponentId: string };

export function App(): ReactElement {
  const store = useStore();
  const [view, setView] = useState<View>({ name: 'home' });
  const [restored, setRestored] = useState(false);

  /**
   * De koppeling hangt aan de wedstrijd en de rol, niet aan het scherm: kijkt de
   * invoerder even naar de cijfers, dan blijft de meelezer gewoon verbonden.
   */
  const [scope, setScope] = useState<{ matchId: string | null; role: DeviceRole }>({
    matchId: null,
    role: 'viewer',
  });
  const session = usePeerSession(scope.matchId, scope.role);

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
        // Ook de rolkeuze wordt hervat: een meelezer hoort niet opeens in het
        // invoerscherm te belanden nadat de tablet op slot is geweest.
        const stored = (await store.getMatchRole(matchId)) ?? 'scorer';
        setScope({ matchId, role: stored });
        setView(
          stored === 'viewer'
            ? { name: 'viewer', matchId }
            : { name: 'scoring', matchId, role: stored },
        );
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
          onCreated={(matchId) => {
            setScope({ matchId, role: 'scorer' });
            setView({ name: 'scoring', matchId, role: 'scorer' });
          }}
          onCancel={() => setView({ name: 'home' })}
        />
      );
    case 'scoring':
      return (
        <ScoringScreen
          matchId={view.matchId}
          session={session}
          role={view.role}
          onOpenDashboard={() => setView({ name: 'dashboard', matchId: view.matchId })}
          onExit={() => {
            void store.setActiveMatchId(null);
            setView({ name: 'home' });
          }}
        />
      );
    case 'viewer':
      return (
        <ViewerScreen
          matchId={view.matchId}
          session={session}
          onOpenDashboard={() => setView({ name: 'dashboard', matchId: view.matchId })}
          onSwitchToScoring={() => {
            void store.setMatchRole(view.matchId, 'scorer');
            setScope({ matchId: view.matchId, role: 'scorer' });
            setView({ name: 'scoring', matchId: view.matchId, role: 'scorer' });
          }}
          onExit={() => {
            void store.setActiveMatchId(null);
            setScope({ matchId: null, role: 'viewer' });
            setView({ name: 'home' });
          }}
        />
      );
    case 'dashboard':
      return (
        <DashboardScreen
          matchId={view.matchId}
          onOpenOpponent={(opponentId) => setView({ name: 'opponent', opponentId })}
          onExit={() => setView({ name: 'scoring', matchId: view.matchId, role: 'scorer' })}
        />
      );
    case 'opponent':
      return (
        <OpponentScreen
          opponentId={view.opponentId}
          onOpenMatch={(matchId) => setView({ name: 'dashboard', matchId })}
          onExit={() => setView({ name: 'home' })}
        />
      );
    case 'home':
    default:
      return (
        <HomeScreen
          session={session}
          onNewMatch={() => setView({ name: 'new' })}
          onOpenDashboard={(matchId) => setView({ name: 'dashboard', matchId })}
          onOpenOpponent={(opponentId) => setView({ name: 'opponent', opponentId })}
          onOpenMatch={(matchId, role) => {
            void store.setActiveMatchId(matchId);
            void store.setMatchRole(matchId, role);
            setScope({ matchId, role });
            setView(
              role === 'viewer'
                ? { name: 'viewer', matchId }
                : { name: 'scoring', matchId, role },
            );
          }}
        />
      );
  }
}
