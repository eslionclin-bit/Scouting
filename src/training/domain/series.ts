/**
 * Reeksen: trainingen voor een hele periode in één keer klaarzetten.
 *
 * Wat de app hier doet is het saaie deel: data uitrekenen, accenten over de
 * weken verdelen en per training oefeningen kiezen die bij het accent horen,
 * bij de groepsgrootte passen en niet elke week dezelfde zijn. Wat de app
 * bewust níét doet, is de reeks vaststellen: alles wat eruit komt is een
 * concept dat je per training aanpast. Vandaar dat dit gewone trainingen
 * oplevert en geen apart soort record.
 */

import { newId } from '../../domain/ids';
import { distribute } from './grouping';
import type {
  BlockKind,
  Exercise,
  Goal,
  PeriodAccent,
  Series,
  Training,
  TrainingBlock,
} from './types';

/**
 * Standaardopbouw van een seizoen, als je zelf geen accenten invult.
 *
 * De volgorde is die van een gewone jaarplanning: eerst het lichaam en de
 * techniek terug, dan het spel opbouwen, dan naar de wedstrijd toe.
 */
export function defaultAccents(): PeriodAccent[] {
  return [
    { weeks: 4, label: 'Voorbereiding', goals: ['conditioning', 'technique', 'pass'] },
    { weeks: 6, label: 'Opbouw', goals: ['pass', 'set', 'attack', 'serve'] },
    { weeks: 8, label: 'Competitie', goals: ['attack', 'block', 'defense', 'tactics'] },
    { weeks: 4, label: 'Scherp blijven', goals: ['tactics', 'positioning', 'serve'] },
  ];
}

