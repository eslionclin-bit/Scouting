/**
 * Wat de coach op de bank nu moet weten.
 *
 * Dit is bewust iets anders dan het analysedashboard. Daar zoek je iets op; hier
 * word je iets verteld. De vraag is niet "hoe deden we het" maar "wat doe ik nu,
 * en wat zeg ik straks in de time-out".
 *
 * Alles komt uit tellingen van deze wedstrijd, elke aanwijzing draagt zijn
 * aantal, en onder een minimum zwijgt het scherm — net als het opponent-dossier.
 * Een coach die op vier ballen wordt bijgestuurd, is slechter af dan een coach
 * die niets hoort.
 */

import type { MatchBundle } from '../db/bundle';
import { playerLabel } from '../domain/players';
import { ACTION_TYPE_LABELS } from '../domain/protocol';
import type { TeamSide } from '../domain/types';
import { ZONE_LABELS } from '../domain/zones';
import { buildPlayerProfile, compareForm, type FormComparison } from './player';
import { buildOpponentDossier } from './opponent';
import { filterActions, toActionRows, toRallyRows, type RallyRow } from './rows';
import { statsByPlayer, statsByRotation, statsByType, zoneTally, type RotationStats } from './stats';
import { buildTeamProfile } from './team';

/** Onder deze aantallen zeggen we niets. */
const MIN_RALLIES = 4;
const MIN_ACTIONS = 8;

export type CueTone = 'urgent' | 'watch' | 'good';

export interface CoachCue {
  code: string;
  tone: CueTone;
  /**
   * Komt dit uit de wedstrijd die nu bezig is, of uit wat we eerder zagen? Dat
   * verschil bepaalt hoe hard je erop stuurt, dus het staat op het scherm.
   */
  source: 'live' | 'history';
  /** De handeling of het patroon, in één regel. */
  title: string;
  /** De telling eronder — zodat je zelf kunt wegen hoe hard dit is. */
  detail: string;
  sample: number;
}

export interface CoachBriefing {
  setNumber: number | null;
  pointsUs: number;
  pointsThem: number;
  setsUs: number;
  setsThem: number;
  serving: TeamSide | null;
  rotation: number | null;
  /** Punten op rij, voor of tegen. */
  streak: { team: TeamSide; count: number } | null;
  sideoutPct: number | null;
  servePointPct: number | null;
  attackEfficiency: number | null;
  attackTotal: number;
  errorsUs: number;
  rotations: RotationStats[];
  /**
   * De rotatie waar je na de volgende sideout in komt. De cijfers ontbreken
   * zolang je er in deze set nog niet in gestaan hebt — dat is zelf ook een
   * antwoord.
   */
  nextRotation: { rotation: number; stats: RotationStats | null } | null;
  /** Uitslag van elke afgeronde rally in deze set, op volgorde. */
  results: TeamSide[];
  cues: CoachCue[];
  /** Maximaal drie zinnen om in de time-out te zeggen. */
  talkingPoints: string[];
}

export interface CoachBriefingOptions {
  /** Eerdere wedstrijden tegen deze tegenstander. */
  opponentHistory?: readonly MatchBundle[];
  /** Onze eigen eerdere wedstrijden, ongeacht tegenstander. */
  ownHistory?: readonly MatchBundle[];
}

