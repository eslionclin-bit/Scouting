/**
 * Rally's terugvinden in een opname.
 *
 * Negentig minuten video wordt hiermee een lijst van ongeveer honderdvijftig
 * stukjes van tien seconden. Dat is de hele truc waarmee invoeren niet meer
 * live hoeft: je springt van rally naar rally en kijkt zo vaak terug als je
 * wilt.
 *
 * Het gaat op twee dingen tegelijk. **Beweging**: tijdens een rally beweegt er
 * veel in het veld, ertussen staat iedereen te wachten — en beweging is te
 * plaatsen, want wat buiten jullie veld gebeurt snijd je met het kader weg.
 * En **de fluit**: elke rally in volleybal zit tussen twee fluitsignalen, een
 * om de service vrij te geven en een om de bal dood te verklaren. Dat is een
 * patroon waar bewegen tussen de rally's door niet aan voldoet.
 *
 * Het bezwaar tegen geluid — in een sporthal spelen meer wedstrijden tegelijk
 * en die fluiten ook — is niet weg, maar wel kleiner te maken. Jullie
 * scheidsrechter staat vlak bij de camera en klinkt daarom harder dan die twee
 * velden verderop. Waar dat verschil duidelijk in de opname zit, gebruikt de
 * app het; waar het er niet in zit, doet hij alsof alle fluiten kunnen kloppen.
 * Nooit andersom: een fluit die niet te plaatsen is, mag geen rally wegnemen.
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
  /**
   * Hoeveel geluid er op dat moment in de fluitband zat (0 tot 255).
   *
   * Ontbreekt als er niet meegeluisterd kon worden — geen geluidsspoor, of een
   * browser die het niet toelaat. Dan werkt alles hieronder gewoon door op
   * beweging alleen.
   */
  whistle?: number;
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

/** Eén fluitsignaal: wanneer, en hoe hard. */
export interface Whistle {
  at: number;
  level: number;
}

export interface WhistleOptions {
  /**
   * Onder deze waarde is het geen fluit maar zaalgeluid.
   *
   * Anders dan bij beweging kan hier een vaste ondergrens onder: de meting is
   * een vaste schaal — hoeveel geluid er in de fluitband zat, van 0 tot 255.
   */
  minLevel?: number;
  /** Hoeveel een fluit boven het gewone zaalgeluid moet uitkomen. */
  marginOverNoise?: number;
  /** Twee metingen vlak na elkaar zijn één fluit, geen twee. */
  minGapSeconds?: number;
  /**
   * Hoeveel later het geluid binnenkomt dan het beeld, in opnameseconden.
   *
   * De geluidsmeter kijkt altijd naar het stukje dat net voorbij is, en op
   * zestien keer de snelheid is dat stukje zestien keer zoveel opnametijd. Op
   * de proefopname kwam elke fluit een halve seconde te laat binnen; precies
   * wat je uitrekent uit de vensterlengte maal de snelheid. Wie dat niet
   * terugrekent, hangt de fluit aan de verkeerde rally.
   */
  lagSeconds?: number;
}

const WHISTLE_DEFAULTS: Required<WhistleOptions> = {
  minLevel: 25,
  marginOverNoise: 15,
  minGapSeconds: 0.8,
  lagSeconds: 0,
};

/**
 * De fluitsignalen uit de metingen halen.
 *
 * Alles wat duidelijk boven het gewone zaalgeluid uitkomt telt als fluit, en
 * verder niets. Uit welk veld hij komt, blijkt hier níet uit: dat is
 * uitgeprobeerd en het werkt niet. De browser meet geluid op een logaritmische
 * schaal en knipt bij zestien keer de snelheid de piek half af, waardoor
 * dezelfde fluit de ene keer 204 en de andere keer 73 oplevert. Op zulke
 * getallen 'de zachte zijn van het veld ernaast' bouwen is een gok die er
 * echte rally's uit gooide.
 *
 * Het onderscheid komt daarom verderop, uit de tijd in plaats van de hardheid:
 * een rally heeft een fluit vlak vóór de eerste beweging én een vlak na de
 * laatste, en elke fluit hoort maar bij één rally. Een fluit twee velden
 * verderop valt daar zelden precies in, en valt hij er wel in, dan kost dat
 * hooguit één stuk beweging dat blijft staan. Nooit een rally die verdwijnt.
 */