/** Alle datums in de periode die op een trainingsdag vallen. */
export function trainingDates(startDate: string, endDate: string, weekdays: readonly number[]): string[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start || !end || weekdays.length === 0 || end < start) return [];
  const days = new Set(weekdays);
  const dates: string[] = [];
  const cursor = new Date(start);
  // Bovengrens tegen een typefout in de einddatum: vijf jaar trainen is genoeg.
  for (let guard = 0; cursor <= end && guard < 2000; guard++) {
    if (days.has(isoWeekday(cursor))) dates.push(toIso(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/** Het accent dat in week `weekIndex` (0-based) van de reeks geldt. */
export function accentForWeek(accents: readonly PeriodAccent[], weekIndex: number): PeriodAccent | null {
  if (accents.length === 0) return null;
  let start = 0;
  for (const accent of accents) {
    const weeks = Math.max(1, accent.weeks);
    if (weekIndex < start + weeks) return accent;
    start += weeks;
  }
  // Loopt de reeks langer dan de accenten, dan blijft het laatste accent staan.
  return accents[accents.length - 1] ?? null;
}

export interface GenerateOptions {
  /** Waar de oefeningen vandaan komen. */
  library: readonly Exercise[];
  /** Op hoeveel speelsters je rekent; stuurt welke oefeningen passen. */
  expectedParticipants: number;
  teamId: string | null;
  authorId: string;
  authorName: string;
  /** Vaste aanvangstijd, bijvoorbeeld '20:00'. */
  time?: string | null;
  location?: string | null;
  /** Nu, zodat de records een tijdstempel hebben. Alleen voor tests interessant. */
  now?: () => string;
}

export interface GeneratedSeries {
  series: Series;
  trainings: Training[];
}

/**
 * De opbouw van elke training: warming-up, twee kernblokken, wedstrijdvorm,
 * afsluiting. De minuten zijn een verhouding; ze worden geschaald naar de
 * werkelijke duur van de reeks.
 */
const SHAPE: { kind: BlockKind; share: number }[] = [
  { kind: 'warmup', share: 0.17 },
  { kind: 'core', share: 0.27 },
  { kind: 'core', share: 0.27 },
  { kind: 'game', share: 0.22 },
  { kind: 'cooldown', share: 0.07 },
];

export function generateSeries(
  input: Pick<Series, 'name' | 'startDate' | 'endDate' | 'weekdays' | 'minutes' | 'accents' | 'visibility' | 'groupIds'>,
  options: GenerateOptions,
): GeneratedSeries {
  const now = options.now ?? (() => new Date().toISOString());
  const stamp = now();
  const accents = input.accents.length > 0 ? input.accents : defaultAccents();
  const dates = trainingDates(input.startDate, input.endDate, input.weekdays);
  const seriesId = newId();

  // Wat er de afgelopen trainingen al gebruikt is: hoe recenter, hoe zwaarder
  // het meetelt. Zo staat dezelfde oefening niet twee weken achter elkaar op
  // het blad, maar mag hij later in de reeks wel terugkomen.
  const usedAt = new Map<string, number>();

  const trainings: Training[] = dates.map((date, index) => {
    const weekIndex = Math.floor(index / Math.max(1, input.weekdays.length));
    const accent = accentForWeek(accents, weekIndex);
    const goals = accent?.goals ?? [];
    const blocks: TrainingBlock[] = [];

    for (const slot of SHAPE) {
      const minutes = Math.max(5, Math.round((input.minutes * slot.share) / 5) * 5);
      const exercise = pick(options.library, {
        slot: slot.kind,
        goals,
        participants: options.expectedParticipants,
        usedAt,
        index,
      });
      if (exercise) usedAt.set(exercise.id, index);
      blocks.push({
        id: newId(),
        kind: slot.kind,
        exerciseId: exercise?.id ?? null,
        title: exercise ? null : fallbackTitle(slot.kind),
        minutes,
        variantId: null,
        note: null,
      });
    }

    return {
      id: newId(),
      teamId: options.teamId,
      title: accent ? `${accent.label} — training ${index + 1}` : `Training ${index + 1}`,
      date,
      time: options.time ?? null,
      location: options.location ?? null,
      focus: accent ? accent.goals.join(', ') : null,
      blocks,
      attendance: [],
      absent: [],
      seriesId,
      visibility: input.visibility,
      groupIds: [...input.groupIds],
      done: false,
      evaluation: null,
      rev: '',
      updatedAt: stamp,
      deletedAt: null,
      authorId: options.authorId,
      authorName: options.authorName,
    };
  });

  const series: Series = {
    id: seriesId,
    name: input.name,
    teamId: options.teamId,
    startDate: input.startDate,
    endDate: input.endDate,
    weekdays: [...input.weekdays],
    minutes: input.minutes,
    accents,
    trainingIds: trainings.map((training) => training.id),
    visibility: input.visibility,
    groupIds: [...input.groupIds],
    notes: null,
    rev: '',
    updatedAt: stamp,
    deletedAt: null,
    authorId: options.authorId,
    authorName: options.authorName,
  };

  return { series, trainings };
}

interface PickInput {
  slot: BlockKind;
  goals: readonly Goal[];
  participants: number;
  usedAt: Map<string, number>;
  index: number;
}

/**
 * Kies één oefening voor een blok.
 *
 * Volgorde van belang: hij moet in dit blok passen, hij moet met dit aantal
 * kunnen, en dan pas telt het accent. Een oefening die deze reeks nog niet
 * gebruikt is gaat voor; wat pas gebruikt is, valt af tenzij er niets anders is.
 */
function pick(library: readonly Exercise[], input: PickInput): Exercise | null {
  const candidates = library
    .filter((exercise) => !exercise.deletedAt)
    .filter((exercise) => exercise.slots.includes(input.slot))
    .filter((exercise) => distribute(input.participants, exercise.group).possible);
  if (candidates.length === 0) return null;

  const scored = candidates.map((exercise) => ({
    exercise,
    score: score(exercise, input),
  }));
  scored.sort((a, b) => b.score - a.score || a.exercise.title.localeCompare(b.exercise.title, 'nl'));
  return scored[0]?.exercise ?? null;
}

function score(exercise: Exercise, input: PickInput): number {
  let score = 0;
  const matches = exercise.goals.filter((goal) => input.goals.includes(goal)).length;
  score += matches * 10;

  const used = input.usedAt.get(exercise.id);
  if (used !== undefined) {
    const ago = input.index - used;
    // Twee keer in dezelfde training is uitgesloten, en de training erna wint
    // een oefening het nooit van een alternatief dat er ook mag staan — hoe
    // goed hij ook bij het accent past. Vier trainingen later telt het niet meer.
    if (ago === 0) score -= 1000;
    else score -= Math.max(0, 60 - (ago - 1) * 15);
  }

  const fit = distribute(input.participants, exercise.group);
  if (fit.exact) score += 3;
  score -= fit.waiting;
  if (exercise.animation) score += 1;
  return score;
}

function fallbackTitle(kind: BlockKind): string {
  switch (kind) {
    case 'warmup':
      return 'Inlopen en inspelen';
    case 'core':
      return 'Kern — zelf invullen';
    case 'game':
      return 'Wedstrijdvorm';
    case 'cooldown':
      return 'Uitlopen en rekken';
  }
}

/** ISO-weekdag: 1 = maandag ... 7 = zondag. */
export function isoWeekday(date: Date): number {
  return ((date.getUTCDay() + 6) % 7) + 1;
}

export const WEEKDAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'] as const;

export function parseDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Datum zoals hij op het scherm staat: 'di 14 okt'. */
export function formatDate(iso: string, withYear = false): string {
  const date = parseDate(iso);
  if (!date) return iso;
  const day = WEEKDAY_LABELS[isoWeekday(date) - 1];
  const month = MONTHS[date.getUTCMonth()];
  return `${day} ${date.getUTCDate()} ${month}${withYear ? ` ${date.getUTCFullYear()}` : ''}`;
}

const MONTHS = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
] as const;
