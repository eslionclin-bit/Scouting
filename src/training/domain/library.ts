/**
 * Zoeken en filteren in de oefeningenbank.
 *
 * De bank groeit hard zodra je hem deelt: je eigen oefeningen, die van je
 * groep, en wat anderen openbaar hebben gezet. Filteren is daarom geen extraatje
 * maar de manier waarop je hem gebruikt. Alle filters staan hier bij elkaar en
 * werken op gewone lijsten, zodat ze te testen zijn zonder database of scherm.
 */

import { allowedSizes, distribute, hasRequiredRoles } from './grouping';
import type { Exercise, Goal, GroupSpec, Player, Visibility } from './types';

/** Herkomst van een oefening, zoals je erop filtert. */
export type Origin = 'mine' | 'others' | 'builtin';

export interface LibraryFilter {
  /** Vrije tekst: titel, samenvatting, uitleg en materiaal. */
  search: string;
  /** Oefening moet minstens één van deze doelen trainen; leeg = alles. */
  goals: Goal[];
  origins: Origin[];
  visibilities: Visibility[];
  /** Alleen oefeningen die met dit aantal aanwezigen kunnen draaien. */
  participants: number | null;
  /** Alleen oefeningen die binnen deze tijd passen. */
  maxMinutes: number | null;
  levels: (1 | 2 | 3)[];
  /** Alleen oefeningen die met deze groep gedeeld zijn. */
  groupId: string | null;
  /** Alleen oefeningen met een animatie. */
  withAnimation: boolean;
}

export function emptyFilter(): LibraryFilter {
  return {
    search: '',
    goals: [],
    origins: [],
    visibilities: [],
    participants: null,
    maxMinutes: null,
    levels: [],
    groupId: null,
    withAnimation: false,
  };
}

export function isEmptyFilter(filter: LibraryFilter): boolean {
  return (
    filter.search.trim() === '' &&
    filter.goals.length === 0 &&
    filter.origins.length === 0 &&
    filter.visibilities.length === 0 &&
    filter.participants === null &&
    filter.maxMinutes === null &&
    filter.levels.length === 0 &&
    filter.groupId === null &&
    !filter.withAnimation
  );
}

export function originOf(exercise: Exercise, meId: string): Origin {
  if (exercise.builtIn) return 'builtin';
  return exercise.authorId === meId ? 'mine' : 'others';
}

export const ORIGIN_LABELS: Record<Origin, string> = {
  mine: 'Van mij',
  others: 'Van anderen',
  builtin: 'Uit de bank',
};

/** Past deze oefening bij dit aantal deelnemers? */
export function fitsParticipants(exercise: Exercise, participants: number): boolean {
  return distribute(participants, exercise.group).possible;
}

/** Draait de oefening precies uit met dit aantal, zonder wachters? */
export function fitsExactly(exercise: Exercise, participants: number): boolean {
  return distribute(participants, exercise.group).exact;
}

export function filterExercises(
  exercises: readonly Exercise[],
  filter: LibraryFilter,
  meId: string,
): Exercise[] {
  const needle = filter.search.trim().toLowerCase();
  return exercises.filter((exercise) => {
    if (exercise.deletedAt) return false;
    if (needle && !matchesText(exercise, needle)) return false;
    if (filter.goals.length && !filter.goals.some((goal) => exercise.goals.includes(goal))) {
      return false;
    }
    if (filter.origins.length && !filter.origins.includes(originOf(exercise, meId))) return false;
    if (filter.visibilities.length && !filter.visibilities.includes(exercise.visibility)) return false;
    if (filter.participants !== null && !fitsParticipants(exercise, filter.participants)) return false;
    if (filter.maxMinutes !== null && exercise.minutes > filter.maxMinutes) return false;
    if (filter.levels.length && !filter.levels.includes(exercise.level)) return false;
    if (filter.groupId && !exercise.groupIds.includes(filter.groupId)) return false;
    if (filter.withAnimation && !exercise.animation) return false;
    return true;
  });
}

