import { describe, expect, it } from 'vitest';
import { BUILT_IN_EXERCISES, copyExercise, fullLibrary } from './index';
import { allowedSizes, distribute } from '../domain/grouping';
import { frameAt, totalDuration } from '../domain/animation';
import { makeExercise } from '../test/factory';
import { BLOCK_KINDS, GOALS } from '../domain/types';

describe('de ingebouwde bank', () => {
  it('heeft unieke ids', () => {
    const ids = BUILT_IN_EXERCISES.map((exercise) => exercise.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('heeft van elke oefening een werkbare groepsvraag', () => {
    for (const exercise of BUILT_IN_EXERCISES) {
      const sizes = allowedSizes(exercise.group);
      expect(sizes.length, exercise.title).toBeGreaterThan(0);
      expect(distribute(sizes[0] as number, exercise.group).possible, exercise.title).toBe(true);
    }
  });

  it('gebruikt alleen bekende doelen en blokken', () => {
    for (const exercise of BUILT_IN_EXERCISES) {
      expect(exercise.goals.length, exercise.title).toBeGreaterThan(0);
      for (const goal of exercise.goals) expect(GOALS).toContain(goal);
      for (const slot of exercise.slots) expect(BLOCK_KINDS).toContain(slot);
    }
  });

  it('dekt samen elk doel en elk deel van een training', () => {
    const goals = new Set(BUILT_IN_EXERCISES.flatMap((exercise) => exercise.goals));
    for (const goal of GOALS) expect([...goals]).toContain(goal);
    const slots = new Set(BUILT_IN_EXERCISES.flatMap((exercise) => exercise.slots));
    for (const kind of BLOCK_KINDS) expect([...slots]).toContain(kind);
  });

  it('heeft animaties die alleen naar bestaande markers verwijzen', () => {
    for (const exercise of BUILT_IN_EXERCISES) {
      const animation = exercise.animation;
      if (!animation) continue;
      const ids = new Set(animation.markers.map((marker) => marker.id));
      expect(animation.phases.length, exercise.title).toBeGreaterThan(0);
      for (const phase of animation.phases) {
        for (const key of Object.keys(phase.positions)) expect(ids, exercise.title).toContain(key);
        for (const path of phase.paths) expect(ids, exercise.title).toContain(path.markerId);
      }
    }
  });

  it('zet elke marker neer voordat hij beweegt', () => {
    for (const exercise of BUILT_IN_EXERCISES) {
      const animation = exercise.animation;
      if (!animation) continue;
      const placed = new Set<string>();
      for (const phase of animation.phases) {
        for (const key of Object.keys(phase.positions)) placed.add(key);
        for (const path of phase.paths) expect(placed, `${exercise.title}: ${path.markerId}`).toContain(path.markerId);
      }
    }
  });

  it('speelt elke animatie af zonder gaten', () => {
    for (const exercise of BUILT_IN_EXERCISES) {
      const animation = exercise.animation;
      if (!animation) continue;
      const duration = totalDuration(animation);
      expect(duration, exercise.title).toBeGreaterThan(0);
      for (const time of [0, duration / 3, duration / 2, duration - 1]) {
        const frame = frameAt(animation, time);
        expect(Object.keys(frame.positions).length, exercise.title).toBeGreaterThan(0);
      }
    }
  });

  it('is niet te wijzigen en wordt nooit gedeeld', () => {
    for (const exercise of BUILT_IN_EXERCISES) {
      expect(exercise.builtIn).toBe(true);
      expect(exercise.visibility).toBe('private');
    }
  });
});

describe('bank samenstellen', () => {
  it('zet eigen oefeningen naast de ingebouwde', () => {
    const mine = makeExercise({ title: 'Van mij' });
    expect(fullLibrary([mine])).toHaveLength(BUILT_IN_EXERCISES.length + 1);
  });

  it('laat een aangepaste kopie het origineel niet dubbel tonen', () => {
    const overschreven = { ...(BUILT_IN_EXERCISES[0] as never as ReturnType<typeof makeExercise>), title: 'Aangepast' };
    const library = fullLibrary([overschreven]);
    expect(library.filter((e) => e.id === overschreven.id)).toHaveLength(1);
    expect(library.find((e) => e.id === overschreven.id)?.title).toBe('Aangepast');
  });
});

describe('kopiëren', () => {
  const profile = { id: 'trainer-9', name: 'Joost' };

  it('geeft de kopie een nieuw id, jouw naam en privé als zichtbaarheid', () => {
    const bron = BUILT_IN_EXERCISES[1] as (typeof BUILT_IN_EXERCISES)[number];
    const kopie = copyExercise(bron, profile);
    expect(kopie.id).not.toBe(bron.id);
    expect(kopie.authorName).toBe('Joost');
    expect(kopie.visibility).toBe('private');
    expect(kopie.builtIn).toBe(false);
    expect(kopie.copiedFromId).toBe(bron.id);
  });

  it('geeft varianten een eigen id, zodat ze niet aan het origineel vastzitten', () => {
    const bron = BUILT_IN_EXERCISES.find((e) => e.variants.length > 0);
    const kopie = copyExercise(bron as never, profile);
    expect(kopie.variants[0]?.id).not.toBe(bron?.variants[0]?.id);
  });

  it('noemt een kopie van je eigen oefening ook zo', () => {
    const eigen = makeExercise({ title: 'Pepperen', authorId: profile.id });
    expect(copyExercise(eigen, profile).title).toBe('Pepperen (kopie)');
  });
});
