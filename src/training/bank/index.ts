/**
 * De bank zoals de app hem ziet: de ingebouwde oefeningen plus alles wat er
 * lokaal bij staat — je eigen oefeningen en wat er via een groep of openbaar
 * binnenkwam.
 */

import { newId } from '../../domain/ids';
import type { Exercise, Profile } from '../domain/types';
import { BUILT_IN_EXERCISES } from './builtin';

export { BUILT_IN_EXERCISES, builtInById } from './builtin';

/**
 * Alles bij elkaar.
 *
 * Heeft iemand een ingebouwde oefening gekopieerd en aangepast, dan staan ze
 * allebei in de lijst: dat is de bedoeling — de kopie is van jou, het origineel
 * blijft waar het stond.
 */
export function fullLibrary(stored: readonly Exercise[]): Exercise[] {
  const own = stored.filter((exercise) => !exercise.deletedAt);
  const ids = new Set(own.map((exercise) => exercise.id));
  return [...BUILT_IN_EXERCISES.filter((exercise) => !ids.has(exercise.id)), ...own];
}

/**
 * Een oefening overnemen in je eigen bank.
 *
 * Gebeurt in twee gevallen: je wil een ingebouwde oefening aanpassen, of je ziet
 * er een van iemand anders die je wil bewaren. In beide gevallen krijgt de kopie
 * een nieuw id en jouw naam, en begint hij privé — delen is een aparte keuze.
 * `copiedFromId` blijft staan zodat te zien is waar hij vandaan komt.
 */
export function copyExercise(exercise: Exercise, profile: Profile): Exercise {
  return {
    ...exercise,
    id: newId(),
    title: exercise.authorId === profile.id ? `${exercise.title} (kopie)` : exercise.title,
    visibility: 'private',
    groupIds: [],
    builtIn: false,
    copiedFromId: exercise.id,
    authorId: profile.id,
    authorName: profile.name,
    variants: exercise.variants.map((variant) => ({ ...variant, id: newId() })),
    rev: '',
    updatedAt: '',
    deletedAt: null,
  };
}

/** Een lege oefening om mee te beginnen in het formulier. */
export function blankExercise(profile: Profile): Exercise {
  return {
    id: newId(),
    title: '',
    summary: '',
    description: '',
    goals: [],
    level: 2,
    minutes: 15,
    material: [],
    group: { min: 4, max: 12, step: 1, maxGroups: 1, roles: [] },
    slots: ['core'],
    coachingPoints: [],
    variants: [],
    animation: null,
    visibility: 'private',
    groupIds: [],
    builtIn: false,
    copiedFromId: null,
    authorId: profile.id,
    authorName: profile.name,
    rev: '',
    updatedAt: '',
    deletedAt: null,
  };
}
