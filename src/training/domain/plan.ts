/**
 * Van een opgeslagen training naar wat er vanavond in de zaal gebeurt.
 *
 * De training zelf bewaart alleen wat je bedacht hebt: blokken, oefeningen,
 * minuten. Wie er komt weet je pas een uur van tevoren. Dit bestand rekent die
 * twee bij elkaar op: per blok de groepsverdeling, wie er begint, wie wachten,
 * en waar het wringt — een oefening in drietallen met acht aanwezigen, of geen
 * spelverdeler op de vloer.
 *
 * Het levert alleen een oordeel, nooit een wijziging. Wat er met een waarschuwing
 * gebeurt, beslist de trainer op het scherm.
 */

import { assign, distribute, rotationRounds } from './grouping';
import type { Assignment, FitProblem } from './grouping';
import { alternativesFor } from './library';
import type {
  BlockKind,
  Exercise,
  Goal,
  Player,
  Training,
  TrainingBlock,
  Variant,
} from './types';

export interface BlockWarning {
  severity: 'blocking' | 'notice';
  text: string;
}

export interface BlockPlan {
  block: TrainingBlock;
  exercise: Exercise | null;
  variant: Variant | null;
  title: string;
  kind: BlockKind;
  minutes: number;
  /** Klokttijd waarop dit blok begint, als de training een aanvangstijd heeft. */
  startsAt: string | null;
  assignment: Assignment | null;
  /** Beurten, zodat wachters erin rouleren. Leeg als iedereen meedoet. */
  rounds: Assignment[];
  /** Hoe lang één beurt duurt als er gewisseld wordt. */
  rotateEveryMinutes: number | null;
  warnings: BlockWarning[];
  /** Oefeningen met hetzelfde doel die wél passen; alleen bij een blokkade. */
  alternatives: Exercise[];
}

export interface TrainingPlan {
  training: Training;
  present: Player[];
  blocks: BlockPlan[];
  minutes: number;
  endsAt: string | null;
  /** Minuten per doel, om te zien of een training niet alleen maar pass is. */
  minutesPerGoal: Map<Goal, number>;
  blockingCount: number;
}

export interface PlanOptions {
  /** De hele bank, om alternatieven te kunnen voorstellen. */
  library?: readonly Exercise[];
}

export function buildPlan(
  training: Training,
  exercises: readonly Exercise[],
  players: readonly Player[],
  options: PlanOptions = {},
): TrainingPlan {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const present = presentPlayers(training, players);
  const library = options.library ?? exercises;

  let clock = parseTime(training.time);
  const blocks: BlockPlan[] = training.blocks.map((block) => {
    const exercise = block.exerciseId ? byId.get(block.exerciseId) ?? null : null;
    const variant = exercise && block.variantId
      ? exercise.variants.find((v) => v.id === block.variantId) ?? null
      : null;
    const spec = variant?.group ?? exercise?.group ?? null;
    const startsAt = clock === null ? null : formatTime(clock);
    const minutes = Math.max(0, block.minutes);
    if (clock !== null) clock += minutes;

    const assignment = spec && present.length > 0 ? assign(present, spec) : null;
    const rounds = spec && assignment && assignment.distribution.waiting > 0
      ? rotationRounds(present, spec)
      : [];
    const rotateEvery = rounds.length > 1 ? Math.max(1, Math.round(minutes / rounds.length)) : null;

    return {
      block,
      exercise,
      variant,
      title: block.title ?? variant?.title ?? exercise?.title ?? 'Naamloos blok',
      kind: block.kind,
      minutes,
      startsAt,
      assignment,
      rounds,
      rotateEveryMinutes: rotateEvery,
      warnings: warningsFor(block, exercise, present, assignment),
      alternatives:
        exercise && assignment && !assignment.distribution.possible
          ? alternativesFor(exercise, library, present)
          : [],
    };
  });

  const minutes = blocks.reduce((sum, block) => sum + block.minutes, 0);
  const start = parseTime(training.time);

  return {
    training,
    present,
    blocks,
    minutes,
    endsAt: start === null ? null : formatTime(start + minutes),
    minutesPerGoal: minutesPerGoal(blocks),
    blockingCount: blocks.filter((block) =>
      block.warnings.some((warning) => warning.severity === 'blocking'),
    ).length,
  };
}

