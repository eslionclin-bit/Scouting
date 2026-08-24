/**
 * Rally's terugvinden in een opname.
 *
 * Negentig minuten video wordt hiermee een lijst van ongeveer honderdvijftig
 * stukjes van tien seconden. Dat is de hele truc waarmee invoeren niet meer
 * live hoeft: je springt van rally naar rally en kijkt zo vaak terug als je
 * wilt.
 *
 * Het voor de hand liggende idee — luisteren naar de scheidsrechtersfluit —
 * werkt in een sporthal niet. Daar spelen meestal meer wedstrijden tegelijk, en
 * die fluiten ook; een fluit vertelt niet van welk veld hij komt. Dus gaat het
 * op beweging: tijdens een rally beweegt er veel in het veld, ertussen staat
 * iedereen te wachten. En beweging is wél te plaatsen — wat buiten het veld
 * gebeurt, snijd je gewoon uit beeld.
 *
 * Deze module rekent alleen; het aflezen van de beelden gebeurt in het scherm
 * dat hem gebruikt. Zo is de redenering te testen zonder video.
 */

/** Eén meting: hoeveel er veranderde, en op welk moment in de opname. */
export interface MotionSample {
  /** Seconden vanaf het begin van de opname. */
  at: number;
  /** Hoeveel er veranderde ten opzichte van het vorige beeld. */
  energy: number;
}

export interface RallySpan {
  /** Seconden vanaf het begin van de opname. */
  start: number;
  end: number;
}

export interface SegmentOptions {
  /** Korter dan dit is geen rally maar een bal die terugrolt. */
  minSeconds?: number;
  /** Twee stukken beweging met minder rust ertussen horen bij elkaar. */
  maxGapSeconds?: number;
  /** Langer dan dit is bijna zeker twee rally's aan elkaar geplakt. */
  maxSeconds?: number;
  /**
   * Hoeveel drukker een rally minstens moet zijn dan de rust ertussen.
   *
   * Zonder deze eis vindt de drempelzoeker altijd wél een tweedeling, ook in een
   * opname waarin niets gebeurt — dan splitst hij de ruis en heet de hele film
   * één lange rally. Er moet dus een echt verschil zijn, geen gevonden verschil.
   */
  minContrast?: number;
}

const DEFAULTS: Required<SegmentOptions> = {
  minSeconds: 2.5,
  maxGapSeconds: 1.5,
  maxSeconds: 60,
  minContrast: 1.6,
};

/**
 * De grens tussen 'er wordt gespeeld' en 'er wordt gewacht'.
 *
 * Niet een vaste waarde en ook niet de mediaan. De mediaan werkt alleen als er
 * meer gewacht dan gespeeld wordt, en dat is niet altijd zo: bij lange rally's
 * en korte pauzes ligt hij midden in het spel en vindt de app niets meer. Dat
 * is echt gebeurd tijdens het uitproberen — nul rally's op een opname waar er
 * tien in zaten.
 *
 * Daarom wordt de drempel gezocht waar de twee groepen het scherpst uiteen
 * vallen: verdeel op elke mogelijke waarde en kijk waar het verschil tussen de
 * twee helften het grootst is. Dat vraagt niets over hoeveel er van elk is.
 */
export function splitPoint(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high <= low) return low;

  const bins = 64;
  const counts = new Array<number>(bins).fill(0);
  for (const value of values) {
    const index = Math.min(bins - 1, Math.floor(((value - low) / (high - low)) * bins));
    counts[index]! += 1;
  }

  const centre = (index: number): number => low + ((index + 0.5) / bins) * (high - low);
  const total = values.length;
  const sumAll = counts.reduce((acc, count, index) => acc + count * centre(index), 0);

  let weightLow = 0;
  let sumLow = 0;
  let best = centre(0);
  let bestScore = -1;

  for (let index = 0; index < bins - 1; index++) {
    weightLow += counts[index]!;
    sumLow += counts[index]! * centre(index);
    const weightHigh = total - weightLow;
    if (weightLow === 0 || weightHigh === 0) continue;

    const meanLow = sumLow / weightLow;
    const meanHigh = (sumAll - sumLow) / weightHigh;
    const score = weightLow * weightHigh * (meanLow - meanHigh) ** 2;
    if (score > bestScore) {
      bestScore = score;
      best = centre(index);
    }
  }
  return best;
}

/**
 * De metingen omzetten in rally's.
 *
 * Er wordt bewust ruim gerekend. Een gemiste rally zie je nooit meer terug in de
 * lijst; een rally te veel kost drie seconden kijken en één tik. Die twee fouten
 * zijn niet even duur, dus horen ze niet even zwaar te wegen.
 */
export function ralliesFrom(
  samples: readonly MotionSample[],
  options: SegmentOptions = {},
): RallySpan[] {
  const { minSeconds, maxGapSeconds, minContrast } = { ...DEFAULTS, ...options };
  if (samples.length < 3) return [];

  const threshold = splitPoint(samples.map((sample) => sample.energy));

  // Is het drukke deel niet echt drukker, dan is er geen wedstrijd te zien —
  // een lege zaal, een camera op de grond, of het stuk vóór de warming-up. Dan
  // hoort er niets uit te komen in plaats van één rally van een half uur.
  const busy = samples.filter((sample) => sample.energy > threshold);
  const quiet = samples.filter((sample) => sample.energy <= threshold);
  if (busy.length === 0 || quiet.length === 0) return [];
  const mean = (list: readonly MotionSample[]): number =>
    list.reduce((sum, sample) => sum + sample.energy, 0) / list.length;
  const quietMean = mean(quiet);
  if (quietMean <= 0 || mean(busy) / quietMean < minContrast) return [];

  const spans: RallySpan[] = [];
  let start: number | null = null;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    const active = sample.energy > threshold;
    if (active && start === null) {
      start = sample.at;
    } else if (!active && start !== null) {
      spans.push({ start, end: sample.at });
      start = null;
    }
  }
  if (start !== null) spans.push({ start, end: samples[samples.length - 1]!.at });

  const merged: RallySpan[] = [];
  for (const span of spans) {
    const previous = merged[merged.length - 1];
    if (previous && span.start - previous.end <= maxGapSeconds) {
      previous.end = span.end;
    } else {
      merged.push({ ...span });
    }
  }

  return merged.filter((span) => span.end - span.start >= minSeconds);
}

/** Wat er aan een gevonden rally opvalt, in gewone taal. */
export function noteFor(span: RallySpan, options: SegmentOptions = {}): string | null {
  const { maxSeconds } = { ...DEFAULTS, ...options };
  const length = span.end - span.start;
  if (length > maxSeconds) return 'erg lang — misschien twee rally’s aan elkaar';
  return null;
}
