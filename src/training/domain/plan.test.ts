import { describe, expect, it } from 'vitest';
import { buildPlan, presentPlayers, rescale } from './plan';
import { makeBlock, makeExercise, makeGroupSpec, makeSquad, makeTraining } from '../test/factory';

describe('aanwezigheid', () => {
  const squad = makeSquad(12);

  it('gaat uit van de hele selectie zolang er niets is afgevinkt', () => {
    expect(presentPlayers(makeTraining(), squad)).toHaveLength(12);
  });

  it('gebruikt de afgevinkte spelers zodra die er zijn', () => {
    const training = makeTraining({ attendance: ['speler-1', 'speler-2', 'speler-3'] });
    expect(presentPlayers(training, squad).map((p) => p.id)).toEqual([
      'speler-1', 'speler-2', 'speler-3',
    ]);
  });

  it('haalt afmeldingen van de selectie af', () => {
    const training = makeTraining({ absent: ['speler-1'] });
    expect(presentPlayers(training, squad)).toHaveLength(11);
  });

  it('laat spelers buiten de selectie weg', () => {
    const gestopt = squad.map((p, i) => (i === 0 ? { ...p, active: false } : p));
    expect(presentPlayers(makeTraining(), gestopt)).toHaveLength(11);
  });
});

describe('trainingsplan', () => {
  const squad = makeSquad(8);

  it('rekent begintijden en eindtijd uit', () => {
    const training = makeTraining({
      time: '20:00',
      blocks: [makeBlock({ minutes: 15 }), makeBlock({ minutes: 30 })],
    });
    const plan = buildPlan(training, [], squad);
    expect(plan.blocks.map((b) => b.startsAt)).toEqual(['20:00', '20:15']);
    expect(plan.endsAt).toBe('20:45');
    expect(plan.minutes).toBe(45);
  });

  it('verdeelt de aanwezigen over de groepen van de oefening', () => {
    const exercise = makeExercise({ group: makeGroupSpec({ min: 4, max: 4, maxGroups: 2 }) });
    const training = makeTraining({ blocks: [makeBlock({ exerciseId: exercise.id })] });
    const plan = buildPlan(training, [exercise], squad);
    expect(plan.blocks[0]?.assignment?.groups).toHaveLength(2);
    expect(plan.blocks[0]?.warnings).toEqual([]);
  });

  it('waarschuwt als er te weinig aanwezig zijn en stelt een alternatief voor', () => {
    const zwaar = makeExercise({
      title: 'Zes tegen zes',
      goals: ['tactics'],
      group: makeGroupSpec({ min: 12, max: 12 }),
    });
    const licht = makeExercise({
      title: 'Vier tegen vier',
      goals: ['tactics'],
      group: makeGroupSpec({ min: 8, max: 8 }),
    });
    const training = makeTraining({ blocks: [makeBlock({ exerciseId: zwaar.id })] });
    const plan = buildPlan(training, [zwaar, licht], squad);
    const block = plan.blocks[0];
    expect(block?.warnings[0]?.severity).toBe('blocking');
    expect(block?.warnings[0]?.text).toContain('4 te weinig');
    expect(block?.alternatives.map((e) => e.title)).toEqual(['Vier tegen vier']);
    expect(plan.blockingCount).toBe(1);
  });

  it('meldt bij drietallen wie er wisselen in plaats van te blokkeren', () => {
    const exercise = makeExercise({
      group: makeGroupSpec({ min: 3, max: 3, step: 3, maxGroups: 3 }),
    });
    const training = makeTraining({ blocks: [makeBlock({ exerciseId: exercise.id, minutes: 20 })] });
    const plan = buildPlan(training, [exercise], squad);
    const block = plan.blocks[0];
    expect(block?.warnings[0]?.severity).toBe('notice');
    expect(block?.assignment?.distribution.groups).toEqual([3, 3]);
    expect(block?.rounds.length).toBeGreaterThan(1);
    expect(block?.rotateEveryMinutes).toBeGreaterThan(0);
  });

  it('telt de minuten per doel, gedeeld over de doelen van een oefening', () => {
    const exercise = makeExercise({ goals: ['pass', 'defense'] });
    const training = makeTraining({ blocks: [makeBlock({ exerciseId: exercise.id, minutes: 20 })] });
    const plan = buildPlan(training, [exercise], squad);
    expect(plan.minutesPerGoal.get('pass')).toBe(10);
    expect(plan.minutesPerGoal.get('defense')).toBe(10);
  });

  it('meldt een blok waarvan de oefening verdwenen is', () => {
    const training = makeTraining({ blocks: [makeBlock({ exerciseId: 'weg' })] });
    const plan = buildPlan(training, [], squad);
    expect(plan.blocks[0]?.warnings[0]?.severity).toBe('blocking');
  });
});

describe('inkorten', () => {
  it('schaalt alle blokken naar de beschikbare tijd', () => {
    const blocks = [makeBlock({ minutes: 20 }), makeBlock({ minutes: 40 })];
    const scaled = rescale(blocks, 45);
    expect(scaled.map((b) => b.minutes)).toEqual([15, 30]);
  });

  it('laat geen blok korter worden dan vijf minuten', () => {
    const blocks = [makeBlock({ minutes: 5 }), makeBlock({ minutes: 60 })];
    expect(rescale(blocks, 20).every((b) => b.minutes >= 5)).toBe(true);
  });
});
