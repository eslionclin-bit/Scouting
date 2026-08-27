/**
 * Oefeningen schalen naar het aantal deelnemers.
 *
 * Dit is het rekenwerk waar de app om draait. Een oefening zegt niet "voor 6
 * spelers", maar: deze groep werkt vanaf 4 tot en met 10, in stappen van 1, en
 * kan twee keer naast elkaar. Een oefening in drietallen zegt: van 3 tot 9, in
 * stappen van 3 — die kan dus alleen met 3, 6 of 9 spelers per groep.
 *
 * Met het aantal aanwezigen erbij volgt daaruit:
 *   - hoeveel groepen er draaien en hoe groot ze zijn,
 *   - wie er wachten,
 *   - en wanneer die wisselen, zodat iedereen evenveel speelt.
 *
 * De regel bij het kiezen: eerst zoveel mogelijk mensen aan het werk, daarna
 * liever meer kleine groepen dan één grote (meer balcontacten per speler), en
 * daarna zo gelijk mogelijke groepen.
 */

import type { GroupSpec, Player, Position, RoleRequirement } from './types';

/** Waarom een oefening niet kan met dit aantal aanwezigen. */
export type FitProblem =
  | { kind: 'too-few'; needed: number; short: number }
  | { kind: 'step'; step: number; nearestBelow: number | null; nearestAbove: number }
  | { kind: 'missing-role'; position: Position; needed: number; available: number };

export interface Distribution {
  /** Groottes van de groepen die draaien, aflopend. */
  groups: number[];
  /** Hoeveel spelers er meedoen. */
  playing: number;
  /** Hoeveel spelers er wachten (of een andere oefening doen). */
  waiting: number;
  /** Klopt het precies, of blijft er iemand over? */
  exact: boolean;
  problems: FitProblem[];
  /** Kan de oefening überhaupt met dit aantal? */
  possible: boolean;
}

/** De groepsgroottes die deze oefening toestaat, oplopend. */
export function allowedSizes(spec: GroupSpec): number[] {
  const step = Math.max(1, Math.floor(spec.step));
  const sizes: number[] = [];
  // Bij step 3 en min 4 is 4 geen geldige groep: pas vanaf 6 klopt het weer.
  const first = step === 1 ? spec.min : Math.ceil(spec.min / step) * step;
  for (let size = first; size <= spec.max; size += step) sizes.push(size);
  return sizes;
}

/** Het kleinste aantal waarmee deze oefening kan draaien. */
export function smallestSize(spec: GroupSpec): number {
  return allowedSizes(spec)[0] ?? Math.max(spec.min, spec.step);
}

/**
 * Verdeel `present` aanwezigen over groepen.
 *
 * Levert altijd een antwoord: kan het niet, dan staat in `problems` waaróm, met
 * het dichtstbijzijnde aantal dat wél werkt. Dat is bruikbaarder dan een lege
 * uitkomst — de trainer wil weten of ze één speler tekortkomt of tien.
 */
export function distribute(present: number, spec: GroupSpec): Distribution {
  const sizes = allowedSizes(spec);
  const smallest = sizes[0];
  const largest = sizes[sizes.length - 1];
  const maxGroups = Math.max(1, Math.floor(spec.maxGroups));

  if (smallest === undefined || largest === undefined) {
    return empty(present, [{ kind: 'too-few', needed: spec.min, short: spec.min - present }]);
  }

  if (present < smallest) {
    return empty(present, [
      { kind: 'too-few', needed: smallest, short: smallest - present },
    ]);
  }

  let best: number[] | null = null;
  for (let count = 1; count <= maxGroups; count++) {
    const groups = fill(present, count, sizes);
    if (!groups) continue;
    if (!best || better(groups, best)) best = groups;
  }

  if (!best) return empty(present, [{ kind: 'too-few', needed: smallest, short: smallest - present }]);

  const playing = best.reduce((sum, size) => sum + size, 0);
  const waiting = present - playing;
  const problems: FitProblem[] = [];
  if (waiting > 0 && spec.step > 1) {
    // Bij drietallen is 'er blijven er twee over' de normale uitkomst; benoem
    // meteen welk aantal wél precies uitkomt.
    problems.push({
      kind: 'step',
      step: spec.step,
      nearestBelow: playing,
      nearestAbove: playing + spec.step,
    });
  }

  return { groups: best, playing, waiting, exact: waiting === 0, problems, possible: true };
}

/** Grootste totaal dat met precies `count` groepen te bereiken is, verdeeld. */
function fill(present: number, count: number, sizes: number[]): number[] | null {
  const smallest = sizes[0];
  const largest = sizes[sizes.length - 1];
  if (smallest === undefined || largest === undefined) return null;
  if (count * smallest > present) return null;

  const step = sizes.length > 1 ? (sizes[1] as number) - smallest : 1;
  const room = Math.min(present, count * largest) - count * smallest;
  const total = count * smallest + Math.floor(room / step) * step;

  // Zo gelijk mogelijk verdelen: iedereen krijgt `smallest`, en de ruimte die
  // overblijft gaat in stappen rond tot ze op is.
  const groups = new Array<number>(count).fill(smallest);
  let left = total - count * smallest;
  for (let i = 0; left > 0; i = (i + 1) % count) {
    const current = groups[i] as number;
    if (current + step <= largest) {
      groups[i] = current + step;
      left -= step;
    } else if (groups.every((size) => size >= largest)) {
      break;
    }
  }
  return groups.sort((a, b) => b - a);
}

