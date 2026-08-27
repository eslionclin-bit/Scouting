import { describe, expect, it } from 'vitest';
import { emptyAnimation, frameAt, pathPoints, phaseStarts, pointOn, totalDuration } from './animation';
import type { Animation } from './types';

function animation(): Animation {
  return {
    ...emptyAnimation('half'),
    loop: false,
    markers: [
      { id: 'a', kind: 'player', label: '1', slot: 1 },
      { id: 'bal', kind: 'ball', label: '', slot: null },
    ],
    phases: [
      {
        id: 'f1',
        caption: 'Aangooien',
        durationMs: 1000,
        positions: { a: { x: 3, y: 3 }, bal: { x: 3, y: 3 } },
        paths: [{ markerId: 'bal', to: { x: 6, y: 6 }, kind: 'pass', arc: 0 }],
      },
      {
        id: 'f2',
        caption: 'Naar het net',
        durationMs: 1000,
        positions: {},
        paths: [{ markerId: 'a', to: { x: 6, y: 8 }, kind: 'run', arc: 0 }],
      },
    ],
  };
}

describe('animatie', () => {
  it('telt de duur van alle fases op', () => {
    expect(totalDuration(animation())).toBe(2000);
  });

  it('erft posities over van de vorige fase', () => {
    const starts = phaseStarts(animation());
    expect(starts[1]).toEqual({ a: { x: 3, y: 3 }, bal: { x: 6, y: 6 } });
  });

  it('zet de bal halverwege de fase halverwege het pad', () => {
    const frame = frameAt(animation(), 500);
    expect(frame.phaseIndex).toBe(0);
    expect(frame.positions.bal).toEqual({ x: 4.5, y: 4.5 });
  });

  it('geeft de bijschrift van de lopende fase', () => {
    expect(frameAt(animation(), 1500).caption).toBe('Naar het net');
  });

  it('blijft op het eind staan als er niet herhaald wordt', () => {
    const frame = frameAt(animation(), 99999);
    expect(frame.positions.a).toEqual({ x: 6, y: 8 });
  });

  it('begint opnieuw als de animatie herhaalt', () => {
    const looping = { ...animation(), loop: true };
    expect(frameAt(looping, 2500).phaseIndex).toBe(0);
  });

  it('buigt een boog opzij van de rechte lijn', () => {
    const point = pointOn({ x: 0, y: 0 }, { markerId: 'bal', to: { x: 0, y: 4 }, kind: 'pass', arc: 1 }, 0.5);
    expect(point.y).toBeCloseTo(2);
    expect(Math.abs(point.x)).toBeGreaterThan(0.4);
  });

  it('levert een lijn met evenveel punten als stappen plus één', () => {
    const points = pathPoints({ x: 0, y: 0 }, { markerId: 'bal', to: { x: 2, y: 2 }, kind: 'pass', arc: 0 }, 4);
    expect(points).toHaveLength(5);
    expect(points[4]).toEqual({ x: 2, y: 2 });
  });
});