export function buildCoachBriefing(
  bundle: MatchBundle,
  options: CoachBriefingOptions = {},
): CoachBriefing {
  const sets = bundle.sets;
  const current = sets.filter((set) => set.set.status === 'live').at(-1) ?? sets.at(-1) ?? null;

  const allRallies = toRallyRows(bundle);
  const setRallies = current ? allRallies.filter((row) => row.setId === current.set.id) : [];
  const openRally = setRallies.find((row) => row.rally.wonBy === null);

  const allActions = toActionRows(bundle);
  const setActions = current ? allActions.filter((row) => row.setId === current.set.id) : [];
  const oursInSet = filterActions(setActions, { team: 'us' });
  const ourTypes = statsByType(oursInSet);

  const rotations = statsByRotation(setRallies);
  const rotation = openRally?.rally.rotationUs ?? setRallies.at(-1)?.rally.rotationUs ?? null;

  const receiveRallies = setRallies.filter(
    (row) => row.rally.servingTeam === 'them' && row.rally.wonBy !== null,
  );
  const serveRallies = setRallies.filter(
    (row) => row.rally.servingTeam === 'us' && row.rally.wonBy !== null,
  );

  const briefing: CoachBriefing = {
    setNumber: current?.set.setNumber ?? null,
    pointsUs: current?.set.pointsUs ?? 0,
    pointsThem: current?.set.pointsThem ?? 0,
    // Alleen afgeronde sets tellen mee: een set die nog loopt is geen setwinst,
    // ook al staat hij voor.
    setsUs: sets.filter((set) => set.set.status === 'finished' && set.set.pointsUs > set.set.pointsThem)
      .length,
    setsThem: sets.filter(
      (set) => set.set.status === 'finished' && set.set.pointsThem > set.set.pointsUs,
    ).length,
    serving: openRally?.rally.servingTeam ?? null,
    rotation,
    streak: streakOf(setRallies),
    sideoutPct: share(receiveRallies.filter((row) => row.rally.wonBy === 'us').length, receiveRallies.length),
    servePointPct: share(serveRallies.filter((row) => row.rally.wonBy === 'us').length, serveRallies.length),
    attackEfficiency: ourTypes.attack.efficiency,
    attackTotal: ourTypes.attack.total,
    errorsUs: oursInSet.filter((row) => row.action.quality === 'error').length,
    rotations,
    nextRotation: null,
    results: setRallies
      .map((row) => row.rally.wonBy)
      .filter((wonBy): wonBy is TeamSide => wonBy !== null),
    cues: [],
    talkingPoints: [],
  };

  if (rotation) {
    const next = (rotation % 6) + 1;
    briefing.nextRotation = {
      rotation: next,
      stats: rotations.find((entry) => entry.rotation === next) ?? null,
    };
  }

  briefing.cues = [
    ...collectCues(bundle, briefing, { setRallies, oursInSet, receiveRallies }),
    ...formCues(bundle, options),
    ...historyCues(bundle, options),
  ];
  briefing.talkingPoints = briefing.cues
    .filter((cue) => cue.tone !== 'good')
    .slice(0, 3)
    .map((cue) => `${cue.title} — ${cue.detail}`);

  return briefing;
}

interface CueContext {
  setRallies: RallyRow[];
  oursInSet: ReturnType<typeof filterActions>;
  receiveRallies: RallyRow[];
}