export function whistlesFrom(
  samples: readonly MotionSample[],
  options: WhistleOptions = {},
): Whistle[] {
  const { minLevel, marginOverNoise, minGapSeconds, lagSeconds } = {
    ...WHISTLE_DEFAULTS,
    ...options,
  };
  const heard = samples.filter((sample) => typeof sample.whistle === 'number');
  if (heard.length < 3) return [];

  const levels = heard.map((sample) => sample.whistle!).sort((a, b) => a - b);
  const noise = levels[Math.floor(levels.length / 2)]!;
  const threshold = Math.max(minLevel, noise + marginOverNoise);

  // Een rij metingen boven de drempel is één fluit. Het tijdstip is dat van de
  // eerste meting erboven, niet van de hardste: een fluit begint met de aanzet,
  // en de hardste meting ligt verderop in de toon.
  const peaks: Whistle[] = [];
  for (const sample of heard) {
    const level = sample.whistle!;
    if (level <= threshold) continue;
    const previous = peaks[peaks.length - 1];
    if (previous && sample.at - lagSeconds - previous.at <= minGapSeconds) {
      previous.level = Math.max(previous.level, level);
      continue;
    }
    peaks.push({ at: sample.at - lagSeconds, level });
  }
  return peaks;
}

/**
 * Een rally met de fluitsignalen erbij die erbij horen.
 *
 * De fluit vóór de rally geeft de service vrij; die erna verklaart de bal dood.
 * Zitten ze er allebei, dan is dit vrijwel zeker een rally. Zit er geen van
 * beide, dan is het waarschijnlijk iets anders — inspelen, wisselen, een bal
 * die teruggegooid wordt.
 */
export interface JudgedSpan extends RallySpan {
  /** De fluit die de service vrijgaf, als hij gehoord is. */
  serveWhistle: number | null;
  /** De fluit waarmee de rally werd afgefloten. */
  endWhistle: number | null;
}

export interface JudgeOptions {
  /** Zoveel eerder dan de eerste beweging mag de servicefluit liggen. */
  leadSeconds?: number;
  /** Zoveel later dan de laatste beweging mag de eindfluit liggen. */
  tailSeconds?: number;
}

const JUDGE_DEFAULTS: Required<JudgeOptions> = {
  // De regels geven acht seconden tussen fluit en service; in de praktijk zijn
  // het er drie of vier. Ruim nemen kost niets: er ligt toch geen tweede fluit
  // tussen twee rally's in.
  leadSeconds: 9,
  tailSeconds: 4,
};

export function judge(
  spans: readonly RallySpan[],
  whistles: readonly Whistle[],
  options: JudgeOptions = {},
): JudgedSpan[] {
  const { leadSeconds, tailSeconds } = { ...JUDGE_DEFAULTS, ...options };

  // Elke fluit hoort bij één rally. Zonder die boekhouding wordt de eindfluit
  // van de vorige rally ook de servicefluit van de volgende — bij een korte
  // pauze liggen die immers vlak bij elkaar — en lijkt alles even zeker.
  const used = new Set<number>();
  const claim = (from: number, to: number, last: boolean): number | null => {
    const options_ = whistles.filter(
      (peak, index) => !used.has(index) && peak.at >= from && peak.at <= to,
    );
    const picked = last ? options_[options_.length - 1] : options_[0];
    if (!picked) return null;
    used.add(whistles.indexOf(picked));
    return picked.at;
  };

  return spans.map((span, index) => {
    // Een fluit tussen twee stukken beweging in hoort bij het stuk waar hij het
    // dichtst bij ligt. Zonder die grens pikt een wissel de servicefluit van de
    // rally erna in, en lijkt die wissel net zo goed een rally.
    const previous = spans[index - 1];
    const next = spans[index + 1];
    const floor = Math.max(
      span.start - leadSeconds,
      previous ? (previous.end + span.start) / 2 : -Infinity,
    );
    // De laatste vóór de eerste beweging: dat is degene die deze service vrijgaf.
    const serveWhistle = claim(floor, span.start + 1.5, true);
    const ceiling = Math.min(
      span.end + tailSeconds,
      next ? (span.end + next.start) / 2 : Infinity,
    );
    const endWhistle = claim(span.end - 1, ceiling, false);
    return { ...span, serveWhistle, endWhistle };
  });
}

/**
 * Is dit waarschijnlijk een echte rally?
 *
 * Alleen een oordeel als er überhaupt fluiten gehoord zijn. Anders is 'geen
 * fluit gevonden' geen aanwijzing over deze rally maar over de opname, en dan
 * hoort het niets te betekenen.
 */