/** Meer spelend is beter; daarna meer groepen; daarna gelijkmatiger. */
function better(a: number[], b: number[]): boolean {
  const sumA = a.reduce((s, n) => s + n, 0);
  const sumB = b.reduce((s, n) => s + n, 0);
  if (sumA !== sumB) return sumA > sumB;
  if (a.length !== b.length) return a.length > b.length;
  return spread(a) < spread(b);
}

function spread(groups: number[]): number {
  const max = Math.max(...groups);
  const min = Math.min(...groups);
  return max - min;
}

function empty(present: number, problems: FitProblem[]): Distribution {
  return { groups: [], playing: 0, waiting: present, exact: false, problems, possible: false };
}

// ---------- Wie doet er mee ----------

export interface AssignedGroup {
  /** 1-based, zoals op het trainingsblad: 'groep 1'. */
  number: number;
  players: Player[];
}

export interface Assignment {
  groups: AssignedGroup[];
  /** Wie deze beurt wachten, in de volgorde waarin ze erin komen. */
  waiting: Player[];
  distribution: Distribution;
  problems: FitProblem[];
}

export interface AssignOptions {
  /**
   * Hoeveel plekken de verdeling opschuift. Beurt 0 is de eerste ronde; elke
   * volgende beurt schuift met het aantal spelende plekken op, zodat wie
   * gewacht heeft als eerste weer meedoet.
   */
  round?: number;
}

/**
 * Wijs echte spelers toe aan de groepen.
 *
 * Twee dingen sturen de volgorde. Ten eerste de rollen: vraagt een oefening om
 * een spelverdeler per groep, dan worden de spelverdelers eerst over de groepen
 * verdeeld en pas daarna de rest. Ten tweede de beurt: wie de vorige ronde
 * wachtte, staat de volgende ronde vooraan.
 */
export function assign(
  present: readonly Player[],
  spec: GroupSpec,
  options: AssignOptions = {},
): Assignment {
  const distribution = distribute(present.length, spec);
  const problems = [...distribution.problems, ...roleProblems(present, spec, distribution)];

  if (!distribution.possible) {
    return { groups: [], waiting: [...present], distribution, problems };
  }

  const rotated = rotate(present, distribution.playing, options.round ?? 0);
  const playing = rotated.slice(0, distribution.playing);
  const waiting = rotated.slice(distribution.playing);

  const groups: AssignedGroup[] = distribution.groups.map((size, index) => ({
    number: index + 1,
    players: [],
  }));
  const sizes = distribution.groups;

  // Eerst de gevraagde posities eerlijk rondverdelen, daarna de rest opvullen.
  const pool = [...playing];
  for (const role of spec.roles) {
    for (let n = 0; n < role.count; n++) {
      for (const group of groups) {
        const capacity = sizes[group.number - 1] as number;
        if (group.players.length >= capacity) continue;
        const index = pool.findIndex((player) => player.positions.includes(role.position));
        if (index < 0) break;
        group.players.push(pool.splice(index, 1)[0] as Player);
      }
    }
  }

  for (const group of groups) {
    const capacity = sizes[group.number - 1] as number;
    while (group.players.length < capacity) {
      const next = pool.shift();
      if (!next) break;
      group.players.push(next);
    }
  }

  return { groups, waiting, distribution, problems };
}

/**
 * Wisselschema: wie er per beurt meedoen, zodat niemand structureel wacht.
 *
 * Elke beurt schuift de lijst op met het aantal spelende plekken. Na
 * `aanwezigen / ggd` beurten is iedereen even vaak aan de beurt geweest.
 */
export function rotationRounds(
  present: readonly Player[],
  spec: GroupSpec,
  maxRounds = 6,
): Assignment[] {
  const distribution = distribute(present.length, spec);
  if (!distribution.possible || distribution.waiting === 0) {
    return [assign(present, spec)];
  }
  const total = present.length;
  const step = distribution.playing;
  const rounds = Math.min(maxRounds, total / gcd(total, step));
  const list: Assignment[] = [];
  for (let round = 0; round < rounds; round++) list.push(assign(present, spec, { round }));
  return list;
}

/** Hoe vaak elke speler meedoet in dit schema; om te controleren of het eerlijk is. */
export function turnsPerPlayer(rounds: readonly Assignment[]): Map<string, number> {
  const turns = new Map<string, number>();
  for (const round of rounds) {
    for (const group of round.groups) {
      for (const player of group.players) {
        turns.set(player.id, (turns.get(player.id) ?? 0) + 1);
      }
    }
  }
  return turns;
}

function rotate<T>(list: readonly T[], step: number, round: number): T[] {
  if (list.length === 0) return [];
  const offset = ((step * round) % list.length + list.length) % list.length;
  return [...list.slice(offset), ...list.slice(0, offset)];
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

function roleProblems(
  present: readonly Player[],
  spec: GroupSpec,
  distribution: Distribution,
): FitProblem[] {
  if (!distribution.possible) return [];
  const problems: FitProblem[] = [];
  for (const role of spec.roles) {
    if (!role.required) continue;
    const needed = role.count * distribution.groups.length;
    const available = present.filter((player) => player.positions.includes(role.position)).length;
    if (available < needed) {
      problems.push({ kind: 'missing-role', position: role.position, needed, available });
    }
  }
  return problems;
}

/** Vraagt deze oefening om posities die er niet zijn? */
export function hasRequiredRoles(present: readonly Player[], roles: readonly RoleRequirement[]): boolean {
  return roles.every(
    (role) =>
      !role.required ||
      present.filter((player) => player.positions.includes(role.position)).length >= role.count,
  );
}
