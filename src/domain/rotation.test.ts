import { describe, expect, it } from 'vitest';
import {
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
