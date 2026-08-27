import { describe, expect, it } from 'vitest';
import { allowedSizes, assign, distribute, rotationRounds, turnsPerPlayer } from './grouping';
import type { GroupSpec, Player, Position } from './types';

function spec(partial: Partial<GroupSpec> = {}): GroupSpec {
  return { min: 4, max: 10, step: 1, maxGroups: 1, roles: [], ...partial };
}

function players(count: number, positions: Partial<Record<number, Position[]>> = {}): Player[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `p${i + 1}`,
    teamId: 't1',
    name: `Speler ${i + 1}`,
    number: i + 1,
    positions: positions[i + 1] ?? [],
    active: true,
    notes: null,
    rev: '', updatedAt: '', deletedAt: null, authorId: 'a', authorName: 'A',
  }));
}

describe('toegestane groepsgroottes', () => {
  it('loopt per stap van min tot max', () => {
    expect(allowedSizes(spec({ min: 4, max: 8 }))).toEqual([4, 5, 6, 7, 8]);
  });

  it('een oefening in drietallen kent alleen veelvouden van drie', () => {
    expect(allowedSizes(spec({ min: 3, max: 9, step: 3 }))).toEqual([3, 6, 9]);
  });

  it('schuift het minimum op naar het eerste geldige veelvoud', () => {
    expect(allowedSizes(spec({ min: 4, max: 9, step: 3 }))).toEqual([6, 9]);
  });
});

describe('verdelen over groepen', () => {
  it('zegt hoeveel er tekort zijn als er te weinig aanwezig zijn', () => {
    const result = distribute(3, spec({ min: 4, max: 10 }));
    expect(result.possible).toBe(false);
    expect(result.problems).toEqual([{ kind: 'too-few', needed: 4, short: 1 }]);
  });

  it('laat iedereen meedoen als het aantal binnen het bereik valt', () => {
    const result = distribute(7, spec({ min: 4, max: 10 }));
    expect(result.groups).toEqual([7]);
    expect(result.waiting).toBe(0);
    expect(result.exact).toBe(true);
  });

  it('maakt twee groepen zodra één groep te klein is voor iedereen', () => {
    const result = distribute(12, spec({ min: 4, max: 8, maxGroups: 2 }));
    expect(result.groups).toEqual([6, 6]);
    expect(result.playing).toBe(12);
  });

  it('laat spelers wachten als er meer zijn dan er passen', () => {
    const result = distribute(11, spec({ min: 4, max: 5, maxGroups: 2 }));
    expect(result.groups).toEqual([5, 5]);
    expect(result.waiting).toBe(1);
    expect(result.exact).toBe(false);
  });

  it('kiest bij drietallen het grootste veelvoud van drie', () => {
    const result = distribute(8, spec({ min: 3, max: 3, step: 3, maxGroups: 4 }));
    expect(result.groups).toEqual([3, 3]);
    expect(result.waiting).toBe(2);
    expect(result.problems).toContainEqual({
      kind: 'step', step: 3, nearestBelow: 6, nearestAbove: 9,
    });
  });

  it('doet met negen precies drie drietallen', () => {
    const result = distribute(9, spec({ min: 3, max: 3, step: 3, maxGroups: 4 }));
    expect(result.groups).toEqual([3, 3, 3]);
    expect(result.exact).toBe(true);
    expect(result.problems).toEqual([]);
  });

  it('verkiest bij gelijk aantal spelers meer kleine groepen boven één grote', () => {
    // 12 spelers in groepen van 3 tot 6: liever vier drietallen dan twee zessen,
    // want dan raakt iedereen de bal vaker.
    const result = distribute(12, spec({ min: 3, max: 6, step: 3, maxGroups: 4 }));
    expect(result.groups).toEqual([3, 3, 3, 3]);
  });

  it('verdeelt zo gelijk mogelijk als het niet precies opgaat', () => {
    const result = distribute(9, spec({ min: 4, max: 6, maxGroups: 2 }));
    expect(result.groups).toEqual([5, 4]);
  });
});

describe('wie doet er als eerste mee', () => {
  it('zet de eerste vier in de groep en de rest in de wachtrij', () => {
    const result = assign(players(6), spec({ min: 4, max: 4 }));
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0]?.players.map((p) => p.name)).toEqual([
      'Speler 1', 'Speler 2', 'Speler 3', 'Speler 4',
    ]);
    expect(result.waiting.map((p) => p.name)).toEqual(['Speler 5', 'Speler 6']);
  });

  it('geeft elke groep een spelverdeler als de oefening daarom vraagt', () => {
    const squad = players(8, { 3: ['setter'], 7: ['setter'] });
    const result = assign(squad, spec({
      min: 4, max: 4, maxGroups: 2,
      roles: [{ position: 'setter', count: 1, required: true }],
    }));
    for (const group of result.groups) {
      expect(group.players.some((p) => p.positions.includes('setter'))).toBe(true);
      expect(group.players).toHaveLength(4);
    }
  });

  it('meldt het als een verplichte positie ontbreekt', () => {
    const squad = players(8, { 3: ['setter'] });
    const result = assign(squad, spec({
      min: 4, max: 4, maxGroups: 2,
      roles: [{ position: 'setter', count: 1, required: true }],
    }));
    expect(result.problems).toContainEqual({
      kind: 'missing-role', position: 'setter', needed: 2, available: 1,
    });
  });

  it('schuift bij de volgende beurt door, zodat wie wachtte nu meedoet', () => {
    const squad = players(6);
    const first = assign(squad, spec({ min: 4, max: 4 }), { round: 0 });
    const second = assign(squad, spec({ min: 4, max: 4 }), { round: 1 });
    expect(second.groups[0]?.players.map((p) => p.name).slice(0, 2)).toEqual([
      'Speler 5', 'Speler 6',
    ]);
    expect(first.waiting.map((p) => p.id)).not.toEqual(second.waiting.map((p) => p.id));
  });
});

describe('wisselschema', () => {
  it('geeft iedereen evenveel beurten', () => {
    const squad = players(6);
    const rounds = rotationRounds(squad, spec({ min: 4, max: 4 }));
    const turns = [...turnsPerPlayer(rounds).values()];
    expect(new Set(turns).size).toBe(1);
  });

  it('blijft bij één ronde als iedereen meedoet', () => {
    const rounds = rotationRounds(players(8), spec({ min: 4, max: 8 }));
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.waiting).toEqual([]);
  });
});
