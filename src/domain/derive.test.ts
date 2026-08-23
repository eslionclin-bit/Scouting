import { describe, expect, it } from 'vitest';
import { receptionFromServe, serveFromReception } from './derive';
import { isTerminalAction } from './rules';

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

describe('hun service afleiden uit onze pass', () => {
  const pass = { team: 'us', type: 'reception' } as const;

  it('spiegelt de kwalificatie: druk bij hen is last bij ons', () => {
    expect(serveFromReception({ ...pass, quality: 'poor' })?.quality).toBe('good');
    expect(serveFromReception({ ...pass, quality: 'good' })?.quality).toBe('poor');
    expect(serveFromReception({ ...pass, quality: 'perfect' })?.quality).toBe('poor');
  });

  it('maakt van een ace geen tweede punt', () => {
    // Passen wij fout, dan is dat een ace tegen ons — maar er kan maar één actie
    // zijn die de rally beëindigt, en dat is onze passfout: die hangt aan een
    // speelster van ons. Hun service krijgt 'goed': maximale druk, geen punt.
    const derived = serveFromReception({ ...pass, quality: 'error' });
    expect(derived?.quality).toBe('good');
    expect(isTerminalAction({ ...derived!, team: 'them' })).toBe(false);
  });

  it('hangt hem aan wie er bij hen moet serveren', () => {
    // Dat is hun zone 1, en daar mag niemand voor gewisseld worden.
    const derived = serveFromReception({ ...pass, quality: 'good' }, {
      playerId: 'p-87',
      playerNumber: 87,
    });
    expect(derived).toMatchObject({ playerNumber: 87, zoneFrom: null, derived: true });
  });

  it('kijkt alleen naar onze eigen pass', () => {
    expect(serveFromReception({ team: 'them', type: 'reception', quality: 'good' })).toBeNull();
    expect(serveFromReception({ team: 'us', type: 'dig', quality: 'good' })).toBeNull();
  });
});
