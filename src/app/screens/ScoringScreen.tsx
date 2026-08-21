/**
 * Scherm A — rally-invoer.
 *
 * Alles wat tijdens een wedstrijd nodig is staat op één scherm: de keten van
 * deze rally bovenin, de invoervolgorde in het midden, en afronden plus undo
 * onderaan. Undo is geen extraatje: bij live invoer gaat er gegarandeerd iets
 * mis, en dan moet het in één tik recht te zetten zijn.
 */

import { useEffect, useMemo, useReducer, useRef, useState, type ReactElement } from 'react';
import { EntryPanel, type NewPlayerInput } from '../components/EntryPanel';
import { LineupSheet } from '../components/LineupSheet';
import { PairingSheet } from '../components/PairingSheet';
import { ScoreFixSheet } from '../components/ScoreFixSheet';
import { ProtocolSheet } from '../components/ProtocolSheet';
import { RallyChain } from '../components/RallyChain';
import { Toasts } from '../components/Toasts';
import type { PeerSession } from '../hooks/usePeerSession';
import { useToasts } from '../hooks/useToasts';
import { useQuery, useStore } from '../StoreProvider';
import { entryReducer, initialEntryState, toActionDraft } from '../entry/entryReducer';
import { positionsAt } from '../../domain/rotation';
import { isTerminalAction } from '../../domain/rules';
import { TEAM_SIDE_LABELS } from '../../domain/protocol';
import type { Player, Quality, TeamSide, Zone } from '../../domain/types';

export interface ScoringScreenProps {
  matchId: string;
  session: PeerSession;
  /**
   * De hoofdinvoerder bepaalt het verloop; een assistent vult alleen acties aan
   * in de rally die openstaat. Zo kan er nooit een tweede rally of een tweede
   * setstand ontstaan doordat twee apparaten tegelijk iets afronden.
   */
  role: 'scorer' | 'assistant';
  onExit: () => void;
  onOpenDashboard: () => void;
}