export function looksLikeRally(span: JudgedSpan): boolean {
  return span.serveWhistle !== null || span.endWhistle !== null;
}

/** Wat er aan een gevonden rally opvalt, in gewone taal. */
export function noteFor(span: RallySpan, options: SegmentOptions = {}): string | null {
  const { maxSeconds } = { ...DEFAULTS, ...options };
  const length = span.end - span.start;
  if (length > maxSeconds) return 'erg lang — misschien twee rally’s aan elkaar';
  return null;
}

/**
 * De vier hoeken van jullie veld, als deel van het beeld (0 tot 1).
 *
 * Een rechthoek volstaat niet. Een camera staat zelden recht voor het veld —
 * meestal schuin achter een hoek — en dan is een veld op het beeld geen
 * rechthoek maar een scheve vierhoek. Naast jullie veld ligt er een ander, en
 * dat valt met een rechthoek niet weg te snijden zonder het halve eigen veld
 * mee te nemen.
 */
export interface Corners {
  topLeft: [number, number];
  topRight: [number, number];
  bottomRight: [number, number];
  bottomLeft: [number, number];
}

export const CORNER_KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'] as const;

export type CornerKey = (typeof CORNER_KEYS)[number];

/** Een beginvorm die op de meeste opnamen ongeveer klopt: iets breder onderaan. */
export const DEFAULT_CORNERS: Corners = {
  topLeft: [0.2, 0.35],
  topRight: [0.8, 0.35],
  bottomRight: [0.95, 0.9],
  bottomLeft: [0.05, 0.9],
};

/**
 * Voor elk vakje van het meetrooster: telt het mee of niet.
 *
 * Eén keer uitrekenen en daarna hergebruiken; het gaat om duizenden beeldjes en
 * dan is per beeldje opnieuw bepalen weggegooid werk.
 */
export function maskFor(corners: Corners, width: number, height: number): Uint8Array {
  const polygon = CORNER_KEYS.map((key) => corners[key]);
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      mask[y * width + x] = inside((x + 0.5) / width, (y + 0.5) / height, polygon) ? 1 : 0;
    }
  }
  return mask;
}

/**
 * Ligt dit punt binnen de vierhoek?
 *
 * Trek een lijn naar rechts en tel hoe vaak hij een zijde kruist: oneven is
 * binnen, even is buiten. Werkt ook bij een scheve vorm, en dat is precies wat
 * hier nodig is.
 */
function inside(x: number, y: number, polygon: readonly (readonly [number, number])[]): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]!;
    const [xj, yj] = polygon[j]!;
    const crosses = yi > y !== yj > y;
    if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
  }
  return result;
}

/**
 * Wat er van de beweging tijdens één rally te onthouden valt.
 *
 * Niet om er nu iets mee te doen, maar om het niet weg te gooien. Dit zijn de
 * getallen waar later een oordeel op te leren valt — en ze zijn alleen te
 * berekenen zolang de opname er is. Wie ze nu laat vallen, kan ze nooit meer
 * terughalen zonder de hele wedstrijd opnieuw door te lopen.
 */
export interface RallyFeatures {
  /** Hoe lang de rally duurde, in seconden. */
  duration: number;
  /** De drukste meting. Een aanval geeft meer uitslag dan een vrije bal. */
  peakEnergy: number;
  meanEnergy: number;
  /**
   * Hoe vaak de drukte opleefde.
   *
   * Een ruwe telling van balcontacten: elke aanraking geeft een uitschieter.
   * Ruw, want een blok en een aanval vlak na elkaar tellen als één — maar het
   * onderscheid tussen een rally van drie contacten en een van twaalf zit er
   * wel in.
   */
  bursts: number;
}

export function featuresFor(
  samples: readonly MotionSample[],
  span: RallySpan,
): RallyFeatures {
  const inside = samples.filter((sample) => sample.at >= span.start && sample.at <= span.end);
  const duration = span.end - span.start;
  if (inside.length === 0) {
    return { duration, peakEnergy: 0, meanEnergy: 0, bursts: 0 };
  }
  const energies = inside.map((sample) => sample.energy);
  const peakEnergy = Math.max(...energies);
  const meanEnergy = energies.reduce((sum, value) => sum + value, 0) / energies.length;

  const level = meanEnergy + (peakEnergy - meanEnergy) / 2;
  let bursts = 0;
  let above = false;
  for (const energy of energies) {
    if (!above && energy > level) bursts += 1;
    above = energy > level;
  }
  return { duration, peakEnergy, meanEnergy, bursts };
}
