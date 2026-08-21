import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RULES,
  matchStatus,
  needsToss,
  setOutcome,
  startingServeFor,
  targetPoints,
} from './scoring';

describe('puntentelling', () => {
  it('speelt de eerste vier sets tot 25 en de vijfde tot 15', () => {
    expect(targetPoints(1)).toBe(25);
    expect(targetPoints(4)).toBe(25);
    expect(targetPoints(5)).toBe(15);
  });

  it('sluit een set pas bij twee punten verschil', () => {
    expect(setOutcome(25, 19, 1)).toMatchObject({ complete: true, winner: 'us' });
    expect(setOutcome(25, 24, 1).complete).toBe(false);
    expect(setOutcome(26, 24, 1)).toMatchObject({ complete: true, winner: 'us' });
    expect(setOutcome(24, 26, 1)).toMatchObject({ complete: true, winner: 'them' });
  });

  it('herkent setpoint, ook voorbij de 24', () => {
    expect(setOutcome(24, 19, 1).setPointFor).toBe('us');
    expect(setOutcome(19, 24, 1).setPointFor).toBe('them');
    expect(setOutcome(24, 24, 1).setPointFor).toBeNull();
    expect(setOutcome(25, 24, 1).setPointFor).toBe('us');
    expect(setOutcome(23, 19, 1).setPointFor).toBeNull();
  });

  it('houdt in de vijfde set dezelfde regel aan bij 15', () => {
    expect(setOutcome(15, 12, 5)).toMatchObject({ complete: true, winner: 'us' });
    expect(setOutcome(15, 14, 5).complete).toBe(false);
    expect(setOutcome(14, 13, 5).setPointFor).toBe('us');
  });
});

describe('verloop van de wedstrijd', () => {
  const set = (setNumber: number, pointsUs: number, pointsThem: number) => ({
    setNumber,
    pointsUs,
    pointsThem,
    status: 'finished' as const,
  });

  it('telt alleen afgesloten sets mee', () => {
    // Een set die na een undo weer openstaat, staat cijfermatig nog op 25-18.
    const heropend = { setNumber: 1, pointsUs: 25, pointsThem: 18, status: 'live' as const };
    expect(matchStatus([heropend])).toMatchObject({ setsUs: 0, setsPlayed: 0, nextSetNumber: 1 });

    expect(matchStatus([{ ...heropend, status: 'finished' as const }])).toMatchObject({
      setsUs: 1,
      setsPlayed: 1,
    });
  });

  it('speelt vier sets uit, ook als er al drie gewonnen zijn', () => {
    const na3 = matchStatus([set(1, 25, 20), set(2, 25, 18), set(3, 25, 22)]);
    expect(na3).toMatchObject({ setsUs: 3, setsThem: 0, complete: false, nextSetNumber: 4 });

    const na4 = matchStatus([set(1, 25, 20), set(2, 25, 18), set(3, 25, 22), set(4, 25, 21)]);
    expect(na4).toMatchObject({ setsUs: 4, complete: true, nextSetNumber: null });
  });

  it('voegt een vijfde set toe bij 2-2', () => {
    const sets = [set(1, 25, 20), set(2, 18, 25), set(3, 25, 22), set(4, 20, 25)];
    const status = matchStatus(sets);

    expect(status).toMatchObject({ setsUs: 2, setsThem: 2, needsDecider: true, complete: false });
    expect(status.nextSetNumber).toBe(5);

    const beslist = matchStatus([...sets, set(5, 15, 11)]);
    expect(beslist).toMatchObject({ setsUs: 3, complete: true });
  });

  it('laat de beginservice om en om gaan, behalve bij een toss', () => {
    const sets = [{ setNumber: 1, startingServe: 'them' as const }];

    expect(needsToss(1)).toBe(true);
    expect(startingServeFor(1, sets)).toBeNull();
    expect(startingServeFor(2, sets)).toBe('us');

    const metTwee = [...sets, { setNumber: 2, startingServe: 'us' as const }];
    expect(startingServeFor(3, metTwee)).toBe('them');

    // De beslissende set is een nieuwe toss.
    expect(needsToss(5)).toBe(true);
    expect(startingServeFor(5, metTwee)).toBeNull();
  });

  it('gaat uit van de standaardregels als er geen zijn meegegeven', () => {
    expect(DEFAULT_RULES.regularSets).toBe(4);
    expect(targetPoints(5, DEFAULT_RULES)).toBe(15);
  });
});
