import { describe, expect, it } from 'vitest';
import {
  courtPositions,
  emptyPositions,
  playersOnCourt,
  positionsAt,
  rotationForNextRally,
  rotatePositions,
  rotationsAfter,
  serverAt,
} from './rotation';
import type { Zone } from './types';
import type { PlayerRole } from './types';

const start: Record<Zone, string | null> = {
  1: 'p1',
  2: 'p2',
  3: 'p3',
  4: 'p4',
  5: 'p5',
  6: 'p6',
};

describe('rotatie', () => {
  it('draait met de klok mee: wie in zone 2 stond, serveert daarna', () => {
    const rotated = rotatePositions(start, 1);
    expect(rotated[1]).toBe('p2');
    expect(rotated[6]).toBe('p1');
    expect(rotated[2]).toBe('p3');
  });

  it('is na zes rotaties terug bij de startopstelling', () => {
    expect(rotatePositions(start, 6)).toStrictEqual(start);
    expect(rotatePositions(start, 7)).toStrictEqual(rotatePositions(start, 1));
  });

  it('draait alleen door na een gewonnen rally waarin de tegenstander serveerde', () => {
    const rallies = [
      { wonBy: 'us' as const }, // wij serveerden zelf: punt, geen rotatie
      { wonBy: 'them' as const }, // opslag gaat naar hen
      { wonBy: 'us' as const }, // sideout: nu draaien wij door
      { wonBy: 'us' as const }, // eigen opslag: weer geen rotatie
    ];
    expect(rotationsAfter(rallies, 'us', 'us')).toBe(1);
    expect(rotationsAfter(rallies, 'us', 'them')).toBe(1);
  });

  it('telt de rotatie van de komende rally als 1 t/m 6', () => {
    expect(rotationForNextRally([], 'us')).toBe(1);

    const zesSideouts = Array.from({ length: 11 }, (_, index) =>
      index % 2 === 0 ? { wonBy: 'them' as const } : { wonBy: 'us' as const },
    );
    // Zes keer doordraaien brengt ons terug in rotatie 1.
    expect(rotationsAfter(zesSideouts, 'us', 'us')).toBe(5);
    expect(rotationForNextRally(zesSideouts, 'us')).toBe(6);
  });

  it('past wissels toe op de plek waar de gewisselde speler staat', () => {
    const positions = positionsAt({ positions: start }, 2, [
      { playerOutId: 'p3', playerInId: 'p7' },
    ]);
    // Na één keer doordraaien staat p3 in zone 2; daar staat nu de invaller.
    expect(positions[2]).toBe('p7');
    expect(playersOnCourt(positions)).toContain('p7');
    expect(playersOnCourt(positions)).not.toContain('p3');
  });

  it('wijst de server aan uit de opstelling', () => {
    expect(serverAt({ positions: start }, 1)).toBe('p1');
    expect(serverAt({ positions: start }, 3)).toBe('p3');
    expect(serverAt({ positions: emptyPositions() }, 1)).toBeNull();
  });
});

describe('libero', () => {
  const roles = new Map<string, 'middle' | 'setter'>([
    ['p1', 'setter'],
    ['p3', 'middle'],
    ['p6', 'middle'],
  ]);
  const roleOf = (id: string) => roles.get(id) ?? null;
  const lineup = { positions: start, liberoId: 'lib' };

  it('komt in voor de middenspeler zodra die achterin staat', () => {
    // In rotatie 1 staat p6 (midden) in zone 6.
    const court = courtPositions(lineup, 1, [], { roleOf });
    expect(court.positions[6]).toBe('lib');
    expect(court.replaced).toBe('p6');
    expect(playersOnCourt(court.positions)).not.toContain('p6');
  });

  it('schuift mee met de middenspeler die achterin staat', () => {
    // In rotatie 2 is p6 doorgedraaid naar zone 5; de libero gaat mee.
    const court = courtPositions(lineup, 2, [], { roleOf });
    expect(court.positions[5]).toBe('lib');
    expect(court.replaced).toBe('p6');
  });

  it('staat niet in het veld als de middenspeler moet serveren', () => {
    // In rotatie 3 staat de andere middenspeler (p3) op de serveerplek, en de
    // achterhoek heeft geen midden meer: dan is er geen libero in het veld.
    const court = courtPositions(lineup, 3, [], { roleOf });
    expect(court.positions[1]).toBe('p3');
    expect(playersOnCourt(court.positions)).not.toContain('lib');
    expect(court.replaced).toBeNull();
  });

  it('verandert niets zonder libero of zonder bekende rollen', () => {
    expect(courtPositions({ positions: start, liberoId: null }, 1, [], { roleOf })).toMatchObject({
      replaced: null,
    });
    expect(courtPositions(lineup, 1, [])).toMatchObject({ replaced: null });
  });
});

