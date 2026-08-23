import { describe, expect, it } from 'vitest';
import { receptionFromServe } from './derive';

const serve = {
  team: 'us',
  type: 'serve',
  quality: 'good',
  zoneTo: 5,
} as const;

describe('hun pass afleiden uit onze service', () => {
  it('spiegelt de kwalificatie: druk bij ons is last bij hen', () => {
    expect(receptionFromServe({ ...serve, quality: 'good' })?.quality).toBe('poor');
    expect(receptionFromServe({ ...serve, quality: 'poor' })?.quality).toBe('good');
  });

  it('leidt niets af bij een ace of een servicefout', () => {
    // Na een ace registreert het protocol geen pass, en na een servicefout viel
    // er niets te passen. In beide gevallen is de rally voorbij.
    expect(receptionFromServe({ ...serve, quality: 'perfect' })).toBeNull();
    expect(receptionFromServe({ ...serve, quality: 'error' })).toBeNull();
  });

  it('leidt niets af zonder doelzone', () => {
    // Zonder te weten waar de bal heenging is er ook geen speelster om hem aan
    // toe te schrijven, en dan is het cijfer waardeloos.
    expect(receptionFromServe({ ...serve, zoneTo: null })).toBeNull();
  });

  it('kijkt alleen naar onze eigen service', () => {
    expect(receptionFromServe({ ...serve, team: 'them' })).toBeNull();
    expect(receptionFromServe({ ...serve, type: 'attack' })).toBeNull();
  });

  it('zet de bal in de zone waar geserveerd is, bij wie daar stond', () => {
    const derived = receptionFromServe(serve, { playerId: 'p-38', playerNumber: 38 });
    expect(derived).toStrictEqual({
      team: 'them',
      type: 'reception',
      quality: 'poor',
      playerId: 'p-38',
      playerNumber: 38,
      zoneFrom: 5,
      zoneTo: null,
      derived: true,
    });
  });

  it('werkt ook zonder dat we weten wie daar stond', () => {
    // Hun opstelling is optioneel. De pass telt dan mee voor de ploeg, alleen
    // niet voor een speelster — beter dan hem weglaten.
    const derived = receptionFromServe(serve);
    expect(derived?.playerNumber).toBeNull();
    expect(derived?.zoneFrom).toBe(5);
  });
});
