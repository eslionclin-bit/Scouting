/**
 * Schermkeuze. Bewust geen router: de app heeft een handvol schermen en moet ook
 * vanaf het startscherm van een tablet openen, zonder URL-gedoe.
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import type { DeviceRole } from '../domain/types';
import { usePeerSession } from './hooks/usePeerSession';
import { DashboardScreen } from './screens/DashboardScreen';
import { HomeScreen } from './screens/HomeScreen';
import { NewMatchScreen } from './screens/NewMatchScreen';
import { OpponentScreen } from './screens/OpponentScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { ReferenceScreen } from './screens/ReferenceScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ScoringScreen } from './screens/ScoringScreen';
import { TeamScreen } from './screens/TeamScreen';
import { CoachScreen } from './screens/CoachScreen';
import { useStore } from './StoreProvider';
import { takeCouplingCode } from '../sync/cloudConfig';

type View =
  | { name: 'home' }
  | { name: 'new' }
  | { name: 'scoring'; matchId: string; role: 'scorer' | 'assistant' }
  | { name: 'viewer'; matchId: string }
  | { name: 'dashboard'; matchId: string }
  | { name: 'opponent'; opponentId: string }
  | { name: 'player'; playerId: string }
  | { name: 'reference' }
  | { name: 'settings' }
  | { name: 'team' };

export function App(): ReactElement {
  const store = useStore();
  /**
   * Schermen als stapel, zodat de terugknop van de browser (en het veegbaar
   * terug van een tablet) binnen de app blijft in plaats van de website te
   * verlaten. Elke stap zet ook een stap in de geschiedenis van de browser; die
   * twee blijven zo gelijk lopen.
   */
  const [stack, setStack] = useState<View[]>([{ name: 'home' }]);
  const view = stack[stack.length - 1] ?? { name: 'home' };
  const [restored, setRestored] = useState(false);

  const go = useCallback((next: View): void => {
    setStack((current) => [...current, next]);
    globalThis.history?.pushState({ app: true }, '');
  }, []);

  /**
   * Hetzelfde, maar het huidige scherm blijft niet achter in de stapel.
   *
   * Voor schermen die af zijn zodra ze hun werk hebben gedaan: het formulier
   * voor een nieuwe wedstrijd is klaar op het moment dat de wedstrijd bestaat.
   * Zonder dit kom je bij het verlaten van de wedstrijd terug in dat formulier,
   * en dat is nergens goed voor.
   */
  const replace = useCallback((next: View): void => {
    setStack((current) => [...current.slice(0, -1), next]);
  }, []);

  /** Terug binnen de app: via de geschiedenis, zodat beide kanten kloppen. */
  const back = useCallback((): void => {
    if (globalThis.history?.state?.app) globalThis.history.back();
    else setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  useEffect(() => {
    const onPopState = (): void => {
      setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));
    };
    globalThis.addEventListener?.('popstate', onPopState);
    return () => globalThis.removeEventListener?.('popstate', onPopState);
  }, []);

  /**
   * De koppeling hangt aan de wedstrijd en de rol, niet aan het scherm: kijkt de
   * invoerder even naar de cijfers, dan blijft de meelezer gewoon verbonden.
   */
  const [scope, setScope] = useState<{ matchId: string | null; role: DeviceRole }>({
    matchId: null,
    role: 'viewer',
  });
  const session = usePeerSession(scope.matchId, scope.role);

  /**
   * Gekoppeld via een link.
   *
   * Dit is de hele koppelprocedure voor een tweede apparaat: je tikt op een
   * link die iemand je stuurt, en klaar. Geen code overtikken — dat ging op een
   * telefoon stil mis, want het klavier verandert er iets aan en de server kan
   * niet zien dat dat niet de bedoeling was.
   */
  const [coupled, setCoupled] = useState(false);

  // Een tablet die tijdens de wedstrijd op slot gaat of de app afsluit, komt
  // terug in de wedstrijd waar hij mee bezig was.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Eerst de link: staat daar een ploegcode in, dan hoort dit apparaat er
      // vanaf nu bij, nog voor er een scherm getekend wordt.
      const fromLink = takeCouplingCode();
      if (fromLink) {
        await store.setTeamCode(fromLink);
        if (!cancelled) setCoupled(true);
      }

      const matchId = await store.getActiveMatchId();
      if (cancelled) {
        return;
      }
      if (matchId && (await store.matches.get(matchId))) {
        // Ook de rolkeuze wordt hervat: een meelezer hoort niet opeens in het
        // invoerscherm te belanden nadat de tablet op slot is geweest.
        const stored = (await store.getMatchRole(matchId)) ?? 'scorer';
        setScope({ matchId, role: stored });
        setStack([
          { name: 'home' },
          stored === 'viewer'
            ? { name: 'viewer', matchId }
            : { name: 'scoring', matchId, role: stored },
        ]);
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
            replace({ name: 'scoring', matchId, role: 'scorer' });
          }}
          onCancel={back}
        />
      );
    case 'scoring':
      return (
        <ScoringScreen
          matchId={view.matchId}
          session={session}
          role={view.role}
          onOpenDashboard={() => go({ name: 'dashboard', matchId: view.matchId })}
          onExit={() => {
            void store.setActiveMatchId(null);
            back();
          }}
        />
      );
    case 'viewer':
      return (
        <CoachScreen
          matchId={view.matchId}
          session={session}
          onOpenDashboard={() => go({ name: 'dashboard', matchId: view.matchId })}
          onOpenOpponent={(opponentId) => go({ name: 'opponent', opponentId })}
          onSwitchToScoring={() => {
            void store.setMatchRole(view.matchId, 'scorer');
            setScope({ matchId: view.matchId, role: 'scorer' });
            go({ name: 'scoring', matchId: view.matchId, role: 'scorer' });
          }}
          onExit={() => {
            void store.setActiveMatchId(null);
            setScope({ matchId: null, role: 'viewer' });
            back();
          }}
        />
      );
    case 'dashboard':
      return (
        <DashboardScreen
          matchId={view.matchId}
          onOpenOpponent={(opponentId) => go({ name: 'opponent', opponentId })}
          onOpenPlayer={(playerId) => go({ name: 'player', playerId })}
          onExit={back}
        />
      );
    case 'reference':
      return <ReferenceScreen onExit={back} />;
    case 'settings':
      return (
        <SettingsScreen onExit={back} onOpenReference={() => go({ name: 'reference' })} />
      );
    case 'team':
      return (
        <TeamScreen
          onOpenMatch={(matchId) => go({ name: 'dashboard', matchId })}
          onOpenPlayer={(playerId) => go({ name: 'player', playerId })}
          onExit={back}
        />
      );
    case 'player':
      return (
        <PlayerScreen
          playerId={view.playerId}
          onOpenMatch={(matchId) => go({ name: 'dashboard', matchId })}
          onExit={back}
        />
      );
    case 'opponent':
      return (
        <OpponentScreen
          opponentId={view.opponentId}
          onOpenMatch={(matchId) => go({ name: 'dashboard', matchId })}
          onExit={back}
        />
      );
    case 'home':
    default:
      return (
        <HomeScreen
          justCoupled={coupled}
          onDismissCoupled={() => setCoupled(false)}
          session={session}
          onNewMatch={() => go({ name: 'new' })}
          onOpenDashboard={(matchId) => go({ name: 'dashboard', matchId })}
          onOpenOpponent={(opponentId) => go({ name: 'opponent', opponentId })}
          onOpenTeam={() => go({ name: 'team' })}
          onOpenSettings={() => go({ name: 'settings' })}
          onOpenMatch={(matchId, role) => {
            void store.setActiveMatchId(matchId);
            void store.setMatchRole(matchId, role);
            setScope({ matchId, role });
            go(role === 'viewer' ? { name: 'viewer', matchId } : { name: 'scoring', matchId, role });
          }}
        />
      );
  }
}