/**
 * Wie er zijn.
 *
 * Is er nog niemand afgevinkt, dan gaat de app uit van de hele selectie: een
 * training die je in de week ervoor opbouwt hoort niet vol te staan met
 * waarschuwingen omdat er 'nul aanwezigen' zijn.
 */
export function presentPlayers(training: Training, players: readonly Player[]): Player[] {
  const squad = players.filter((player) => player.active && !player.deletedAt);
  const ofTeam = training.teamId ? squad.filter((p) => p.teamId === training.teamId) : squad;
  if (training.attendance.length === 0 && training.absent.length === 0) return ofTeam;
  if (training.attendance.length > 0) {
    const present = new Set(training.attendance);
    return ofTeam.filter((player) => present.has(player.id));
  }
  const absent = new Set(training.absent);
  return ofTeam.filter((player) => !absent.has(player.id));
}

function warningsFor(
  block: TrainingBlock,
  exercise: Exercise | null,
  present: readonly Player[],
  assignment: Assignment | null,
): BlockWarning[] {
  const warnings: BlockWarning[] = [];
  if (block.exerciseId && !exercise) {
    warnings.push({ severity: 'blocking', text: 'De oefening bij dit blok is niet gevonden.' });
    return warnings;
  }
  if (!assignment || !exercise) return warnings;
  if (present.length === 0) {
    warnings.push({ severity: 'notice', text: 'Nog niemand afgevinkt als aanwezig.' });
    return warnings;
  }
  for (const problem of assignment.problems) {
    warnings.push({ severity: severityOf(problem), text: describeProblem(problem) });
  }
  return warnings;
}

function severityOf(problem: FitProblem): BlockWarning['severity'] {
  return problem.kind === 'step' ? 'notice' : 'blocking';
}

export function describeProblem(problem: FitProblem): string {
  switch (problem.kind) {
    case 'too-few':
      return `Er zijn er minstens ${problem.needed} nodig, dat zijn er ${problem.short} te weinig.`;
    case 'step':
      return `Deze oefening gaat per ${problem.step}: ${problem.nearestBelow} doen mee, de rest wisselt in.`;
    case 'missing-role':
      return `Er zijn ${problem.needed} spelers met deze positie nodig, er ${problem.available === 1 ? 'is' : 'zijn'} er ${problem.available}.`;
  }
}

function minutesPerGoal(blocks: readonly BlockPlan[]): Map<Goal, number> {
  const total = new Map<Goal, number>();
  for (const block of blocks) {
    const goals = block.exercise?.goals ?? [];
    if (goals.length === 0) continue;
    // Een oefening die pass én set-up traint telt voor beide half mee; anders
    // lijkt een training met twee oefeningen ineens 100 minuten lang.
    const share = block.minutes / goals.length;
    for (const goal of goals) total.set(goal, (total.get(goal) ?? 0) + share);
  }
  return total;
}

/** Past de hele training binnen de beschikbare zaaltijd? */
export function overtime(plan: TrainingPlan, availableMinutes: number): number {
  return Math.max(0, plan.minutes - availableMinutes);
}

/**
 * Verdeel de beschikbare minuten evenredig over de blokken.
 *
 * Gebruikt als de zaal een half uur eerder dicht is: liever elk blok iets korter
 * dan het laatste blok schrappen, want de wedstrijdvorm aan het eind is meestal
 * juist wat de speelsters komen doen.
 */
export function rescale(blocks: readonly TrainingBlock[], availableMinutes: number): TrainingBlock[] {
  const total = blocks.reduce((sum, block) => sum + block.minutes, 0);
  if (total === 0 || availableMinutes <= 0) return [...blocks];
  const factor = availableMinutes / total;
  const scaled = blocks.map((block) => ({
    ...block,
    minutes: Math.max(5, Math.round((block.minutes * factor) / 5) * 5),
  }));
  return scaled;
}

function parseTime(time: string | null): number | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatTime(minutes: number): string {
  const total = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Alleen voor de schermen: hoeveel deelnemers deze oefening nu zou krijgen. */
export function participantsFor(exercise: Exercise, present: readonly Player[]): number {
  return distribute(present.length, exercise.group).playing;
}