export function ScoringScreen({
  matchId,
  session,
  role,
  onExit,
  onOpenDashboard,
}: ScoringScreenProps): ReactElement {
  const leads = role === 'scorer';
  /** Per rally hoogstens één keer de server voorinvullen. */
  const prefilledRallyRef = useRef<string | null>(null);
  const store = useStore();
  const { messages, push, dismiss } = useToasts();
  const [entry, dispatch] = useReducer(entryReducer, initialEntryState('us'));
  const [explain, setExplain] = useState<Quality | null>(null);
  const [showLineup, setShowLineup] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const [showScoreFix, setShowScoreFix] = useState(false);

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

      // De hoofdinvoerder krijgt altijd een openstaande rally; die maken we hier
      // aan zodat hij er nooit zelf aan hoeft te denken. Een assistent wacht op
      // de rally van de hoofdinvoerder — hij mag er zelf geen beginnen.
      const rally = leads
        ? await instance.rallies.start({ setId: set.id })
        : await instance.rallies.open(set.id);
      if (!rally) {
        return { match, ownTeam, opponent, ownPlayers, opponentPlayers, sets, set, rally: null };
      }
      const [actions, lineup, substitutions, setActions] = await Promise.all([
        instance.actions.listByRally(rally.id),
        instance.lineups.forSet(set.id),
        instance.substitutions.listBySet(set.id),
        instance.actions.listBySet(set.id),
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
        setActions,
      };
    },
    [matchId, leads],
  );

  const playersById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const player of [...(data?.ownPlayers ?? []), ...(data?.opponentPlayers ?? [])]) {
      map.set(player.id, player);
    }
    return map;
  }, [data?.ownPlayers, data?.opponentPlayers]);

  /**
   * Wie er hoort te serveren. Met een opstelling weet de app dat exact: dat is
   * wie er in deze rotatie in zone 1 staat. Zonder opstelling blijft dezelfde
   * speler serveren zolang wij aan service blijven — precies zoals in het veld.
   */
  const expectedServerId = useMemo(() => {
    const open = data?.rally;
    if (!open || open.servingTeam !== 'us') return null;
    if (data?.lineup) {
      return positionsAt(data.lineup, open.rotationUs ?? 1, data.substitutions ?? [])[1];
    }
    return (
      (data?.setActions ?? [])
        .filter((action) => action.team === 'us' && action.type === 'serve')
        .at(-1)?.playerId ?? null
    );
  }, [data?.rally, data?.lineup, data?.substitutions, data?.setActions]);

  // Bij een eigen service staat de server al vast; die hoef je niet te kiezen.
  // Corrigeren kan altijd door bovenin op 'Wie' te tikken.
  useEffect(() => {
    const open = data?.rally;
    if (!open || prefilledRallyRef.current === open.id) return;
    if ((data?.actions?.length ?? 0) > 0 || open.servingTeam !== 'us' || !expectedServerId) return;

    prefilledRallyRef.current = open.id;
    dispatch({ kind: 'player', playerId: expectedServerId });
  }, [data?.rally, data?.actions, expectedServerId]);

  if (error) return <ErrorState message={error.message} onExit={onExit} />;
  if (!data) return <div className="boot">Wedstrijd laden…</div>;
  if (!data.set) return <ErrorState message="Deze wedstrijd heeft nog geen set." onExit={onExit} />;
  if (!data.rally) {
    return (
      <ErrorState
        message="Wachten op de hoofdinvoerder: er staat nog geen rally open."
        onExit={onExit}
      />
    );
  }

  const { match, opponent, set, sets, rally, actions } = data;

  /** Twee keer achter elkaar de bal raken mag niet — behalve na een blok. */
  const lastAction = actions?.at(-1);
  const blockedPlayerId = lastAction && lastAction.type !== 'block' ? lastAction.playerId : null;

  const needsServeChoice = set.startingServe === null;

  async function commitAction(quality: Quality): Promise<void> {
    const draft = toActionDraft(entry, quality);
    if (!draft || !data?.rally) return;

    try {
      const { action, warnings } = await store.actions.append({ rallyId: data.rally.id, ...draft });
      for (const warning of warnings) push('warning', warning.message);
      dispatch({ kind: 'committed', last: action });

      // Fout, ace of kill: de rally is volgens het protocol voorbij. Meteen
      // afronden scheelt een tik, en de uitslag is niet voor twee uitleg vatbaar.
      // Alleen de hoofdinvoerder doet dat; anders zouden twee apparaten dezelfde
      // rally afronden.
      if (isTerminalAction(action) && !leads) {
        push('info', 'Punt genoteerd — de hoofdinvoerder rondt de rally af.');
      } else if (isTerminalAction(action)) {
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

    // Terug over de rallygrens betekent een afgeronde rally heropenen; dat hoort
    // bij de hoofdinvoerder, anders draaien twee apparaten dezelfde stand terug.
    if (!leads) {
      push('info', 'Deze rally is leeg — verder terug kan alleen de hoofdinvoerder.');
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

  async function chooseStartingServe(side: TeamSide): Promise<void> {
    if (!data?.set) return;
    try {
      await store.sets.setStartingServe(data.set.id, side);
      dispatch({ kind: 'rallyStarted', servingTeam: side });
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function addMissedPoint(wonBy: TeamSide): Promise<void> {
    if (!data?.set) return;
    try {
      await store.rallies.addMissedPoint({ setId: data.set.id, wonBy });
      dispatch({ kind: 'reset' });
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function addPlayer(input: NewPlayerInput): Promise<void> {
    if (!data) return;
    const teamId = input.team === 'us' ? data.match.ownTeamId : data.match.opponentTeamId;
    const player = await store.players.create({
      teamId,
      number: input.number,
      name: input.name,
    });
    // Meteen doorgaan met de speler die je net toevoegde.
    dispatch({ kind: 'player', playerId: player.id });
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
      // Ook voor een nieuwe set geldt: wie begint, vraagt het scherm zo meteen.
      await store.sets.start({ matchId });
      dispatch({ kind: 'reset' });
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

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
            {leads ? '' : 'assistent · '}
            {match.homeAway === 'home' ? 'thuis' : 'uit'} tegen {opponent?.name ?? 'onbekend'} · rally{' '}
            {rally.sequence} · service {TEAM_SIDE_LABELS[rally.servingTeam].toLowerCase()} · rotatie R
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
            {session.peers > 0 ? `Gekoppeld (${session.peers})` : 'Koppelen'}
          </button>
          {leads && (
            <button type="button" className="button button--ghost" onClick={() => setShowLineup(true)}>
              Opstelling
            </button>
          )}
          <button type="button" className="button button--ghost" onClick={onOpenDashboard}>
            Cijfers
          </button>
          {leads && (
            <button type="button" className="button button--ghost" onClick={() => setShowScoreFix(true)}>
              Stand
            </button>
          )}
          {leads && (
            <button type="button" className="button button--ghost" onClick={() => void nextSet()}>
              Set afronden
            </button>
          )}
        </div>
      </header>

      <RallyChain actions={actions ?? []} playersById={playersById} onUndoLast={() => void undoLastAction()} />

      {needsServeChoice ? (
        /* Na de toss, aan het eind van de warming-up: pas dan weet je dit. */
        <section className="step step--serve">
          <h2 className="step__title">Wie begint met serveren?</h2>
          <p className="step__hint">
            Zonder dit klopt de rotatie niet, dus dit is het eerste wat de app wil weten van deze
            set.
          </p>
          <div className="teamswitch">
            <button
              type="button"
              className="teamswitch__button teamswitch__button--us"
              onClick={() => void chooseStartingServe('us')}
            >
              Wij
            </button>
            <button
              type="button"
              className="teamswitch__button teamswitch__button--them"
              onClick={() => void chooseStartingServe('them')}
            >
              Tegenstander
            </button>
          </div>
        </section>
      ) : (
        <EntryPanel
          state={entry}
          dispatch={dispatch}
          ownPlayers={data.ownPlayers}
          opponentPlayers={data.opponentPlayers}
          blockedPlayerId={blockedPlayerId}
          onCommit={(quality) => void commitAction(quality)}
          onExplain={setExplain}
          onAddPlayer={addPlayer}
        />
      )}

      <footer className="bottombar">
        {leads && (
          <>
            <button type="button" className="button button--us" onClick={() => void finishRally('us')}>
              Punt wij
            </button>
            <button
              type="button"
              className="button button--them"
              onClick={() => void finishRally('them')}
            >
              Punt zij
            </button>
          </>
        )}
        <button type="button" className="button button--ghost" onClick={() => void undoLastAction()}>
          Undo actie
        </button>
        {leads && (
          <button type="button" className="button button--danger" onClick={() => void undoRally()}>
            Undo rally
          </button>
        )}
      </footer>

      {showScoreFix && (
        <ScoreFixSheet
          pointsUs={set.pointsUs}
          pointsThem={set.pointsThem}
          onAdd={addMissedPoint}
          onClose={() => setShowScoreFix(false)}
        />
      )}

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