function collectCues(
  bundle: MatchBundle,
  briefing: CoachBriefing,
  context: CueContext,
): CoachCue[] {
  const cues: CoachCue[] = [];
  const ourTypes = statsByType(context.oursInSet);

  // Wat er nú gebeurt weegt het zwaarst: een reeks tegen vraagt om ingrijpen,
  // ongeacht wat de rest van de cijfers zegt.
  if (briefing.streak && briefing.streak.team === 'them' && briefing.streak.count >= 3) {
    cues.push({
      code: 'streak_against',
      tone: 'urgent',
      source: 'live',
      title: `${briefing.streak.count} punten op rij tegen`,
      detail: 'Overweeg een time-out of een wissel om de reeks te breken.',
      sample: briefing.streak.count,
    });
  }

  // Per rotatie is één set al gauw te weinig, dus hiervoor telt de hele
  // wedstrijd mee. Sta je er nu in, dan is het dringend; anders iets om bij de
  // volgende doordraai op te letten.
  const worst = worstRotation(toRallyRows(bundle));
  if (worst) {
    const isCurrent = worst.rotation === briefing.rotation;
    cues.push({
      code: 'rotation_sideout',
      tone: isCurrent ? 'urgent' : 'watch',
      source: 'live',
      title: `Sideout hapert in R${worst.rotation}`,
      detail: `${worst.won} van ${worst.total} gewonnen op hun service${isCurrent ? '; je staat er nu in' : ''}.`,
      sample: worst.total,
    });
  }

  if (ourTypes.serve.counts.error >= 3) {
    cues.push({
      code: 'serve_errors',
      source: 'live',
      tone: 'watch',
      title: 'Service kost punten',
      detail: `${ourTypes.serve.counts.error} servicefouten in deze set.`,
      sample: ourTypes.serve.total,
    });
  }

  if (ourTypes.attack.total >= MIN_ACTIONS && (ourTypes.attack.efficiency ?? 0) <= 0) {
    cues.push({
      code: 'attack_flat',
      source: 'live',
      tone: 'watch',
      title: 'Aanval levert niets op',
      detail: `${ourTypes.attack.counts.perfect} punt tegenover ${ourTypes.attack.counts.error} fout op ${ourTypes.attack.total} aanvallen.`,
      sample: ourTypes.attack.total,
    });
  }

  const pass = ourTypes.reception;
  const shakyPasses = pass.counts.poor + pass.counts.error;
  if (pass.total >= MIN_ACTIONS && shakyPasses / pass.total >= 0.4) {
    cues.push({
      code: 'pass_under_pressure',
      source: 'live',
      tone: 'watch',
      title: 'Pass staat onder druk',
      detail: `${shakyPasses} van ${pass.total} passes matig of fout.`,
      sample: pass.total,
    });
  }

  // Patronen van de tegenstander over de hele wedstrijd: daar is meer van gezien
  // dan binnen één set, en ze veranderen niet halverwege.
  const theirActions = filterActions(toActionRows(bundle), { team: 'them' });
  const theirAttacks = zoneTally(filterActions(theirActions, { type: 'attack' }));
  if (theirAttacks.total >= MIN_ACTIONS) {
    const zones = [1, 2, 3, 4, 5, 6] as const;
    const top = zones.reduce((best, zone) =>
      theirAttacks.counts[zone] > theirAttacks.counts[best] ? zone : best,
    );
    if (theirAttacks.percentages[top] >= 0.45) {
      cues.push({
        code: 'their_attack_zone',
        source: 'live',
        tone: 'watch',
        title: `Blok naar ${ZONE_LABELS[top].toLowerCase()}`,
        detail: `${theirAttacks.counts[top]} van ${theirAttacks.total} aanvallen komen daarvandaan.`,
        sample: theirAttacks.total,
      });
    }
  }

  const opponentPlayers = bundle.players.filter(
    (player) => player.teamId === bundle.match.opponentTeamId,
  );
  for (const player of statsByPlayer(theirActions, opponentPlayers)) {
    const attack = player.byType.attack;
    if (attack.total >= 6 && (attack.pointPct ?? 0) >= 0.45) {
      cues.push({
        code: 'their_key_player',
        source: 'live',
        tone: 'watch',
        title: `#${player.number} is hun uitweg`,
        detail: `${attack.counts.perfect} punten uit ${attack.total} aanvallen.`,
        sample: attack.total,
      });
    }
  }

  // Ook zeggen wat wél loopt: dat is wat je in een time-out wilt bevestigen.
  if (ourTypes.attack.total >= MIN_ACTIONS && (ourTypes.attack.pointPct ?? 0) >= 0.45) {
    cues.push({
      code: 'attack_running',
      source: 'live',
      tone: 'good',
      title: 'Aanval loopt',
      detail: `${ourTypes.attack.counts.perfect} punten uit ${ourTypes.attack.total} aanvallen.`,
      sample: ourTypes.attack.total,
    });
  }
  if (context.receiveRallies.length >= MIN_ACTIONS && (briefing.sideoutPct ?? 0) >= 0.6) {
    cues.push({
      code: 'sideout_good',
      source: 'live',
      tone: 'good',
      title: 'Sideout staat',
      detail: `${Math.round((briefing.sideoutPct ?? 0) * 100)}% gewonnen op hun service.`,
      sample: context.receiveRallies.length,
    });
  }

  return cues;
}

/**
 * Wie er vandaag onder — of boven — het eigen niveau speelt.
 *
 * Dit is het verschil dat je op de bank niet ziet: een speler kan de hele
 * wedstrijd ballen missen en dat toch gewoon haar niveau zijn, terwijl een ander
 * ver onder de eigen cijfers blijft en dus een wissel waard is. Daarom telt
 * alleen de vergelijking met de eigen historie, en alleen als er van beide kanten
 * genoeg van gezien is.
 */
function formCues(bundle: MatchBundle, options: CoachBriefingOptions): CoachCue[] {
  const history = (options.ownHistory ?? []).filter((entry) => entry.match.id !== bundle.match.id);
  if (history.length === 0) return [];

  const cues: CoachCue[] = [];
  const rowsNow = filterActions(toActionRows(bundle), { team: 'us' });
  const ourPlayers = bundle.players.filter((player) => player.teamId === bundle.match.ownTeamId);

  for (const player of ourPlayers) {
    const now = statsByType(filterActions(rowsNow, { playerId: player.id }));
    const season = buildPlayerProfile(history, player).season.byType;

    for (const entry of compareForm(now, season)) {
      if (entry.verdict === 'gelijk') continue;
      const under = entry.verdict === 'onder';
      cues.push({
        code: under ? 'player_below_level' : 'player_above_level',
        source: 'live',
        tone: under ? 'watch' : 'good',
        title: `${playerLabel(player)} ${under ? 'onder' : 'boven'} eigen niveau op de ${ACTION_TYPE_LABELS[
          entry.type
        ].toLowerCase()}`,
        detail: `${formatMetric(entry, entry.now)} nu tegenover ${formatMetric(
          entry,
          entry.season,
        )} eerder (${entry.actionsNow} acties nu, ${entry.actionsSeason} eerder).`,
        sample: entry.actionsNow,
      });
    }
  }

  return cues;
}

