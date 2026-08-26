import { describe, expect, it } from 'vitest';
import { agreementOf, rowFor, summarise, type LearnRow, type RallyObservation } from './learning';

const seen: RallyObservation = {
  at: 10,
  duration: 8,
  serveWhistle: 8,
  endWhistle: 18.5,
  peakEnergy: 9,
  meanEnergy: 4,
  bursts: 5,
  armLeft: 0.2,
  armRight: 0.01,
  direction: 'left',
  ourSide: 'left',
  suggested: 'us',
};

const rows = (...answers: LearnRow['answer'][]): LearnRow[] =>
  answers.map((answer) => rowFor(seen, answer));

describe('bijhouden hoe vaak het voorstel klopte', () => {
  it('telt eens en oneens', () => {
    expect(agreementOf(rows('us', 'us', 'them'))).toEqual({
      answered: 3,
      suggested: 3,
      agreed: 2,
    });
  });

  it('laat rally’s zonder voorstel buiten het percentage maar niet buiten de telling', () => {
    const zonder = { ...seen, suggested: null };
    expect(agreementOf([rowFor(seen, 'us'), rowFor(zonder, 'them')])).toEqual({
      answered: 2,
      suggested: 1,
      agreed: 1,
    });
  });

  it('telt een overgespeelde rally helemaal niet mee', () => {
    expect(agreementOf(rows('us', 'replay', 'none'))).toEqual({
      answered: 1,
      suggested: 1,
      agreed: 1,
    });
  });
});

describe('de meting in één zin', () => {
  it('zwijgt zolang er te weinig te zeggen valt', () => {
    expect(summarise(agreementOf(rows('us', 'us', 'us')))).toBeNull();
  });

  it('noemt het aantal en het percentage', () => {
    const zin = summarise(agreementOf(rows(...Array<'us'>(12).fill('us'))));
    expect(zin).toContain('12 van de 12');
    expect(zin).toContain('100%');
    // Zonder onleesbare rally's hoort er geen zin over te staan.
    expect(zin).not.toContain('niet te lezen');
  });
});
