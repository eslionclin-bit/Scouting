/**
 * Puntentelling en setverloop.
 *
 * De regels staan hier als data, niet als aanname verspreid door de code. Bij
 * ons worden er **altijd vier sets gespeeld** — ook bij 3-0 — en volgt er een
 * vijfde set tot 15 als het daarna 2-2 staat. Op hogere niveaus is het best of
 * five; dat is dan een andere `MatchRules`, geen andere app.
 */

import type { TeamSide } from './teams';

export interface MatchRules {
  /** Aantal sets dat sowieso gespeeld wordt, ongeacht de stand. */
  regularSets: number;
  /** Punten in een gewone set. */
  pointsPerSet: number;
  /** Punten in de beslissende set. */
  pointsDecidingSet: number;
  /** Minimaal verschil om een set te winnen. */
  minimumLead: number;
}

/** Wissels per team per set. Liberowissels tellen hier niet in mee. */
export const MAX_SUBSTITUTIONS_PER_SET = 6;

export const DEFAULT_RULES: MatchRules = {
  regularSets: 4,
  pointsPerSet: 25,
  pointsDecidingSet: 15,
  minimumLead: 2,
};

export function rulesOf(rules: MatchRules | null | undefined): MatchRules {
  return rules ?? DEFAULT_RULES;
}

/** Tot hoeveel punten deze set gaat. */
export function targetPoints(setNumber: number, rules: MatchRules = DEFAULT_RULES): number {
  return setNumber > rules.regularSets ? rules.pointsDecidingSet : rules.pointsPerSet;
}

export interface SetOutcome {
  /** Is de set volgens de telling afgelopen? */
  complete: boolean;
  winner: TeamSide | null;
  /** Staat een team op setpoint? */
  setPointFor: TeamSide | null;
}

/**
 * Een set is uit bij het doelaantal punten mét het vereiste verschil. Bij 24-24
 * gaat het door: 26-24, 27-25, enzovoort.
 */
export function setOutcome(
  pointsUs: number,
  pointsThem: number,
  setNumber: number,
  rules: MatchRules = DEFAULT_RULES,
): SetOutcome {
  const target = targetPoints(setNumber, rules);
  const lead = Math.abs(pointsUs - pointsThem);
  const leader: TeamSide = pointsUs >= pointsThem ? 'us' : 'them';
  const top = Math.max(pointsUs, pointsThem);

  if (top >= target && lead >= rules.minimumLead) {
    return { complete: true, winner: leader, setPointFor: null };
  }

  // Setpoint: één punt van de winst af. Dat is niet altijd bij 24 — na 24-24
  // schuift het mee op.
  const needed = Math.max(target - 1, Math.max(pointsUs, pointsThem));
  const usAtSetPoint = pointsUs >= needed && pointsUs - pointsThem >= rules.minimumLead - 1;
  const themAtSetPoint = pointsThem >= needed && pointsThem - pointsUs >= rules.minimumLead - 1;

  return {
    complete: false,
    winner: null,
    setPointFor: usAtSetPoint ? 'us' : themAtSetPoint ? 'them' : null,
  };
}

/** Wie deze set won, op basis van de stand. */
export function setWinner(
  set: { pointsUs: number; pointsThem: number; setNumber: number },
  rules: MatchRules = DEFAULT_RULES,
): TeamSide | null {
  return setOutcome(set.pointsUs, set.pointsThem, set.setNumber, rules).winner;
}

export interface MatchStatus {
  setsUs: number;
  setsThem: number;
  /** Sets die volgens de telling zijn uitgespeeld. */
  setsPlayed: number;
  /** Moet er nog een beslissende set komen? */
  needsDecider: boolean;
  /** Is de wedstrijd klaar? */
  complete: boolean;
  /** Het nummer van de set die nu aan de beurt is, of null als het klaar is. */
  nextSetNumber: number | null;
}

/**
 * De stand in sets, en wat er nog komt.
 *
 * Alleen **afgesloten** sets tellen mee. Een set die weer is opengezet na een
 * undo kan cijfermatig nog op 25-18 staan, maar is dan niet gewonnen — anders
 * zou de setstand blijven hangen op iets wat is teruggedraaid.
 *
 * Let ook op het verschil met best of five: bij 3-0 na drie sets is de wedstrijd
 * niet klaar — set 4 wordt gewoon gespeeld.
 */
export function matchStatus(
  sets: readonly {
    pointsUs: number;
    pointsThem: number;
    setNumber: number;
    status?: 'pending' | 'live' | 'finished';
  }[],
  rules: MatchRules = DEFAULT_RULES,
): MatchStatus {
  const decided = sets.filter(
    (set) => set.status === 'finished' && setWinner(set, rules) !== null,
  );
  const setsUs = decided.filter((set) => setWinner(set, rules) === 'us').length;
  const setsThem = decided.length - setsUs;
  const setsPlayed = decided.length;

  const needsDecider = setsPlayed >= rules.regularSets && setsUs === setsThem;
  const totalSets = needsDecider ? rules.regularSets + 1 : rules.regularSets;
  const complete = setsPlayed >= totalSets;

  return {
    setsUs,
    setsThem,
    setsPlayed,
    needsDecider,
    complete,
    nextSetNumber: complete ? null : setsPlayed + 1,
  };
}

/**
 * Wie begint met serveren in een volgende set.
 *
 * De teams wisselen dat om en om; alleen voor de beslissende set is er een
 * nieuwe toss, dus daar weet de app het niet.
 */
export function startingServeFor(
  setNumber: number,
  previousSets: readonly { setNumber: number; startingServe: TeamSide | null }[],
  rules: MatchRules = DEFAULT_RULES,
): TeamSide | null {
  if (needsToss(setNumber, rules)) return null;

  const previous = previousSets.find((set) => set.setNumber === setNumber - 1);
  if (!previous?.startingServe) return null;
  return previous.startingServe === 'us' ? 'them' : 'us';
}

/** Alleen de eerste set en de beslissende set beginnen met een toss. */
export function needsToss(setNumber: number, rules: MatchRules = DEFAULT_RULES): boolean {
  return setNumber === 1 || setNumber > rules.regularSets;
}