function formatMetric(entry: FormComparison, value: number): string {
  const rounded = Math.round(value * 100);
  if (entry.metric === 'positive') return `${rounded}% positief`;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

/**
 * Wat we al wisten voordat deze wedstrijd begon.
 *
 * De zwaktes van de tegenstander uit eerdere ontmoetingen, en onze eigen
 * hardnekkige patronen. Ze staan onderaan en met een eigen label: ze zijn
 * waardevol, maar wat er nú gebeurt gaat voor.
 */
function historyCues(bundle: MatchBundle, options: CoachBriefingOptions): CoachCue[] {
  const cues: CoachCue[] = [];

  const opponentHistory = (options.opponentHistory ?? []).filter(
    (entry) => entry.match.id !== bundle.match.id,
  );
  if (opponentHistory.length > 0) {
    const dossier = buildOpponentDossier(
      opponentHistory,
      bundle.match.opponentTeamId,
      bundle.opponent?.name ?? 'tegenstander',
    );
    const label =
      dossier.matches.length === 1 ? 'vorige wedstrijd' : `${dossier.matches.length} eerdere wedstrijden`;

    for (const advice of dossier.advice.slice(0, 2)) {
      cues.push({
        code: 'opponent_history',
        source: 'history',
        tone: 'watch',
        title: advice.text,
        detail: `${advice.because} (${label})`,
        sample: dossier.totalActions,
      });
    }
  }

  const ownHistory = (options.ownHistory ?? []).filter(
    (entry) => entry.match.id !== bundle.match.id,
  );
  if (ownHistory.length > 0) {
    const profile = buildTeamProfile(ownHistory, bundle.match.ownTeamId);
    const finding = profile.findings[0];
    const advice = profile.advice.find((entry) => entry.because === finding?.text);
    if (finding && advice) {
      cues.push({
        code: 'own_history',
        source: 'history',
        tone: 'watch',
        title: advice.text,
        detail: `${finding.text} (${profile.matches} eerdere ${
          profile.matches === 1 ? 'wedstrijd' : 'wedstrijden'
        }, ${finding.sample} waarnemingen)`,
        sample: finding.sample,
      });
    }
  }

  return cues;
}

/** De rotatie waarin de sideout het slechtst loopt, als er genoeg van gezien is. */
function worstRotation(
  rallies: readonly RallyRow[],
): { rotation: number; won: number; total: number } | null {
  const perRotation = new Map<number, { won: number; total: number }>();

  for (const row of rallies) {
    if (row.rotation == null || row.rally.wonBy === null) continue;
    if (row.rally.servingTeam !== 'them') continue;
    const entry = perRotation.get(row.rotation) ?? { won: 0, total: 0 };
    entry.total++;
    if (row.rally.wonBy === 'us') entry.won++;
    perRotation.set(row.rotation, entry);
  }

  let worst: { rotation: number; won: number; total: number } | null = null;
  for (const [rotation, entry] of perRotation) {
    if (entry.total < MIN_RALLIES) continue;
    const rate = entry.won / entry.total;
    if (rate >= 0.4) continue;
    if (!worst || rate < worst.won / worst.total) worst = { rotation, ...entry };
  }
  return worst;
}

/** Punten op rij, gerekend vanaf de laatst gespeelde rally terug. */
function streakOf(rallies: readonly RallyRow[]): { team: TeamSide; count: number } | null {
  const decided = rallies.filter((row) => row.rally.wonBy !== null);
  const last = decided.at(-1)?.rally.wonBy;
  if (!last) return null;

  let count = 0;
  for (let i = decided.length - 1; i >= 0; i--) {
    if (decided[i]?.rally.wonBy !== last) break;
    count++;
  }
  return { team: last, count };
}

function share(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}
