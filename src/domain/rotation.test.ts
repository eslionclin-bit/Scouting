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
