import { describe, expect, it } from 'vitest';
import { receiverForZone, receiversFor } from './reception';
import type { PlayerRole, Zone } from './types';

const positions: Record<Zone, string | null> = {
  1: 'spelverdeler',
  2: 'diagonaal',
  3: 'midden-voor',
  4: 'passer-voor',
  5: 'passer-achter',
  6: 'libero',
};

const roles: Record<string, PlayerRole[]> = {
  spelverdeler: ['setter'],
  diagonaal: ['opposite'],
  'midden-voor': ['middle'],
  'passer-voor': ['outside'],
  'passer-achter': ['outside'],
  libero: ['libero'],
};

const rolesOf = (id: string): readonly PlayerRole[] => roles[id] ?? [];

describe('wie er passt', () => {
  it('rekent de passer-loper aan het net gewoon mee', () => {
    // Dit is de hele reden dat deze berekening bestaat: zone 4 staat vooraan,
    // maar past wel.
    expect(receiversFor(positions, { rolesOf })).toStrictEqual([
      'passer-voor',
      'passer-achter',
      'libero',
    ]);
  });

  it('laat de spelverdeler en de diagonaal erbuiten', () => {
    const receivers = receiversFor(positions, { rolesOf });
    expect(receivers).not.toContain('spelverdeler');
    expect(receivers).not.toContain('diagonaal');
  });

  it('neemt de libero mee ook als haar positie niet is ingevuld', () => {
    const zonderRol = (id: string): readonly PlayerRole[] =>
      id === 'libero' ? [] : (roles[id] ?? []);

    expect(receiversFor(positions, { rolesOf: zonderRol, liberoId: 'libero' })).toContain(
      'libero',
    );
  });

  it('valt terug op de achterlijn als er geen posities bekend zijn', () => {
    // Zonder ingevulde posities is er niets af te leiden. Dan liever de drie
    // achterspelers dan een halve gok.
    expect(receiversFor(positions)).toStrictEqual([
      'passer-achter',
      'libero',
      'spelverdeler',
    ]);
  });
});

describe('wie een service in een zone aannam', () => {
  const six: Record<Zone, string | null> = {
    1: 'p1',
    2: 'p2',
    3: 'p3',
    4: 'p4',
    5: 'p5',
    6: 'p6',
  };

  it('hangt er een naam aan als daar een passer stond', () => {
    // Zonder ingevulde posities valt de app terug op de achterlijn, en dat is
    // waar in elk systeem gepast wordt.
    expect(receiverForZone(six, 5)).toBe('p5');
    expect(receiverForZone(six, 6)).toBe('p6');
  });

  it('laat hem leeg bij een korte service op de voorlijn', () => {
    // Daar staat hun spelverdeler of diagonaal, en die neemt hem niet aan. De
    // bal komt van een achterspeler die ernaartoe loopt, en wie dat was kan de
    // app niet weten.
    expect(receiverForZone(six, 2)).toBeNull();
    expect(receiverForZone(six, 3)).toBeNull();
  });

  it('telt de passer-loper vooraan wel mee als de posities bekend zijn', () => {
    const roles: Record<string, PlayerRole[]> = {
      p4: ['outside'],
      p5: ['outside'],
      p6: ['libero'],
      p2: ['setter'],
      p3: ['middle'],
      p1: ['opposite'],
    };
    const options = { rolesOf: (id: string) => roles[id] ?? [] };
    expect(receiverForZone(six, 4, options)).toBe('p4');
    expect(receiverForZone(six, 2, options)).toBeNull();
    expect(receiverForZone(six, 1, options)).toBeNull();
  });
})
