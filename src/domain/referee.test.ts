import { describe, expect, it } from 'vitest';
import {
  ARM_GRID,
  armDirection,
  readArm,
  restingFrame,
  tallyOf,
  winnerFor,
  type ArmFrame,
} from './referee';

const { width, height } = ARM_GRID;

/** Een kadertje met de scheidsrechter in het midden, en desgevraagd een arm opzij. */
function frame(at: number, arm: 'left' | 'right' | null): ArmFrame {
  const pixels = new Uint8Array(width * height).fill(70);
  const paint = (from: number, to: number, top: number, bottom: number, shade: number): void => {
    for (let y = top; y < bottom; y++) {
      for (let x = from; x < to; x++) pixels[y * width + x] = shade;
    }
  };
  // Het lichaam staat er altijd; dat mag niets betekenen.
  paint(width / 2 - 3, width / 2 + 3, 6, height - 4, 200);
  if (arm === 'left') paint(4, width / 2 - 3, 12, 17, 210);
  if (arm === 'right') paint(width / 2 + 3, width - 4, 12, 17, 210);
  return { at, pixels };
}

describe('de arm van de scheidsrechter lezen', () => {
  // Een pauze van vier seconden waarin hij twee tellen wijst.
  const gap = (at: number, arm: 'left' | 'right'): ArmFrame[] => [
    frame(at, null),
    frame(at + 1, arm),
    frame(at + 1.5, arm),
    frame(at + 3, null),
  ];

  const stilstand = Array.from({ length: 30 }, (_, i) => frame(i * 0.25, null));

  it('ziet een arm naar links', () => {
    const frames = [...stilstand, ...gap(20, 'left')];
    const readings = readArm(frames, restingFrame(frames));
    expect(armDirection(readings, 20, 24)).toBe('left');
  });

  it('ziet een arm naar rechts', () => {
    const frames = [...stilstand, ...gap(20, 'right')];
    const readings = readArm(frames, restingFrame(frames));
    expect(armDirection(readings, 20, 24)).toBe('right');
  });

  it('zegt niets als er geen arm uitsteekt', () => {
    const frames = [...stilstand, ...gap(20, 'left')];
    const readings = readArm(frames, restingFrame(frames));
    // Een stuk van de opname waarin hij alleen maar staat.
    expect(armDirection(readings, 0, 5)).toBeNull();
  });

  it('laat het lichaam zelf buiten beschouwing', () => {
    // Hij draait zich om: het midden verandert, de zijkanten niet.
    const turning = frame(40, null);
    for (let y = 6; y < height - 4; y++) {
      for (let x = width / 2 - 3; x < width / 2 + 3; x++) turning.pixels[y * width + x] = 40;
    }
    const frames = [...stilstand, turning];
    const readings = readArm(frames, restingFrame(frames));
    expect(armDirection(readings, 39, 41)).toBeNull();
  });
});

describe('van arm naar uitslag', () => {
  it('wijst naar onze kant is een punt voor ons', () => {
    expect(winnerFor('left', 'left')).toBe('us');
    expect(winnerFor('right', 'left')).toBe('them');
    expect(winnerFor(null, 'left')).toBeNull();
  });
});

describe('de reeks natellen', () => {
  /** Om en om, zoals een echte set: pas aan het eind loopt er een weg. */
  const run = (us: number, them: number): ('us' | 'them')[] => {
    const out: ('us' | 'them')[] = [];
    const pairs = Math.min(us, them);
    for (let i = 0; i < pairs; i++) out.push('us', 'them');
    for (let i = pairs; i < us; i++) out.push('us');
    for (let i = pairs; i < them; i++) out.push('them');
    return out;
  };

  it('telt op tot een set die klopt', () => {
    const tally = tallyOf(run(25, 20));
    expect(tally).toMatchObject({ us: 25, them: 20, extra: 0 });
    expect(tally.decidedAfter).toBe(44);
  });

  it('meldt rally’s die er ná het setpunt nog bij staan', () => {
    const tally = tallyOf([...run(25, 20), 'us', 'them']);
    expect(tally.extra).toBe(2);
  });

  it('laat onbekende rally’s buiten de telling', () => {
    expect(tallyOf(['us', null, 'them', null])).toMatchObject({ us: 1, them: 1 });
  });

  it('gaat door bij een stand die nog niet uit is', () => {
    expect(tallyOf(run(25, 24))).toMatchObject({ us: 25, them: 24, decidedAfter: null });
  });
});
