/** Hulpjes om in tests snel een team, een bank en een training op te zetten. */

import { newId } from '../../domain/ids';
import type {
  Exercise,
  Goal,
  GroupSpec,
  Player,
  Position,
  Training,
  TrainingBlock,
} from '../domain/types';

const META = { rev: 'r', updatedAt: '2026-08-01T18:00:00.000Z', deletedAt: null };
const AUTHOR = { authorId: 'trainer-1', authorName: 'Marit' };

export function makePlayer(partial: Partial<Player> = {}): Player {
  return {
    id: newId(),
    teamId: 'team-1',
    name: 'Speler',
    number: null,
    positions: [],
    active: true,
    notes: null,
    ...META,
    ...AUTHOR,
    ...partial,
  };
}

/** Een selectie van twaalf, met de posities die een team nu eenmaal heeft. */
export function makeSquad(size = 12): Player[] {
  const positions: Position[][] = [
    ['setter'], ['outside'], ['middle'], ['opposite'], ['outside'], ['middle'],
    ['setter'], ['libero'], ['outside'], ['middle'], ['opposite'], ['outside'],
  ];
  return Array.from({ length: size }, (_, index) =>
    makePlayer({
      id: `speler-${index + 1}`,
      name: `Speler ${index + 1}`,
      number: index + 1,
      positions: positions[index % positions.length] ?? [],
    }),
  );
}

export function makeGroupSpec(partial: Partial<GroupSpec> = {}): GroupSpec {
  return { min: 4, max: 12, step: 1, maxGroups: 2, roles: [], ...partial };
}

export function makeExercise(partial: Partial<Exercise> = {}): Exercise {
  return {
    id: newId(),
    title: 'Oefening',
    summary: 'Korte omschrijving',
    description: 'Uitleg van de oefening.',
    goals: ['pass'] as Goal[],
    level: 2,
    minutes: 15,
    material: ['ballen'],
    group: makeGroupSpec(),
    slots: ['core'],
    coachingPoints: [],
    variants: [],
    animation: null,
    visibility: 'private',
    groupIds: [],
    builtIn: false,
    copiedFromId: null,
    ...META,
    ...AUTHOR,
    ...partial,
  };
}

export function makeBlock(partial: Partial<TrainingBlock> = {}): TrainingBlock {
  return {
    id: newId(),
    kind: 'core',
    exerciseId: null,
    title: 'Blok',
    minutes: 20,
    variantId: null,
    note: null,
    ...partial,
  };
}

export function makeTraining(partial: Partial<Training> = {}): Training {
  return {
    id: newId(),
    teamId: 'team-1',
    title: 'Training',
    date: '2026-09-08',
    time: '20:00',
    location: 'Sporthal De Trits',
    focus: null,
    blocks: [],
    attendance: [],
    absent: [],
    seriesId: null,
    visibility: 'private',
    groupIds: [],
    done: false,
    evaluation: null,
    ...META,
    ...AUTHOR,
    ...partial,
  };
}
