import { describe, expect, it } from 'vitest';
import {
  addPhase,
  clearMovement,
  defaultPathKind,
  duplicatePhase,
  emptyAnimation,
  frameAt,
  freeSpot,
  pathPoints,
  phaseStarts,
  pointOn,
  removeMarker,
  removePhase,
  setMovement,
  setPathKind,
  totalDuration,
} from './animation';
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

describe('animatie bewerken', () => {
  const phase = {
    id: 'f1',
    caption: 'Start',
    durationMs: 1000,
    positions: { a: { x: 2, y: 2 }, bal: { x: 2, y: 2 } },
    paths: [],
  };

  it('maakt van slepen een beweging, met de boog die bij het soort hoort', () => {
    const met = setMovement(phase, 'bal', { x: 6, y: 6 }, 'set');
    expect(met.paths).toHaveLength(1);
    expect(met.paths[0]).toEqual({ markerId: 'bal', to: { x: 6, y: 6 }, kind: 'set', arc: 1.4 });
  });

  it('verschuift het eindpunt in plaats van er een tweede beweging bij te zetten', () => {
    const eerst = setMovement(phase, 'bal', { x: 6, y: 6 }, 'pass');
    const daarna = setMovement(eerst, 'bal', { x: 7, y: 3 });
    expect(daarna.paths).toHaveLength(1);
    expect(daarna.paths[0]?.to).toEqual({ x: 7, y: 3 });
    expect(daarna.paths[0]?.kind).toBe('pass');
  });

  it('haalt een beweging weg zonder de speler weg te halen', () => {
    const met = setMovement(phase, 'a', { x: 4, y: 8 });
    const zonder = clearMovement(met, 'a');
    expect(zonder.paths).toEqual([]);
    expect(zonder.positions.a).toEqual({ x: 2, y: 2 });
  });

  it('past de boog aan als de beweging van soort verandert', () => {
    const met = setMovement(phase, 'bal', { x: 6, y: 6 }, 'run');
    const aanval = setPathKind(met, 'bal', 'attack');
    expect(aanval.paths[0]?.arc).toBe(0.3);
  });

  it('kiest voor een bal een pass en voor een speler een looplijn', () => {
    expect(defaultPathKind('ball')).toBe('pass');
    expect(defaultPathKind('player')).toBe('run');
  });

  it('laat een nieuwe fase beginnen waar de vorige eindigde', () => {
    const basis: Animation = {
      ...emptyAnimation(),
      markers: [{ id: 'a', kind: 'player', label: '1', slot: 1 }],
      phases: [setMovement(phase, 'a', { x: 5, y: 7 })],
    };
    const met = addPhase(basis, 0, 'f2');
    expect(met.phases).toHaveLength(2);
    expect(phaseStarts(met)[1]?.a).toEqual({ x: 5, y: 7 });
    expect(met.phases[1]?.paths).toEqual([]);
  });

  it('kopieert een fase met beweging en al, losgekoppeld van wat ervoor gebeurt', () => {
    const basis: Animation = {
      ...emptyAnimation(),
      markers: [{ id: 'a', kind: 'player', label: '1', slot: 1 }],
      phases: [setMovement(phase, 'a', { x: 5, y: 7 })],
    };
    const met = duplicatePhase(basis, 0, 'kopie');
    expect(met.phases).toHaveLength(2);
    expect(met.phases[1]?.paths[0]?.to).toEqual({ x: 5, y: 7 });
    // De kopie legt zijn beginposities zelf vast en schuift dus niet mee.
    expect(met.phases[1]?.positions.a).toEqual({ x: 2, y: 2 });
  });

  it('houdt de laatste fase staan', () => {
    const basis: Animation = { ...emptyAnimation(), phases: [phase] };
    expect(removePhase(basis, 0).phases).toHaveLength(1);
  });

  it('haalt een marker overal weg, ook uit de bewegingen', () => {
    const basis: Animation = {
      ...emptyAnimation(),
      markers: [
        { id: 'a', kind: 'player', label: '1', slot: 1 },
        { id: 'bal', kind: 'ball', label: '', slot: null },
      ],
      phases: [setMovement(phase, 'bal', { x: 6, y: 6 })],
    };
    const zonder = removeMarker(basis, 'bal');
    expect(zonder.markers.map((marker) => marker.id)).toEqual(['a']);
    expect(zonder.phases[0]?.paths).toEqual([]);
    expect(zonder.phases[0]?.positions.bal).toBeUndefined();
  });

  it('zet een nieuwe marker naast de vorige in plaats van eroverheen', () => {
    const eerste = freeSpot([]);
    const tweede = freeSpot([eerste]);
    expect(tweede).not.toEqual(eerste);
    expect(Math.hypot(tweede.x - eerste.x, tweede.y - eerste.y)).toBeGreaterThan(0.9);
  });
});
