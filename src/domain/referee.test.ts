import { describe, expect, it } from 'vitest';
import {
  ARM_GRID,
  armDirection,
  bodyColumn,
  readArm,
  restingFrame,
  sidesFor,
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

describe('een kader dat niet netjes om hem heen zit', () => {
  const { width: w, height: h } = ARM_GRID;

  /** Scheidsrechter een eind naar links in het kadertje, arm naar rechts. */
  function scheef(at: number, arm: boolean): ArmFrame {
    const pixels = new Uint8Array(w * h).fill(70);
    const verf = (x0: number, x1: number, y0: number, y1: number, kleur: number): void => {
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) pixels[y * w + x] = kleur;
    };
    const romp = Math.round(w * 0.3);
    verf(romp - 3, romp + 3, 6, h - 4, 200);
    if (arm) verf(romp + 3, romp + 16, 12, 17, 215);
    return { at, pixels };
  }

  it('leest de arm nog steeds goed, ook als hij niet in het midden staat', () => {
    const frames = [
      ...Array.from({ length: 30 }, (_, i) => scheef(i * 0.25, false)),
      scheef(20, true),
      scheef(20.5, true),
    ];
    const readings = readArm(frames, restingFrame(frames));
    expect(armDirection(readings, 19.5, 21)).toBe('right');
  });

  it('vindt waar hij staat in plaats van het midden aan te nemen', () => {
    const frames = Array.from({ length: 20 }, (_, i) => scheef(i * 0.25, i % 5 === 0));
    const kolom = bodyColumn(restingFrame(frames));
    expect(kolom).toBeGreaterThan(w * 0.15);
    expect(kolom).toBeLessThan(w * 0.5);
  });
});

describe('van speelhelft wisselen tussen de sets', () => {
  it('houdt dezelfde kant aan binnen een set', () => {
    const spans = [
      { start: 10, end: 18 },
      { start: 30, end: 38 },
      { start: 55, end: 62 },
    ];
    expect(sidesFor(spans, 'left')).toEqual(['left', 'left', 'left']);
  });

  it('draait om na een pauze van minuten', () => {
    const spans = [
      { start: 10, end: 18 },
      { start: 30, end: 38 },
      // Setwissel.
      { start: 200, end: 208 },
      { start: 220, end: 228 },
      // En nog een.
      { start: 500, end: 508 },
    ];
    expect(sidesFor(spans, 'left')).toEqual(['left', 'left', 'right', 'right', 'left']);
  });

  it('laat een time-out van een halve minuut met rust', () => {
    const spans = [
      { start: 10, end: 18 },
      { start: 48, end: 56 },
    ];
    expect(sidesFor(spans, 'right')).toEqual(['right', 'right']);
  });
});
