import { describe, expect, it } from 'vitest';
import { accentForWeek, defaultAccents, formatDate, generateSeries, trainingDates } from './series';
import { makeExercise, makeGroupSpec } from '../test/factory';
import type { BlockKind, Goal } from './types';

function bankExercise(title: string, goals: Goal[], slots: BlockKind[]) {
  return makeExercise({ title, goals, slots, group: makeGroupSpec({ min: 4, max: 12 }) });
}

const bank = [
  bankExercise('Inlopen met bal', ['conditioning'], ['warmup']),
  bankExercise('Pepperen', ['pass', 'technique'], ['warmup', 'core']),
  bankExercise('Passen op doel', ['pass'], ['core']),
  bankExercise('Aanvalslijn', ['attack'], ['core']),
  bankExercise('Blokvoetenwerk', ['block'], ['core']),
  bankExercise('Servicedruk', ['serve'], ['core']),
  bankExercise('Zes tegen zes', ['tactics', 'positioning'], ['game']),
  bankExercise('Uitlopen', ['conditioning'], ['cooldown']),
];

const options = {
  library: bank,
  expectedParticipants: 10,
  teamId: 'team-1',
  authorId: 'trainer-1',
  authorName: 'Marit',
  time: '20:00',
  now: () => '2026-08-01T18:00:00.000Z',
};

const input = {
  name: 'Najaar 2026',
  startDate: '2026-09-01',
  endDate: '2026-09-30',
  weekdays: [2, 4],
  minutes: 90,
  accents: defaultAccents(),
  visibility: 'private' as const,
  groupIds: [],
};

describe('trainingsdagen', () => {
  it('geeft elke dinsdag en donderdag in de periode', () => {
    const dates = trainingDates('2026-09-01', '2026-09-14', [2, 4]);
    expect(dates).toEqual(['2026-09-01', '2026-09-03', '2026-09-08', '2026-09-10']);
  });

  it('geeft niets terug bij een omgekeerde periode', () => {
    expect(trainingDates('2026-09-30', '2026-09-01', [2])).toEqual([]);
  });

  it('geeft niets terug zonder trainingsdag', () => {
    expect(trainingDates('2026-09-01', '2026-09-30', [])).toEqual([]);
  });
});

describe('accenten', () => {
  it('loopt de perioden af op weeknummer', () => {
    const accents = defaultAccents();
    expect(accentForWeek(accents, 0)?.label).toBe('Voorbereiding');
    expect(accentForWeek(accents, 4)?.label).toBe('Opbouw');
    expect(accentForWeek(accents, 11)?.label).toBe('Competitie');
  });

  it('houdt het laatste accent aan als de reeks langer loopt', () => {
    expect(accentForWeek(defaultAccents(), 99)?.label).toBe('Scherp blijven');
  });
});

describe('reeks maken', () => {
  it('maakt een training per trainingsdag', () => {
    const { series, trainings } = generateSeries(input, options);
    expect(trainings).toHaveLength(9);
    expect(series.trainingIds).toEqual(trainings.map((t) => t.id));
    expect(trainings.every((t) => t.seriesId === series.id)).toBe(true);
  });

  it('vult elke training met warming-up, kern, wedstrijdvorm en afsluiting', () => {
    const { trainings } = generateSeries(input, options);
    const kinds = trainings[0]?.blocks.map((b) => b.kind);
    expect(kinds).toEqual(['warmup', 'core', 'core', 'game', 'cooldown']);
    expect(trainings[0]?.blocks.every((b) => b.exerciseId !== null)).toBe(true);
  });

  it('schaalt de blokken naar de duur van de training', () => {
    const { trainings } = generateSeries({ ...input, minutes: 90 }, options);
    const minutes = trainings[0]?.blocks.reduce((sum, b) => sum + b.minutes, 0) ?? 0;
    expect(minutes).toBeGreaterThanOrEqual(85);
    expect(minutes).toBeLessThanOrEqual(95);
  });

  it('kiest oefeningen die bij het accent van de periode horen', () => {
    const { trainings } = generateSeries(input, options);
    const eerste = trainings[0]?.blocks
      .map((b) => bank.find((e) => e.id === b.exerciseId)?.title)
      .filter(Boolean);
    // September is voorbereiding: conditie, techniek en pass.
    expect(eerste).toContain('Pepperen');
  });

  it('zet dezelfde kernoefening niet twee trainingen achter elkaar', () => {
    const { trainings } = generateSeries(input, options);
    for (let i = 1; i < trainings.length; i++) {
      const vorige = new Set(
        (trainings[i - 1]?.blocks ?? []).filter((b) => b.kind === 'core').map((b) => b.exerciseId),
      );
      const nu = (trainings[i]?.blocks ?? []).filter((b) => b.kind === 'core').map((b) => b.exerciseId);
      expect(nu.some((id) => vorige.has(id))).toBe(false);
    }
  });

  it('laat een blok leeg met een naam als er geen oefening past', () => {
    const { trainings } = generateSeries(input, { ...options, library: [], expectedParticipants: 10 });
    expect(trainings[0]?.blocks[0]?.exerciseId).toBeNull();
    expect(trainings[0]?.blocks[0]?.title).toBe('Inlopen en inspelen');
  });

  it('kiest alleen oefeningen die met het verwachte aantal kunnen', () => {
    const groot = bankExercise('Zes tegen zes groot', ['tactics'], ['game']);
    const library = [{ ...groot, group: makeGroupSpec({ min: 12, max: 12 }) }, ...bank];
    const { trainings } = generateSeries(input, { ...options, library, expectedParticipants: 8 });
    const spelvormen = trainings.flatMap((t) => t.blocks.filter((b) => b.kind === 'game'));
    expect(spelvormen.every((b) => b.exerciseId !== groot.id)).toBe(true);
  });
});

describe('datumnotatie', () => {
  it('schrijft de datum zoals hij op het blad staat', () => {
    expect(formatDate('2026-09-08')).toBe('di 8 sep');
    expect(formatDate('2026-09-08', true)).toBe('di 8 sep 2026');
  });
});
