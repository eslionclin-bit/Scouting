/**
 * Scherm A — rally-invoer.
 *
 * Alles wat tijdens een wedstrijd nodig is staat op één scherm: de keten van
 * deze rally bovenin, de invoervolgorde in het midden, en afronden plus undo
 * onderaan. Undo is geen extraatje: bij live invoer gaat er gegarandeerd iets
 * mis, en dan moet het in één tik recht te zetten zijn.
 */

import { useEffect, useMemo, useReducer, useState, type ReactElement } from 'react';
import { LineupSheet } from '../components/LineupSheet';
import { PairingSheet } from '../components/PairingSheet';
import { ProtocolSheet } from '../components/ProtocolSheet';
import { ActionTypePicker } from '../components/ActionTypePicker';
import { CourtPicker } from '../components/CourtPicker';
import { PlayerGrid } from '../components/PlayerGrid';
import { QualityButtons } from '../components/QualityButtons';
import { RallyChain } from '../components/RallyChain';
import { Toasts } from '../components/Toasts';
import type { PeerSession } from '../hooks/usePeerSession';
import { useToasts } from '../hooks/useToasts';
import { useQuery, useStore } from '../StoreProvider';
import {
  entryReducer,
  initialEntryState,
  isReadyToCommit,
  needsZoneStep,
  toActionDraft,
} from '../entry/entryReducer';
import { isTerminalAction, requiresZoneFrom } from '../../domain/rules';
import { TEAM_SIDE_LABELS } from '../../domain/protocol';
import type { Player, Quality, TeamSide, Zone } from '../../domain/types';

export interface ScoringScreenProps {
  matchId: string;
  session: PeerSession;
  onExit: () => void;
  onOpenDashboard: () => void;
}

