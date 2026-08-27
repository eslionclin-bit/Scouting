import { describe, expect, it } from 'vitest';
import {
  alternativesFor,
  describeGroupSpec,
  emptyFilter,
  filterExercises,
  originOf,
  sortExercises,
} from './library';
import { makeExercise, makeGroupSpec, makeSquad } from '../test/factory';

const me = 'trainer-1';

describe('herkomst', () => {
  it('scheidt eigen oefeningen van die van anderen en van de bank', () => {
    expect(originOf(makeExercise(), me)).toBe('mine');
    expect(originOf(makeExercise({ authorId: 'trainer-2' }), me)).toBe('others');
    expect(originOf(makeExercise({ builtIn: true }), me)).toBe('builtin');
  });
});

describe('filteren', () => {
  const bank = [
    makeExercise({ title: 'Pepperen', goals: ['pass'], minutes: 10, level: 1 }),
    makeExercise({ title: 'Blokvoetenwerk', goals: ['block', 'technique'], minutes: 20, level: 3 }),
    makeExercise({ title: 'Servicedruk', goals: ['serve'], authorId: 'trainer-2', visibility: 'public', minutes: 15 }),
    makeExercise({ title: 'Drietallen over het net', goals: ['pass'], group: makeGroupSpec({ min: 3, max: 9, step: 3, maxGroups: 2 }) }),
  ];

  it('zoekt op tekst', () => {
    const found = filterExercises(bank, { ...emptyFilter(), search: 'blok' }, me);
    expect(found.map((e) => e.title)).toEqual(['Blokvoetenwerk']);
  });

  it('filtert op doel', () => {
    const found = filterExercises(bank, { ...emptyFilter(), goals: ['pass'] }, me);
    expect(found).toHaveLength(2);
  });

  it('filtert op eigen oefeningen versus die van anderen', () => {
    const mine = filterExercises(bank, { ...emptyFilter(), origins: ['mine'] }, me);
    expect(mine.map((e) => e.title)).not.toContain('Servicedruk');
    const others = filterExercises(bank, { ...emptyFilter(), origins: ['others'] }, me);
    expect(others.map((e) => e.title)).toEqual(['Servicedruk']);
  });

  it('filtert op openbaar of privé', () => {
    const openbaar = filterExercises(bank, { ...emptyFilter(), visibilities: ['public'] }, me);
    expect(openbaar.map((e) => e.title)).toEqual(['Servicedruk']);
  });

  it('laat alleen oefeningen zien die met dit aantal kunnen', () => {
    const groot = makeExercise({ title: 'Zes tegen zes', group: makeGroupSpec({ min: 12, max: 12 }) });
    const found = filterExercises([...bank, groot], { ...emptyFilter(), participants: 5 }, me);
    expect(found.map((e) => e.title)).not.toContain('Zes tegen zes');
    // Drietallen mag wél: drie doen mee, twee wisselen in.
    expect(found.map((e) => e.title)).toContain('Drietallen over het net');
  });

  it('laat oefeningen weg waarvoor er te weinig aanwezig zijn', () => {
    const found = filterExercises(bank, { ...emptyFilter(), participants: 2 }, me);
    expect(found).toEqual([]);
  });

  it('filtert op tijd en niveau', () => {
    const found = filterExercises(bank, { ...emptyFilter(), maxMinutes: 10, levels: [1] }, me);
    expect(found.map((e) => e.title)).toEqual(['Pepperen']);
  });

  it('laat verwijderde oefeningen weg', () => {
    const met = [...bank, makeExercise({ title: 'Weg', deletedAt: '2026-08-01T00:00:00.000Z' })];
    expect(filterExercises(met, emptyFilter(), me)).toHaveLength(bank.length);
  });
});

describe('volgorde', () => {
  it('zet oefeningen die precies uitkomen bovenaan', () => {
    const passend = makeExercise({ title: 'Precies', group: makeGroupSpec({ min: 8, max: 8 }) });
    const wachters = makeExercise({ title: 'Wachters', group: makeGroupSpec({ min: 6, max: 6 }) });
    const kan_niet = makeExercise({ title: 'Te groot', group: makeGroupSpec({ min: 12, max: 12 }) });
    const sorted = sortExercises([kan_niet, wachters, passend], 8);
    expect(sorted.map((e) => e.title)).toEqual(['Precies', 'Wachters', 'Te groot']);
  });

  it('sorteert alfabetisch zonder aantal', () => {
    const sorted = sortExercises([makeExercise({ title: 'Zes' }), makeExercise({ title: 'Aanval' })], null);
    expect(sorted.map((e) => e.title)).toEqual(['Aanval', 'Zes']);
  });
});

describe('omschrijving van de deelnemersvraag', () => {
  it('noemt bereik, stap en aantal groepen', () => {
    const exercise = makeExercise({ group: makeGroupSpec({ min: 3, max: 9, step: 3, maxGroups: 3 }) });
    expect(describeGroupSpec(exercise)).toBe('3-9 spelers · in drietallen · tot 3x naast elkaar');
  });

  it('houdt het kort bij een vast aantal', () => {
    const exercise = makeExercise({ group: makeGroupSpec({ min: 6, max: 6, maxGroups: 1 }) });
    expect(describeGroupSpec(exercise)).toBe('6 spelers');
  });
});

describe('alternatieven', () => {
  it('stelt een oefening met hetzelfde doel voor die wél past', () => {
    const squad = makeSquad(7);
    const origineel = makeExercise({ title: 'Zes tegen zes', goals: ['tactics'], group: makeGroupSpec({ min: 12, max: 12 }) });
    const past = makeExercise({ title: 'Drie tegen drie', goals: ['tactics'], group: makeGroupSpec({ min: 6, max: 6 }) });
    const ander_doel = makeExercise({ title: 'Conditie', goals: ['conditioning'], group: makeGroupSpec({ min: 4, max: 12 }) });
    const found = alternativesFor(origineel, [origineel, past, ander_doel], squad);
    expect(found.map((e) => e.title)).toEqual(['Drie tegen drie']);
  });

  it('slaat oefeningen over waarvoor de posities ontbreken', () => {
    const squad = makeSquad(6).map((p) => ({ ...p, positions: [] }));
    const origineel = makeExercise({ goals: ['attack'], group: makeGroupSpec({ min: 12, max: 12 }) });
    const metSpelverdeler = makeExercise({
      goals: ['attack'],
      group: makeGroupSpec({ min: 6, max: 6, roles: [{ position: 'setter', count: 1, required: true }] }),
    });
    expect(alternativesFor(origineel, [origineel, metSpelverdeler], squad)).toEqual([]);
  });
});
