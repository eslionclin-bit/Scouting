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
import { OpponentLineupSheet } from '../components/OpponentLineupSheet';
import { PairingSheet } from '../components/PairingSheet';
import { ActionFixSheet } from '../components/ActionFixSheet';
import { CourtEntry } from '../components/CourtEntry';
import { RefineBar, type RefinePatch } from '../components/RefineBar';
import { ScoreFixSheet } from '../components/ScoreFixSheet';
import { ProtocolSheet } from '../components/ProtocolSheet';
import { RallyChain } from '../components/RallyChain';
import { Toasts } from '../components/Toasts';
import type { PeerSession } from '../hooks/usePeerSession';
import { useToasts } from '../hooks/useToasts';
import { useQuery, useStore } from '../StoreProvider';
import { entryReducer, initialEntryState, toActionDraft } from '../entry/entryReducer';
import { courtPositions, emptyPositions, positionsAt } from '../../domain/rotation';
import { receiversFor } from '../../domain/reception';
import { DEFAULT_SETTINGS } from '../../domain/settings';
import {
  courtEntryReducer,
  expectedNext,
  initialCourtState,
  toCourtDraft,
} from '../entry/courtEntry';
import { matchStatus, rulesOf, setOutcome } from '../../domain/scoring';
import { isTerminalAction } from '../../domain/rules';
import { TEAM_SIDE_LABELS } from '../../domain/protocol';
import { canPlay, primaryRoleOf, rolesOf } from '../../domain/players';
import { ZONES, type Action, type Player, type Quality, type TeamSide, type Zone } from '../../domain/types';

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
  const [courtEntry, dispatchCourt] = useReducer(
    courtEntryReducer,
    initialCourtState('us', 'serve'),
  );
  // Een tablet in liggende stand; daaronder blijft de stapsgewijze invoer beter.
  const [wideEnough, setWideEnough] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 900,
  );
  const [explain, setExplain] = useState<Quality | null>(null);
  const [showLineup, setShowLineup] = useState(false);
  const [showThemLineup, setShowThemLineup] = useState(false);
  /** De set waarvoor de invoerder 'later' koos bij de opstelling. */
  const [skippedLineupFor, setSkippedLineupFor] = useState<string | null>(null);
  const [showPairing, setShowPairing] = useState(false);
  const [showScoreFix, setShowScoreFix] = useState(false);
  const [showActionFix, setShowActionFix] = useState(false);
  /** De knoppen die je zelden nodig hebt staan achter één knop; de balk was vol. */
  const [showMore, setShowMore] = useState(false);
  /** De zojuist ingevoerde actie, zolang de verfijnbalk nog openstaat. */
  const [refining, setRefining] = useState<Action | null>(null);
  /** Bij welke stand de invoerder 'nog niet' zei tegen het sluiten van de set. */
  const [dismissedAt, setDismissedAt] = useState<string | null>(null);

  const { data: settings } = useQuery(async (instance) => instance.getSettings(), []);

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
      const [actions, lineup, themLineup, substitutions, setActions] = await Promise.all([
        instance.actions.listByRally(rally.id),
        instance.lineups.forSet(set.id),
        instance.lineups.forSet(set.id, 'them'),
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
        themLineup,
        substitutions,
        setActions,
      };
    },
    [matchId, leads],
  );

  useEffect(() => {
    const onResize = (): void => setWideEnough(window.innerWidth >= 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const playersById = useMemo(() => {
    const map = new Map<string, Player>();
    for (const player of [...(data?.ownPlayers ?? []), ...(data?.opponentPlayers ?? [])]) {
      map.set(player.id, player);
    }
    return map;
  }, [data?.ownPlayers, data?.opponentPlayers]);

  /**
   * Wie er volgens de opstelling in het veld staat, inclusief de libero. Dit
   * gaat mee naar de validatie: daarmee merkt de app tijdens de wedstrijd op dat
   * er een speler wordt ingevoerd die er niet staat, of dat een achterspeler
   * blokt.
   */
  const court = useMemo(() => {
    if (!data?.lineup) return null;
    const { positions } = courtPositions(
      data.lineup,
      data.rally?.rotationUs ?? 1,
      data.substitutions ?? [],
      {
        rolesOf: (playerId) => {
          const player = playersById.get(playerId);
          return player ? rolesOf(player) : [];
        },
      },
    );
    return {
      positions,
      roleOf: (playerId: string) => primaryRoleOf(playersById.get(playerId) ?? { role: null }),
    };
  }, [data?.lineup, data?.rally?.rotationUs, data?.substitutions, playersById]);

  /**
   * Wie er in deze rotatie passt.
   *
   * De rotatie zegt waar iedereen staat; hij zegt niet wie de bal aanneemt. De
   * passer-loper aan het net past in vrijwel alle gevallen mee, en dat is
   * precies wat je bij een verwachte pass moet zien.
   */
  const receivers = useMemo(() => {
    if (!court) return [];
    return receiversFor(court.positions, {
      rolesOf: (playerId) => {
        const player = playersById.get(playerId);
        return player ? rolesOf(player) : [];
      },
      liberoId: data?.lineup?.liberoId ?? null,
    });
  }, [court, playersById, data?.lineup?.liberoId]);

  /**
   * Hun zes, als rugnummer per zone.
   *
   * Hun rotatie telt met precies dezelfde regel door als die van ons — zij
   * draaien zodra zij een rally winnen waarin wij serveerden — en die stand
   * staat al bij de rally. Vandaar dat de app na een servicefout van ons kan
   * zeggen wie er bij hen zo aan de opslag komt, zonder dat iemand hun rotatie
   * bijhoudt.
   */
  const themPositions = useMemo(() => {
    if (!data?.themLineup) return null;
    const ids = positionsAt(data.themLineup, data.rally?.rotationThem ?? 1);
    const numbers = {} as Record<Zone, number | null>;
    for (const zone of ZONES) {
      const playerId = ids[zone];
      numbers[zone] = playerId ? (playersById.get(playerId)?.number ?? null) : null;
    }
    return numbers;
  }, [data?.themLineup, data?.rally?.rotationThem, playersById]);

  /**
   * Wie er hoort te serveren. Met een opstelling weet de app dat exact: dat is
   * wie er in deze rotatie in zone 1 staat. Zonder opstelling blijft dezelfde
   * speler serveren zolang wij aan service blijven — precies zoals in het veld.
   */
  const expectedServerId = useMemo(() => {
    const open = data?.rally;
    if (!open || open.servingTeam !== 'us') return null;

    const candidate = data?.lineup
      ? positionsAt(data.lineup, open.rotationUs ?? 1, data.substitutions ?? [])[1]
      : ((data?.setActions ?? [])
          .filter((action) => action.team === 'us' && action.type === 'serve')
          .at(-1)?.playerId ?? null);

    // Een libero serveert niet. Staat die toch op de serveerplek, dan klopt de
    // opstelling niet en vult de app liever niets in dan iets onmogelijks.
    const player = candidate ? data?.ownPlayers.find((entry) => entry.id === candidate) : undefined;
    if (player && canPlay(player, 'libero') && rolesOf(player).length === 1) return null;
    return candidate;
  }, [data?.rally, data?.lineup, data?.substitutions, data?.setActions, data?.ownPlayers]);

  // Bij een eigen service staat de server al vast; die hoef je niet te kiezen.
  // Corrigeren kan altijd door bovenin op 'Wie' te tikken.
  useEffect(() => {
    const open = data?.rally;
    if (!open || prefilledRallyRef.current === open.id) return;
    if ((data?.actions?.length ?? 0) > 0) return;

    // Serveert de tegenstander, dan is dat de verwachting — niet onze service.
    // Anders zou een tik op hun helft als serveerdoel worden gelezen terwijl
    // zij aan de opslag zijn.
    if (open.servingTeam !== 'us') {
      prefilledRallyRef.current = open.id;
      dispatchCourt({ kind: 'expect', team: 'them', type: 'serve' });
      return;
    }
    if (!expectedServerId) return;

    prefilledRallyRef.current = open.id;
    dispatch({ kind: 'player', playerId: expectedServerId });
    // In de veldinvoer staat de server meteen geselecteerd: dan is een ace één
    // tik. De plek achter de lijn staat op 'midden' tot je een andere kiest.
    dispatchCourt({
      kind: 'expect',
      team: 'us',
      type: 'serve',
      selection: {
        team: 'us',
        playerId: expectedServerId,
        playerNumber: null,
        zone: 6,
      },
    });
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

  const rules = rulesOf(match.rules);
  const outcome = setOutcome(set.pointsUs, set.pointsThem, set.setNumber, rules);
  const status = matchStatus(sets, rules);
  const scoreKey = `${set.id}:${set.pointsUs}-${set.pointsThem}`;
  // De set is volgens de telling uit, maar de invoerder bevestigt het: er kan
  // een punt te veel zijn ingevoerd.
  const askCloseSet = outcome.complete && set.status === 'live' && dismissedAt !== scoreKey;

  /** Twee keer achter elkaar de bal raken mag niet — behalve na een blok. */
  const lastAction = actions?.at(-1);
  const blockedPlayerId = lastAction && lastAction.type !== 'block' ? lastAction.playerId : null;

  /**
   * Invoeren op het veld kan alleen met een opstelling: zonder die zes weet de
   * app niet wie waar staat, en dan is de stapsgewijze invoer beter. Op een
   * smal scherm ook: zes vakken plus knoppen passen niet op een telefoon.
   */
  const useCourt = court !== null && wideEnough;
  const settingsOrDefault = settings ?? DEFAULT_SETTINGS;

  const needsServeChoice = set.startingServe === null;

  /**
   * De opstelling hoort er te staan vóór het eerste punt.
   *
   * Achteraf invullen kan wel, maar dan is de rotatiestand van de al gespeelde
   * rally's niet meer terug te rekenen: de app telt door vanaf de zes van het
   * begin, en die zes waren er dan niet. Dus vraagt hij erom zolang de set nog
   * leeg is — en laat hij hem overslaan, want soms weet je hem gewoon nog niet.
   */
  const needsLineup =
    leads &&
    !needsServeChoice &&
    data.lineup === undefined &&
    (data.setActions?.length ?? 0) === 0 &&
    set.pointsUs === 0 &&
    set.pointsThem === 0 &&
    skippedLineupFor !== set.id;

  async function commitAction(quality: Quality): Promise<void> {
    const draft = useCourt ? toCourtDraft(courtEntry, quality) : toActionDraft(entry, quality);
    if (!draft || !data?.rally) return;

    try {
      const { action, warnings } = await store.actions.append(
        { rallyId: data.rally.id, ...draft },
        { court },
      );
      for (const warning of warnings) push('warning', warning.message);
      dispatch({ kind: 'committed', last: action });

      // Verfijnen kan hierna: tempo, blok, reden, of welke tegenstander het was.
      // Nooit ervoor — het invoeren mag er niet op wachten.
      setRefining(action);
      dispatchCourt({
        kind: 'expect',
        ...expectedNext(action, data.rally.servingTeam, settingsOrDefault),
      });

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
        dispatchCourt({ kind: 'expect', team: next.servingTeam, type: 'serve' });
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
      dispatchCourt({ kind: 'expect', team: next.servingTeam, type: 'serve' });
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

    if (await undoAcrossSets()) {
      push('info', 'Vorige set weer open, terug op setpoint.');
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

  async function closeSet(): Promise<void> {
    if (!data?.set) return;
    try {
      await store.sets.finish(data.set.id);
      // Bij ons worden altijd vier sets gespeeld, en een vijfde bij 2-2. Is de
      // wedstrijd uit, dan begint er geen nieuwe set meer.
      // De set die we net sluiten telt mee voor de vraag of er nog een volgt.
      const played = data.sets.map((item) =>
        item.id === data.set!.id ? { ...item, status: 'finished' as const } : item,
      );
      const next = matchStatus(played, rulesOf(data.match.rules));
      if (!next.complete) await store.sets.start({ matchId });
      dispatch({ kind: 'reset' });
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function chooseStartingServe(side: TeamSide): Promise<void> {
    if (!data?.set) return;
    try {
      await store.sets.setStartingServe(data.set.id, side);
      dispatch({ kind: 'rallyStarted', servingTeam: side });
      dispatchCourt({ kind: 'expect', team: side, type: 'serve' });
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
    // Bewust niet meteen doorspringen: aan het begin tik je vaak een paar
    // rugnummers achter elkaar in, en dan is doorschieten hinderlijk.
    await store.players.create({ teamId, number: input.number, name: input.name });
  }

  /**
   * Hun opstelling bewaren. De invoerder tikt rugnummers in; spelers die we nog
   * niet kenden worden hier aangemaakt, want zonder speler is er niets om aan
   * op te hangen.
   */
  async function saveThemLineup(atStart: Record<Zone, number | null>): Promise<void> {
    if (!data?.set) return;
    try {
      const teamId = data.match.opponentTeamId;
      const positions = emptyPositions();
      for (const zone of ZONES) {
        const number = atStart[zone];
        if (number === null) continue;
        const existing = await store.players.byNumber(teamId, number);
        const player = existing ?? (await store.players.create({ teamId, number, name: '' }));
        positions[zone] = player.id;
      }
      await store.lineups.set({ setId: data.set.id, team: 'them', positions });
      setShowThemLineup(false);
      push('info', 'Opstelling van de tegenstander vastgelegd.');
    } catch (cause) {
      push('error', cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function saveLineup(
    positions: Record<Zone, string | null>,
    liberoId: string | null,
    liberoForId: string | null,
  ): Promise<void> {
    if (!data?.set) return;
    try {
      await store.lineups.set({ setId: data.set.id, positions, liberoId, liberoForId });
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

  /**
   * Undo over de setgrens. Ging de set net dicht terwijl er nog een punt te
   * corrigeren was, dan moet je terug kunnen naar het setpoint ervoor — niet
   * vastzitten in een lege nieuwe set.
   */
  async function undoAcrossSets(): Promise<boolean> {
    if (!data?.set) return false;
    const currentRallies = await store.rallies.listBySet(data.set.id);
    if (currentRallies.some((rally) => rally.wonBy !== null)) return false;

    const previous = data.sets
      .filter((item) => item.id !== data.set!.id && item.status === 'finished')
      .at(-1);
    if (!previous) return false;

    const previousRallies = await store.rallies.listBySet(previous.id);
    const last = previousRallies.filter((rally) => rally.wonBy !== null).at(-1);
    if (!last) return false;

    // De lege nieuwe set verdwijnt, de vorige gaat weer open, en het laatste
    // punt wordt teruggedraaid: je staat weer op setpoint.
    for (const rally of currentRallies) await store.rallies.remove(rally.id);
    await store.sets.remove(data.set.id);
    await store.sets.reopen(previous.id);
    await store.rallies.reopen(last.id);
    setDismissedAt(null);
    dispatch({ kind: 'reset' });
    return true;
  }

  return (
    <div className="scoring">
      <header className="topbar">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Wedstrijden
        </button>

        <div className="topbar__score">
          <span className="topbar__set">
            Set {set.setNumber} · sets {status.setsUs}–{status.setsThem}
          </span>
          <strong className="topbar__points">
            {set.pointsUs} <span>–</span> {set.pointsThem}
          </strong>
          <span className="topbar__meta">
            {leads ? '' : 'assistent · '}
            {match.homeAway === 'home' ? 'thuis' : 'uit'} tegen {opponent?.name ?? 'onbekend'} · rally{' '}
            {rally.sequence} · service {TEAM_SIDE_LABELS[rally.servingTeam].toLowerCase()} · rotatie R
            {rally.rotationUs ?? 1}
            {/*
              Zij draaien door zodra zij een rally winnen waarin wij serveerden.
              Voer je dus een servicefout in, dan staat hier meteen wie er bij
              hen aan de opslag komt — dat volgt uit hun rotatie, niemand hoeft
              die bij te houden.
            */}
            {rally.servingTeam === 'them' && themPositions?.[1] != null && (
              <> · hun service #{themPositions[1]}</>
            )}
          </span>
        </div>

        <div className="topbar__sets">
          {sets.map((item) => (
            <span key={item.id} className={`setpill ${item.id === set.id ? 'setpill--current' : ''}`}>
              {item.pointsUs}-{item.pointsThem}
            </span>
          ))}
          {showMore && (
            <button
              type="button"
              className={`button button--ghost ${session.peers > 0 ? 'button--live' : ''}`}
              onClick={() => setShowPairing(true)}
            >
              {session.peers > 0 ? `Gekoppeld (${session.peers})` : 'Koppelen'}
            </button>
          )}
          {leads && (
            <button type="button" className="button button--ghost" onClick={() => setShowLineup(true)}>
              Opstelling
            </button>
          )}
          {leads && showMore && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setShowThemLineup(true)}
            >
              Hun opstelling
            </button>
          )}
          <button type="button" className="button button--ghost" onClick={onOpenDashboard}>
            Cijfers
          </button>
          {leads && showMore && (
            <button type="button" className="button button--ghost" onClick={() => setShowScoreFix(true)}>
              Stand
            </button>
          )}
          {leads && showMore && (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setShowActionFix(true)}
            >
              Corrigeren
            </button>
          )}
          {leads && showMore && (
            <button type="button" className="button button--ghost" onClick={() => setShowLineup(true)}>
              Wissel
            </button>
          )}
          <button
            type="button"
            className="button button--ghost"
            aria-expanded={showMore}
            aria-label={showMore ? 'Minder knoppen' : 'Meer knoppen'}
            onClick={() => setShowMore((open) => !open)}
          >
            {showMore ? '×' : '⋯'}
          </button>
        </div>
      </header>

      <RallyChain actions={actions ?? []} playersById={playersById} onUndoLast={() => void undoLastAction()} />

      {refining && (
        <RefineBar
          action={refining}
          players={refining.team === 'us' ? data.ownPlayers : data.opponentPlayers}
          askAttack={useCourt}
          onRefine={(patch: RefinePatch) => {
            void store.actions.revise(refining.id, patch);
          }}
          onDismiss={() => setRefining(null)}
        />
      )}

      {status.complete ? (
        <section className="step step--done">
          <h2 className="step__title">Wedstrijd klaar</h2>
          <p className="step__hint">
            {status.setsUs}–{status.setsThem} in sets. Alles staat vast; de cijfers vind je onder
            'Cijfers'.
          </p>
          <div className="step__actions">
            <button type="button" className="button button--primary" onClick={onOpenDashboard}>
              Naar de cijfers
            </button>
            <button type="button" className="button button--ghost" onClick={onExit}>
              Wedstrijden
            </button>
          </div>
        </section>
      ) : askCloseSet ? (
        <section className="step step--close">
          <h2 className="step__title">
            Set {set.setNumber} klaar? {set.pointsUs}–{set.pointsThem}
          </h2>
          <p className="step__hint">
            {outcome.winner === 'us' ? 'Wij winnen' : 'Zij winnen'} deze set. Klopt de stand niet,
            kies dan 'nog niet' en corrigeer hem eerst.
          </p>
          <div className="step__actions">
            <button type="button" className="button button--primary" onClick={() => void closeSet()}>
              Set sluiten
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setDismissedAt(scoreKey)}
            >
              Nog niet
            </button>
          </div>
        </section>
      ) : needsLineup ? (
        <section className="step step--serve">
          <h2 className="step__title">Zet eerst de opstelling neer</h2>
          <p className="step__hint">
            De app telt de rotatie door vanaf de zes van het begin van de set. Vul je hem pas na een
            paar punten in, dan klopt de rotatiestand van die punten niet meer — en die staat onder
            elk cijfer per rotatie.
          </p>
          <div className="step__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => setShowLineup(true)}
            >
              Opstelling invullen
            </button>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => setSkippedLineupFor(set.id)}
            >
              Weet ik nog niet — later
            </button>
          </div>
        </section>
      ) : needsServeChoice ? (
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
      ) : useCourt ? (
        <CourtEntry
          state={courtEntry}
          dispatch={dispatchCourt}
          positions={court?.positions ?? emptyPositions()}
          ownPlayers={data.ownPlayers}
          opponentPlayers={data.opponentPlayers}
          receivers={receivers}
          opponentPositions={themPositions ?? undefined}
          settings={settingsOrDefault}
          expectedServerId={expectedServerId}
          onCommit={(quality) => void commitAction(quality)}
          onExplain={setExplain}
        />
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
            {/*
              De stand volgt normaal uit de actie zelf: een kill is een punt, een
              fout is een punt tegen, en de rally sluit vanzelf. Deze twee zijn
              voor de rally die eindigt zonder dat er iets is ingevoerd — de
              tegenstander slaat uit terwijl je hun aanval niet vastlegt, een
              netfout, een fluitsignaal, een bal die te rommelig was om te
              scouten.
            */}
            <span className="bottombar__label">punt zonder actie</span>
            <button
              type="button"
              className="button button--us"
              aria-label="Punt wij"
              onClick={() => void finishRally('us')}
            >
              Wij
            </button>
            <button
              type="button"
              className="button button--them"
              aria-label="Punt zij"
              onClick={() => void finishRally('them')}
            >
              Zij
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

      {showActionFix && (
        <ActionFixSheet
          setId={set.id}
          players={data.ownPlayers}
          onClose={() => setShowActionFix(false)}
        />
      )}

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
          onSaveLineup={(positions, liberoId, liberoForId) =>
            void saveLineup(positions, liberoId, liberoForId)
          }
          onSubstitute={(out, into) => void substitute(out, into)}
          onClose={() => setShowLineup(false)}
        />
      )}

      {showThemLineup && (
        <OpponentLineupSheet
          current={themPositions ?? { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null }}
          rotation={rally.rotationThem ?? 1}
          known={[...new Set(data.opponentPlayers.map((player) => player.number))].sort(
            (a, b) => a - b,
          )}
          onSave={(atStart) => void saveThemLineup(atStart)}
          onClose={() => setShowThemLineup(false)}
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
