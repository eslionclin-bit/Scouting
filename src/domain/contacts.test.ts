import { describe, expect, it } from 'vitest';
import { apexBetween, contactsIn, flightTime, heightsBetween } from './contacts';
import type { MotionSample } from './rallyIndex';

describe('hoogte uit de tijd tussen twee aanrakingen', () => {
  it('rekent heen en terug hetzelfde uit', () => {
    for (const apex of [3, 4, 5, 6, 7]) {
      expect(apexBetween(flightTime(apex))).toBeCloseTo(apex, 1);
    }
  });

  it('geeft de getallen die in de sporthal horen', () => {
    // Een gewone, goede pass: ongeveer vier meter.
    expect(apexBetween(1.37)).toBeCloseTo(4, 1);
    // Vlak en snel.
    expect(apexBetween(0.75)).toBeCloseTo(2.5, 1);
  });

  it('zwijgt bij een tussentijd die nergens op slaat', () => {
    // Vier seconden hoort bij een bal van twintig meter: er is iets gemist.
    expect(apexBetween(4)).toBeNull();
    expect(apexBetween(0.05)).toBeNull();
    expect(apexBetween(Number.NaN)).toBeNull();
  });
});

/** Metingen op vijf per seconde, met een klap op de opgegeven momenten. */
function heard(klappen: readonly number[], van = 9, tot = 20, ruis = 20): MotionSample[] {
  const out: MotionSample[] = [];
  for (let i = 0; i <= (tot - van) * 5; i++) {
    const at = van + i / 5;
    const klap = klappen.some((moment) => Math.abs(moment - at) < 0.11);
    out.push({
      at,
      energy: 8,
      impact: klap ? ruis + 60 : ruis + ((i * 7) % 5),
    });
  }
  return out;
}

describe('de aanrakingen terugvinden', () => {
  const span = { start: 10, end: 18 };

  it('vindt ze op de momenten waarop ze klonken', () => {
    const found = contactsIn(heard([10.2, 11.6, 13.0, 14.4]), span);
    expect(found.map((at) => Math.round(at * 10) / 10)).toEqual([10.2, 11.6, 13, 14.4]);
  });

  it('maakt van twee metingen van dezelfde klap één aanraking', () => {
    // Twee metingen vlak na elkaar horen bij dezelfde tik.
    const samples = heard([10.2]);
    const buur = samples.find((sample) => Math.abs(sample.at - 10.4) < 0.01)!;
    buur.impact = 78;
    expect(contactsIn(samples, span)).toHaveLength(1);
  });

  it('houdt het fluitsignaal buiten de aanrakingen', () => {
    const found = contactsIn(heard([10.2, 11.6, 18.2]), span, [18.2]);
    expect(found.every((at) => Math.abs(at - 18.2) > 0.3)).toBe(true);
  });

  it('laat een tik die veel zachter is dan de rest liggen', () => {
    // Binnen één rally klinken de aanrakingen ongeveer even hard. Een tikje van
    // een kwart hoort bij het veld ernaast.
    const samples = heard([10.2, 11.6, 13.0]);
    const zacht = samples.find((sample) => Math.abs(sample.at - 12.2) < 0.01)!;
    zacht.impact = 20 + 15;
    expect(contactsIn(samples, { start: 10, end: 18 })).toHaveLength(3);
  });

  it('vindt niets in een rally zonder duidelijke klappen', () => {
    const vlak: MotionSample[] = heard([]).map((sample) => ({ ...sample, impact: 30 }));
    expect(contactsIn(vlak, span)).toEqual([]);
  });

  it('zwijgt als er niet meegeluisterd kon worden', () => {
    const zonder = heard([10.2, 11.6]).map(({ at, energy }) => ({ at, energy }));
    expect(contactsIn(zonder, span)).toEqual([]);
  });

  it('zet een keten van aanrakingen om in hoogtes', () => {
    // Service, pass (1,37 s = vier meter), set (1,02 s = drie meter), aanval.
    const hoogtes = heightsBetween([10, 11.37, 12.39]);
    expect(hoogtes[0]).toBeCloseTo(4, 1);
    expect(hoogtes[1]).toBeCloseTo(3, 1);
  });
});