export function ScoringScreen({
  matchId,
  session,
  onExit,
  onOpenDashboard,
}: ScoringScreenProps): ReactElement {
  const store = useStore();
  const { messages, push, dismiss } = useToasts();
  const [entry, dispatch] = useReducer(entryReducer, initialEntryState('us'));
  const [explain, setExplain] = useState<Quality | null>(null);
  const [showLineup, setShowLineup] = useState(false);
  const [showPairing, setShowPairing] = useState(false);

  const { data, error } = useQuery(
    async (instance) => {
      const match = await instance.matches.require(matchId);
      const [ownTeam, opponent, ownPlayers, opponentPlayers, sets] = await Promise.all([
        instance.teams.get(match.ownTeamId),
        instance.teams.get(match.opponentTeamId),
        instance.players.listByTeam(match.ownTeamId),
        instance.players.listByTeam(match.opponentTeamId),
        instance.sets.listByMatch(match.id),
      ]);

      const set = sets.filter((item) => item.status === 'live').at(-1) ?? sets.at(-1);
      if (!set) return { match, ownTeam, opponent, ownPlayers, opponentPlayers, sets, set: null };

      // De invoer heeft altijd een openstaande rally nodig; die maken we hier
      // aan zodat de invoerder er nooit zelf aan hoeft te denken.
      const rally = await instance.rallies.start({ setId: set.id });
      const [actions, lineup, substitutions] = await Promise.all([
        instance.actions.listByRally(rally.id),
        instance.lineups.forSet(set.id),
        instance.substitutions.listBySet(set.id),
      ]);
      return {
        match,
        ownTeam,
        opponent,
        ownPlayers,
        opponentPlayers,
        sets,
        set,
        rally,
        actions,
        lineup,
        substitutions,
      };
    },
    [matchId],
  );

  const players: readonly Player[] =
    (entry.team === 'us' ? data?.ownPlayers : data?.opponentPlayers) ?? [];

  const playersById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const player of [...(data?.ownPlayers ?? []), ...(data?.opponentPlayers ?? [])]) {
      map.set(player.id, player);
    }
    return map;
  }, [data?.ownPlayers, data?.opponentPlayers]);

  // Bij de tegenstander zonder spelerslijst heeft de spelerstap geen inhoud.
  useEffect(() => {
    if (entry.step === 'player' && entry.team === 'them' && players.length === 0) {
      dispatch({ kind: 'player', playerId: null });
    }
  }, [entry.step, entry.team, players.length]);

  if (error) return <ErrorState message={error.message} onExit={onExit} />;
  if (!data) return <div className="boot">Wedstrijd laden…</div>;
  if (!data.set || !data.rally) return <ErrorState message="Deze wedstrijd heeft nog geen set." onExit={onExit} />;

  const { match, opponent, set, sets, rally, actions } = data;

  async function commitAction(quality: Quality): Promise<void> {
    const draft = toActionDraft(entry, quality);
    if (!draft || !data?.rally) return;

    try {
      const { action, warnings } = await store.actions.append({ rallyId: data.rally.id, ...draft });
      for (const warning of warnings) push('warning', warning.message);
      dispatch({ kind: 'committed', last: action });

      // Fout, ace of kill: de rally is volgens het protocol voorbij. Meteen
      // afronden scheelt een tik, en de uitslag is niet voor twee uitleg vatbaar.
      if (isTerminalAction(action)) {
        const { rally: completed } = await store.rallies.complete(data.rally.id);
        const next = await store.rallies.start({ setId: data.set!.id });
        dispatch({ kind: 'rallyStarted', servingTeam: next.servingTeam });
        push('info', `Punt ${completed.wonBy === 'us' ? 'voor ons' : 'voor de tegenstander'}.`);
      }
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function finishRally(side: TeamSide): Promise<void> {
    if (!data?.rally || !data.set) return;
    try {
      await store.rallies.complete(data.rally.id, side);
      const next = await store.rallies.start({ setId: data.set.id });
      dispatch({ kind: 'rallyStarted', servingTeam: next.servingTeam });
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  /**
   * Undo werkt over de rallygrens heen: is de huidige rally nog leeg, dan wordt
   * de vorige rally heropend en dáár de laatste actie teruggedraaid. Anders zou
   * een misklik vlak na een punt niet meer te herstellen zijn.
   */
  async function undoLastAction(): Promise<void> {
    if (!data?.rally || !data.set) return;
    const current = await store.actions.listByRally(data.rally.id);
    if (current.length > 0) {
      await store.actions.undoLast(data.rally.id);
      dispatch({ kind: 'reset' });
      return;
    }

    const previous = (await store.rallies.listBySet(data.set.id))
      .filter((item) => item.wonBy !== null)
      .at(-1);
    if (!previous) return;

    await store.rallies.remove(data.rally.id);
    await store.rallies.reopen(previous.id);
    await store.actions.undoLast(previous.id);
    dispatch({ kind: 'reset' });
  }

  async function undoRally(): Promise<void> {
    if (!data?.rally || !data.set) return;
    const current = await store.actions.listByRally(data.rally.id);
    if (current.length === 0) {
      const previous = (await store.rallies.listBySet(data.set.id))
        .filter((item) => item.wonBy !== null)
        .at(-1);
      if (previous) await store.rallies.remove(previous.id);
    } else {
      await store.rallies.remove(data.rally.id);
      await store.rallies.start({ setId: data.set.id });
    }

    dispatch({ kind: 'reset' });
  }

  async function saveLineup(positions: Record<Zone, string | null>): Promise<void> {
    if (!data?.set) return;
    try {
      await store.lineups.set({ setId: data.set.id, positions });
      setShowLineup(false);
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function substitute(playerOutId: string, playerInId: string): Promise<void> {
    if (!data?.rally) return;
    try {
      await store.substitutions.add({ rallyId: data.rally.id, playerOutId, playerInId });
      setShowLineup(false);
      push('info', 'Wissel vastgelegd vanaf deze rally.');
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function nextSet(): Promise<void> {
    if (!data?.set) return;
    try {
      await store.sets.finish(data.set.id);
      await store.sets.start({
        matchId,
        // Teams beginnen om beurten met serveren in een nieuwe set.
        startingServe: data.set.startingServe === 'us' ? 'them' : 'us',
      });
      dispatch({ kind: 'reset' });
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  const zoneRequired = entry.type ? requiresZoneFrom(entry.type) : false;
  const showZone = entry.type ? needsZoneStep(entry.type) : false;

  return (
    <div className="scoring">
      <header className="topbar">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Wedstrijden
        </button>

        <div className="topbar__score">
          <span className="topbar__set">Set {set.setNumber}</span>
          <strong className="topbar__points">
            {set.pointsUs} <span>–</span> {set.pointsThem}
          </strong>
          <span className="topbar__meta">
            {match.homeAway === 'home' ? 'thuis' : 'uit'} tegen {opponent?.name ?? 'onbekend'} · rally{' '}
            {rally.sequence} · opslag {TEAM_SIDE_LABELS[rally.servingTeam].toLowerCase()} · rotatie R
            {rally.rotationUs ?? 1}
          </span>
        </div>

        <div className="topbar__sets">
          {sets.map((item) => (
            <span key={item.id} className={`setpill ${item.id === set.id ? 'setpill--current' : ''}`}>
              {item.pointsUs}-{item.pointsThem}
            </span>
          ))}
          <button
            type="button"
            className={`button button--ghost ${session.peers > 0 ? 'button--live' : ''}`}
            onClick={() => setShowPairing(true)}
          >
            {session.peers > 0 ? `Meelezen (${session.peers})` : 'Koppelen'}
          </button>
          <button type="button" className="button button--ghost" onClick={() => setShowLineup(true)}>
            Opstelling
          </button>
          <button type="button" className="button button--ghost" onClick={onOpenDashboard}>
            Cijfers
          </button>
          <button type="button" className="button button--ghost" onClick={() => void nextSet()}>
            Set afronden
          </button>
        </div>
      </header>

      <RallyChain actions={actions ?? []} playersById={playersById} onUndoLast={() => void undoLastAction()} />

      <div className="teamswitch" role="group" aria-label="Team">
        {(['us', 'them'] as const).map((side) => (
          <button
            key={side}
            type="button"
            className={`teamswitch__button ${entry.team === side ? 'teamswitch__button--active' : ''}`}
            onClick={() => dispatch({ kind: 'team', team: side })}
            aria-pressed={entry.team === side}
          >
            {TEAM_SIDE_LABELS[side]}
          </button>
        ))}
      </div>

      <main className="entry">
        <ActionTypePicker
          value={entry.type}
          active={entry.step === 'type'}
          onChange={(type) => dispatch({ kind: 'type', type })}
        />

        <PlayerGrid
          players={players}
          value={entry.playerId}
          team={entry.team}
          active={entry.step === 'player'}
          onChange={(playerId) => dispatch({ kind: 'player', playerId })}
        />

        {showZone && (
          <CourtPicker
            zoneFrom={entry.zoneFrom}
            zoneTo={entry.zoneTo}
            required={zoneRequired}
            active={entry.step === 'zone'}
            onZoneFrom={(zone) => dispatch({ kind: 'zoneFrom', zone })}
            onZoneTo={(zone) => dispatch({ kind: 'zoneTo', zone })}
            onSkip={() => dispatch({ kind: 'skipZone' })}
          />
        )}

        <QualityButtons
          actionType={entry.type}
          active={entry.step === 'quality'}
          disabled={!isReadyToCommit(entry)}
          onPick={(quality) => void commitAction(quality)}
          onExplain={setExplain}
        />
      </main>

      <footer className="bottombar">
        <button type="button" className="button button--us" onClick={() => void finishRally('us')}>
          Punt wij
        </button>
        <button type="button" className="button button--them" onClick={() => void finishRally('them')}>
          Punt zij
        </button>
        <button type="button" className="button button--ghost" onClick={() => dispatch({ kind: 'back' })}>
          ← Stap terug
        </button>
        <button type="button" className="button button--ghost" onClick={() => void undoLastAction()}>
          Undo actie
        </button>
        <button type="button" className="button button--danger" onClick={() => void undoRally()}>
          Undo rally
        </button>
      </footer>

      {showPairing && (
        <PairingSheet role="scorer" session={session} onClose={() => setShowPairing(false)} />
      )}

      {showLineup && (
        <LineupSheet
          players={data.ownPlayers}
          lineup={data.lineup}
          substitutions={data.substitutions ?? []}
          rotation={rally.rotationUs ?? 1}
          onSaveLineup={(positions) => void saveLineup(positions)}
          onSubstitute={(out, into) => void substitute(out, into)}
          onClose={() => setShowLineup(false)}
        />
      )}

      {explain && entry.type && (
        <ProtocolSheet actionType={entry.type} quality={explain} onClose={() => setExplain(null)} />
      )}
      <Toasts messages={messages} onDismiss={dismiss} />
    </div>
  );
}

function ErrorState({ message, onExit }: { message: string; onExit: () => void }): ReactElement {
  return (
    <div className="boot boot--error">
      <p>{message}</p>
      <button type="button" className="button" onClick={onExit}>
        Terug
      </button>
    </div>
  );
}