describe('libero bij speelsters die meerdere posities spelen', () => {
  const start = { 1: 'p1', 2: 'p2', 3: 'p3', 4: 'p4', 5: 'p5', 6: 'p6' } as const;

  it('verandert niets als er twee middens achterin staan', () => {
    // p5 én p6 kunnen midden: wie eruit gaat is niet af te leiden, en dan is
    // niets veranderen beter dan gokken.
    const rolesOf = (id: string): readonly PlayerRole[] =>
      id === 'p6' ? ['middle'] : id === 'p5' ? ['outside', 'middle'] : ['setter'];

    const court = courtPositions({ positions: { ...start }, liberoId: 'lib' }, 1, [], { rolesOf });

    expect(court.replaced).toBeNull();
    expect(playersOnCourt(court.positions)).not.toContain('lib');
  });

  it('volgt de vastgelegde keuze, ook als de rollen iets anders zeggen', () => {
    const rolesOf = (id: string): readonly PlayerRole[] =>
      id === 'p6' ? ['middle'] : ['outside'];

    const court = courtPositions(
      { positions: { ...start }, liberoId: 'lib', liberoForId: 'p5' },
      1,
      [],
      { rolesOf },
    );

    expect(court.replaced).toBe('p5');
    expect(court.positions[5]).toBe('lib');
    expect(court.positions[6]).toBe('p6');
  });

  it('laat de vastgelegde speelster met rust zodra ze naar de service draait', () => {
    // In rotatie 5 staat p5 in zone 1: daar wordt geserveerd, en dat mag de
    // libero niet.
    const court = courtPositions(
      { positions: { ...start }, liberoId: 'lib', liberoForId: 'p5' },
      5,
      [],
      {},
    );

    expect(court.positions[1]).toBe('p5');
    expect(court.replaced).toBeNull();
  });
});

describe('de libero kan niet twee keer in het veld staan', () => {
  it('valt niet nog een keer in als ze er met een wissel al in staat', () => {
    // Dit gebeurde echt: de invoerder wisselde de libero met de hand in voor de
    // ene middenspeelster, en de afleiding hieronder zette haar ook nog voor de
    // andere in — dezelfde speelster in zone 5 én zone 6.
    const lineup = {
      positions: {
        1: 'diagonaal',
        2: 'passer-a',
        3: 'midden-a',
        4: 'passer-b',
        5: 'midden-b',
        6: 'spelverdeler',
      } as Record<Zone, string | null>,
      liberoId: 'libero',
      liberoForId: null,
    };
    const roles: Record<string, PlayerRole[]> = {
      'midden-a': ['middle'],
      'midden-b': ['middle'],
      libero: ['libero'],
    };

    const { positions, replaced } = courtPositions(
      lineup,
      1,
      [{ playerOutId: 'spelverdeler', playerInId: 'libero' }],
      { rolesOf: (id) => roles[id] ?? [] },
    );

    const onCourt = playersOnCourt(positions);
    expect(new Set(onCourt).size).toBe(onCourt.length);
    expect(onCourt.filter((id) => id === 'libero')).toHaveLength(1);
    expect(replaced).toBeNull();
  });
});

describe('de afspraak: voor wie komt de libero erin', () => {
  const roles: Record<string, PlayerRole[]> = {
    'midden-a': ['middle'],
    'midden-b': ['middle'],
    libero: ['libero'],
  };
  const lineup = {
    positions: {
      1: 'diagonaal',
      2: 'passer-a',
      3: 'midden-a',
      4: 'passer-b',
      5: 'midden-b',
      6: 'spelverdeler',
    } as Record<Zone, string | null>,
    liberoId: 'libero',
    liberoForId: null,
  };

  it('wisselt haar in voor de enige van de lijst die achterin staat', () => {
    const { positions, replaced, ambiguous } = courtPositions(lineup, 1, [], {
      liberoForIds: ['midden-a', 'midden-b'],
    });
    expect(replaced).toBe('midden-b');
    expect(positions[5]).toBe('libero');
    expect(ambiguous).toStrictEqual([]);
  });

  it('vraagt het als er twee van de lijst achterin staan', () => {
    // Zone 5 en 6 liggen naast elkaar, dus twee afgesproken speelsters kunnen
    // er tegelijk staan. Dan verandert er niets en staat de vraag klaar.
    const { positions, replaced, ambiguous } = courtPositions(lineup, 1, [], {
      liberoForIds: ['midden-b', 'spelverdeler'],
    });
    expect(replaced).toBeNull();
    expect(positions[5]).toBe('midden-b');
    expect(positions[6]).toBe('spelverdeler');
    expect([...ambiguous].sort()).toStrictEqual(['midden-b', 'spelverdeler']);
  });

  it('gebruikt het antwoord dat tijdens de set is gegeven', () => {
    const answered = { ...lineup, liberoChoices: { 1: 'spelverdeler' } };
    const { positions, replaced, ambiguous } = courtPositions(answered, 1, [], {
      liberoForIds: ['midden-b', 'spelverdeler'],
    });
    expect(replaced).toBe('spelverdeler');
    expect(positions[6]).toBe('libero');
    expect(ambiguous).toStrictEqual([]);
  });

  it('valt zonder afspraak terug op de enige middenspeelster achterin', () => {
    const { replaced } = courtPositions(lineup, 1, [], {
      rolesOf: (id) => roles[id] ?? [],
    });
    expect(replaced).toBe('midden-b');
  });
});
