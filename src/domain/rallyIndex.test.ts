import { describe, expect, it } from 'vitest';
import {
  maskFor,
  noteFor,
  ralliesFrom,
  splitPoint,
  type Corners,
  type MotionSample,
} from './rallyIndex';

/** Metingen op 5 per seconde, met beweging tijdens de opgegeven rally's. */
function samples(
  spans: readonly [number, number][],
  total: number,
  { rest = 1, play = 8 }: { rest?: number; play?: number } = {},
): MotionSample[] {
  const out: MotionSample[] = [];
  for (let i = 0; i <= total * 5; i++) {
    const at = i / 5;
    const active = spans.some(([from, to]) => at >= from && at < to);
    // Een beetje ruis, zoals een echte zaal.
    const jitter = ((i * 37) % 11) / 40;
    out.push({ at, energy: (active ? play : rest) + jitter });
  }
  return out;
}

describe('rally’s terugvinden in de beweging', () => {
  it('vindt ze bij een normale verhouding spelen en wachten', () => {
    const truth: [number, number][] = [
      [5, 12],
      [34, 39],
      [61, 73],
      [95, 99],
      [121, 130],
    ];
    const found = ralliesFrom(samples(truth, 150));
    expect(found).toHaveLength(truth.length);
    found.forEach((span, index) => {
      expect(Math.abs(span.start - truth[index]![0])).toBeLessThanOrEqual(0.5);
      expect(Math.abs(span.end - truth[index]![1])).toBeLessThanOrEqual(0.5);
    });
  });

  it('vindt ze ook als er meer gespeeld dan gewacht wordt', () => {
    // Dit ging eerst mis: met de mediaan als drempel lag die midden in het spel
    // en kwam er niets uit. Vandaar dat de drempel gezocht wordt.
    const truth: [number, number][] = [
      [2, 22],
      [26, 44],
      [48, 70],
    ];
    expect(ralliesFrom(samples(truth, 75))).toHaveLength(3);
  });

  it('plakt stukken aan elkaar die vlak na elkaar komen', () => {
    // Een bal die even stilvalt — een lange opgooi, een net-bal — mag geen twee
    // rally's worden.
    const found = ralliesFrom(samples([[10, 18], [19, 26]], 60));
    expect(found).toHaveLength(1);
    expect(found[0]!.start).toBeCloseTo(10, 0);
    expect(found[0]!.end).toBeCloseTo(26, 0);
  });

  it('laat losse tikjes beweging liggen', () => {
    // Iemand die een bal terugrolt tussen de punten door.
    expect(ralliesFrom(samples([[10, 11]], 60))).toHaveLength(0);
  });

  it('geeft niets terug als er niets te meten valt', () => {
    expect(ralliesFrom([])).toStrictEqual([]);
    expect(ralliesFrom(samples([], 30))).toStrictEqual([]);
  });

  it('waarschuwt bij een rally die te lang duurt om er één te zijn', () => {
    expect(noteFor({ start: 0, end: 90 })).toMatch(/twee rally/);
    expect(noteFor({ start: 0, end: 12 })).toBeNull();
  });
});

describe('de drempel tussen spelen en wachten', () => {
  it('ligt tussen de twee groepen in', () => {
    const values = [...Array(30).fill(1), ...Array(30).fill(9)];
    const point = splitPoint(values);
    expect(point).toBeGreaterThan(1);
    expect(point).toBeLessThan(9);
  });

  it('werkt ook als de ene groep veel groter is dan de andere', () => {
    const values = [...Array(200).fill(1), ...Array(12).fill(9)];
    const point = splitPoint(values);
    expect(point).toBeGreaterThan(1);
    expect(point).toBeLessThan(9);
  });

  it('valt niet om zonder waarden of bij één waarde', () => {
    expect(splitPoint([])).toBe(0);
    expect(splitPoint([4, 4, 4])).toBe(4);
  });
});

describe('de vierhoek om jullie veld', () => {
  it('neemt wat erbinnen ligt en laat de rest liggen', () => {
    const square: Corners = {
      topLeft: [0.25, 0.25],
      topRight: [0.75, 0.25],
      bottomRight: [0.75, 0.75],
      bottomLeft: [0.25, 0.75],
    };
    const mask = maskFor(square, 20, 20);
    const at = (x: number, y: number): number => mask[y * 20 + x]!;
    expect(at(10, 10)).toBe(1); // midden
    expect(at(1, 1)).toBe(0); // hoek van het beeld
    expect(at(19, 10)).toBe(0); // rechterrand
  });

  it('werkt ook bij een scheve vorm — en daar was het om begonnen', () => {
    // Een camera schuin achter het veld ziet geen rechthoek. Met een rechthoek
    // zou je het veld ernaast er niet af kunnen snijden zonder het halve eigen
    // veld mee te nemen.
    const skewed: Corners = {
      topLeft: [0.3, 0.2],
      topRight: [0.6, 0.2],
      bottomRight: [0.9, 0.8],
      bottomLeft: [0.1, 0.8],
    };
    const mask = maskFor(skewed, 40, 40);
    const at = (x: number, y: number): number => mask[y * 40 + x]!;
    // Onderaan is de vorm breed, bovenaan smal: precies wat een rechthoek niet kan.
    expect(at(6, 30)).toBe(1);
    expect(at(6, 10)).toBe(0);
    expect(at(32, 30)).toBe(1);
    expect(at(32, 10)).toBe(0);
  });

  it('telt het aantal vakjes dat meedoet', () => {
    const half: Corners = {
      topLeft: [0, 0],
      topRight: [0.5, 0],
      bottomRight: [0.5, 1],
      bottomLeft: [0, 1],
    };
    const mask = maskFor(half, 40, 40);
    const on = mask.reduce((sum, value) => sum + value, 0);
    expect(on).toBeGreaterThan(40 * 40 * 0.45);
    expect(on).toBeLessThan(40 * 40 * 0.55);
  });
});