function matchesText(exercise: Exercise, needle: string): boolean {
  const haystack = [
    exercise.title,
    exercise.summary,
    exercise.description,
    exercise.material.join(' '),
    exercise.coachingPoints.join(' '),
    exercise.authorName,
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(needle);
}

/**
 * Volgorde in de lijst: wat past bovenaan.
 *
 * Met een aanwezigenaantal erbij komt eerst wat precies uitkomt, dan wat kan
 * met wachters, dan de rest. Zonder aantal is het gewoon alfabetisch — dan is
 * de lijst voorspelbaar, en dat is bij bladeren prettiger dan slim.
 */
export function sortExercises(
  exercises: readonly Exercise[],
  participants: number | null,
): Exercise[] {
  const sorted = [...exercises];
  if (participants === null) {
    return sorted.sort((a, b) => a.title.localeCompare(b.title, 'nl'));
  }
  return sorted.sort((a, b) => rank(a, participants) - rank(b, participants)
    || a.title.localeCompare(b.title, 'nl'));
}

function rank(exercise: Exercise, participants: number): number {
  const result = distribute(participants, exercise.group);
  if (result.exact) return 0;
  if (result.possible) return 1 + result.waiting / 100;
  return 3;
}

/** Korte uitleg van de deelnemersvraag, voor op de kaart: '4-10, in tweetallen'. */
export function describeGroupSpec(exercise: Exercise): string {
  const spec = exercise.group;
  const sizes = allowedSizes(spec);
  const first = sizes[0] ?? spec.min;
  const last = sizes[sizes.length - 1] ?? spec.max;
  const range = first === last ? `${first} spelers` : `${first}-${last} spelers`;
  const parts = [range];
  if (spec.step > 1) parts.push(stepLabel(spec.step));
  if (spec.maxGroups > 1) parts.push(`tot ${spec.maxGroups}x naast elkaar`);
  return parts.join(' · ');
}

function stepLabel(step: number): string {
  if (step === 2) return 'in tweetallen';
  if (step === 3) return 'in drietallen';
  if (step === 4) return 'in viertallen';
  return `in groepjes van ${step}`;
}

/**
 * Oefeningen die het dichtst bij een gegeven oefening liggen: zelfde doelen,
 * maar wél passend bij de aanwezigen. Dit voedt 'zoek een alternatief'.
 */
export function alternativesFor(
  exercise: Exercise,
  exercises: readonly Exercise[],
  present: readonly Player[],
  limit = 5,
): Exercise[] {
  const count = present.length;
  return exercises
    .filter((other) => other.id !== exercise.id && !other.deletedAt)
    .filter((other) => other.goals.some((goal) => exercise.goals.includes(goal)))
    .filter((other) => distribute(count, other.group).possible)
    .filter((other) => hasRequiredRoles(present, other.group.roles))
    .sort((a, b) => overlap(b, exercise) - overlap(a, exercise) || rank(a, count) - rank(b, count))
    .slice(0, limit);
}

function overlap(a: Exercise, b: Exercise): number {
  return a.goals.filter((goal) => b.goals.includes(goal)).length;
}

/**
 * De groepsvraag omzetten naar 'in tweetallen', 'in drietallen', enzovoort.
 *
 * In het formulier stonden vier getallen naast elkaar (kleinste, grootste, per,
 * hoe vaak naast elkaar) en die vier zeggen los van elkaar weinig. Wie een
 * oefening in drietallen opschrijft, denkt niet in stappen van drie maar in
 * drietallen — dus is dát de knop, en schuiven de grenzen mee naar wat er dan
 * nog kan.
 */
export function withStep(spec: GroupSpec, step: number): GroupSpec {
  const stap = Math.max(1, Math.round(step));
  if (stap === 1) return { ...spec, step: 1 };

  const min = Math.max(stap, Math.ceil(spec.min / stap) * stap);
  const max = Math.max(min, Math.floor(spec.max / stap) * stap);
  return { ...spec, step: stap, min, max };
}

/**
 * De ene regel die in de lijst staat, afgeleid uit de uitleg.
 *
 * Er stond een apart veld voor, en dat is er een te veel: wie een oefening
 * opschrijft heeft de eerste zin al getypt. Blijft het veld leeg, dan pakt de
 * app die zin. Zelf iets anders invullen mag nog steeds.
 */
export function summaryFrom(description: string, limit = 120): string {
  const text = description.trim().replace(/\s+/g, ' ');
  if (text === '') return '';
  const end = text.search(/[.!?](\s|$)/);
  const sentence = end > 0 ? text.slice(0, end + 1) : text;
  return sentence.length > limit ? `${sentence.slice(0, limit - 1).trimEnd()}…` : sentence;
}
