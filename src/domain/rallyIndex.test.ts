import { describe, expect, it } from 'vitest';
import {
  maskFor,
  noteFor,
  ralliesFrom,
  splitPoint,
  featuresFor,
  whistlesFrom,
  judge,
  looksLikeRally,
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

/** Dezelfde metingen, met fluitsignalen op de opgegeven momenten. */
function withSound(
  base: readonly MotionSample[],
  blows: readonly { at: number; level: number }[],
  floor = 4,
): MotionSample[] {
  return base.map((sample, index) => {
    const blow = blows.find((item) => Math.abs(item.at - sample.at) < 0.3);
    const jitter = ((index * 13) % 7) / 3;
    return { ...sample, whistle: blow ? blow.level : floor + jitter };
  });
}

describe('de fluitsignalen eruit halen', () => {
  it('hoort ze waar ze zitten en nergens anders', () => {
    const heard = whistlesFrom(withSound(samples([[10, 18]], 60), [
      { at: 8, level: 200 },
      { at: 18.5, level: 190 },
    ]));
    expect(heard.map((peak) => Math.round(peak.at))).toEqual([8, 18]);
  });

  it('hoort niets in een opname zonder fluit', () => {
    expect(whistlesFrom(withSound(samples([[10, 18]], 60), []))).toEqual([]);
  });

  it('zwijgt netjes als er niet meegeluisterd kon worden', () => {
    expect(whistlesFrom(samples([[10, 18]], 60))).toEqual([]);
  });

  it('houdt ook de zachtere fluiten', () => {
    // Hardheid zegt niets over afstand: dezelfde fluit meet de ene keer 200 en
    // de andere keer 70, puur door waar de meting in de toon viel. Wie op die
    // getallen filtert, gooit echte rally’s weg.
    const blows = [8, 18.5, 30, 40, 50, 60].map((at, index) => ({
      at,
      level: index % 2 === 0 ? 200 : 70,
    }));
    expect(whistlesFrom(withSound(samples([[10, 18]], 70), blows))).toHaveLength(6);
  });

  it('rekent de meetvertraging terug', () => {
    // Het geluid komt later binnen dan het beeld; met de vertraging erbij hoort
    // de fluit weer bij het moment waarop hij klonk.
    const heard = whistlesFrom(
      withSound(samples([[10, 18]], 60), [{ at: 8.5, level: 200 }]),
      { lagSeconds: 0.5 },
    );
    // De metingen liggen op een vijfde seconde; dichterbij dan dat kan niet.
    expect(Math.abs(heard[0]!.at - 8)).toBeLessThanOrEqual(0.2);
  });

  it('hoort een fluit boven een zaal die zelf al ruist', () => {
    const noisy = samples([[10, 18]], 60).map((sample, index) => ({
      ...sample,
      whistle: 40 + ((index * 13) % 9),
    }));
    noisy[40] = { ...noisy[40]!, whistle: 190 };
    const heard = whistlesFrom(noisy);
    expect(heard).toHaveLength(1);
    expect(heard[0]!.at).toBeCloseTo(8, 1);
  });
});

describe('een gevonden stuk beweging beoordelen', () => {
  const spans = [
    { start: 10, end: 18 },
    { start: 30, end: 36 },
  ];

  it('koppelt de service- en eindfluit aan de juiste rally', () => {
    const judged = judge(spans, [
      { at: 7, level: 200 },
      { at: 19, level: 200 },
      { at: 27, level: 200 },
      { at: 37, level: 200 },
    ]);
    expect(judged[0]!.serveWhistle).toBe(7);
    expect(judged[0]!.endWhistle).toBe(19);
    expect(judged[1]!.serveWhistle).toBe(27);
    expect(judged[1]!.endWhistle).toBe(37);
    expect(judged.every(looksLikeRally)).toBe(true);
  });

  it('rekent de eindfluit van de vorige rally niet als service van de volgende', () => {
    // Een korte pauze: de eindfluit van rally 1 ligt binnen negen seconden
    // vóór het begin van rally 2, maar hij hoort bij rally 1.
    const judged = judge(
      [
        { start: 10, end: 18 },
        { start: 22, end: 28 },
      ],
      [{ at: 18.5, level: 200 }],
    );
    expect(judged[0]!.endWhistle).toBe(18.5);
    expect(judged[1]!.serveWhistle).toBeNull();
  });

  it('herkent bewegen tussen de rally’s door aan het ontbreken van fluit', () => {
    const judged = judge(
      [
        { start: 10, end: 18 },
        // Twee ploegen die van speelhelft wisselen: beweging, geen fluit.
        { start: 45, end: 52 },
      ],
      [
        { at: 7, level: 200 },
        { at: 19, level: 200 },
      ],
    );
    expect(looksLikeRally(judged[0]!)).toBe(true);
    expect(looksLikeRally(judged[1]!)).toBe(false);
  });

  it('geeft een fluit aan het stuk beweging waar hij het dichtst bij ligt', () => {
    // Tussen een rally en het gerommel erna ligt de eindfluit. Die hoort bij de
    // rally, ook al valt hij binnen het zoekbereik van het gerommel.
    const judged = judge(
      [
        { start: 10, end: 18 },
        { start: 24, end: 30 },
      ],
      [{ at: 18.6, level: 200 }],
    );
    expect(judged[0]!.endWhistle).toBe(18.6);
    expect(judged[1]!.serveWhistle).toBeNull();
    expect(looksLikeRally(judged[1]!)).toBe(false);
  });
});

describe('wat er van een rally onthouden wordt', () => {
  it('vat de beweging binnen de rally samen', () => {
    const found = featuresFor(samples([[10, 18]], 40), { start: 10, end: 18 });
    expect(found.duration).toBe(8);
    expect(found.peakEnergy).toBeGreaterThan(found.meanEnergy);
    expect(found.bursts).toBeGreaterThanOrEqual(1);
  });

  it('telt de keren dat de drukte opleefde', () => {
    // Drie duidelijke uitschieters in een verder rustige rally.
    const base: MotionSample[] = [];
    for (let i = 0; i <= 40; i++) {
      const at = 10 + i / 5;
      const piek = i === 5 || i === 18 || i === 31;
      base.push({ at, energy: piek ? 30 : 5 });
    }
    expect(featuresFor(base, { start: 10, end: 18 }).bursts).toBe(3);
  });

  it('valt niet om bij een rally waar niets in zit', () => {
    expect(featuresFor([], { start: 3, end: 9 })).toEqual({
      duration: 6,
      peakEnergy: 0,
      meanEnergy: 0,
      bursts: 0,
    });
  });
});
