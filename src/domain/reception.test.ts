import { describe, expect, it } from 'vitest';
import { receiversFor } from './reception';
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
