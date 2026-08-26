/**
 * De scheidsrechter lezen.
 *
 * Na elke rally wijst hij met gestrekte arm naar de kant die mag serveren. En
 * wie serveert, heeft de vorige rally gewonnen — dus die arm is precies het
 * antwoord op de vraag die je anders honderdvijfenzestig keer met de hand
 * intikt.
 *
 * Waarom dit te doen is bij deze camerastand: de camera staat schuin achter het
 * veld en de scheidsrechter staat aan de overkant, met zijn gezicht naar de
 * lens. Een arm naar links en een arm naar rechts zijn dan twee heel
 * verschillende plaatjes. Stond de camera aan de kopse kant, dan wees hij naar
 * de lens toe of ervan af en was er weinig te zien.
 *
 * Het blijft een gok van een machine, en daarom staat er in het scherm nooit
 * een ingevulde uitslag maar een voorstel dat je met één tik omzet. De
 * controle zit in de stand: wie serveert wint niet vanzelf, maar de reeks
 * winnaars moet wél optellen tot een set die op 25 eindigt met twee verschil.
 * Klopt dat niet, dan zegt de app waar het misgaat in plaats van te doen alsof
 * het klopt.
 */

/** Het kader om de scheidsrechter, als deel van het beeld (0 tot 1). */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Waarop het kadertje wordt uitgelezen. Groter dan het meetrooster van het veld: een arm is dun. */
export const ARM_GRID = { width: 48, height: 36 };

/** Eén uitgelezen kadertje: grijswaarden, op volgorde van het rooster. */
export interface ArmFrame {
  at: number;
  pixels: Uint8Array;
}

/**
 * Hoe het kadertje eruitziet als er niks gebeurt.
 *
 * De middelste waarde per beeldpunt over de hele opname, niet het gemiddelde:
 * een arm die af en toe uitsteekt trekt een gemiddelde scheef, de middelste
 * waarde niet. Zestien vakjes per beeldpunt is genoeg — we zoeken een arm, geen
 * kleurverschil.
 */
export function restingFrame(frames: readonly ArmFrame[]): Uint8Array {
  const size = ARM_GRID.width * ARM_GRID.height;
  const out = new Uint8Array(size);
  if (frames.length === 0) return out;

  const bins = 16;
  const counts = new Uint32Array(size * bins);
  for (const frame of frames) {
    for (let i = 0; i < size; i++) {
      counts[i * bins + (frame.pixels[i]! >> 4)]! += 1;
    }
  }
  const half = frames.length / 2;
  for (let i = 0; i < size; i++) {
    let seen = 0;
    for (let bin = 0; bin < bins; bin++) {
      seen += counts[i * bins + bin]!;
      if (seen >= half) {
        out[i] = bin * 16 + 8;
        break;
      }
    }
  }
  return out;
}

/** Hoeveel er links en rechts in het kadertje anders is dan normaal. */
export interface ArmReading {
  at: number;
  left: number;
  right: number;
}

export interface ArmOptions {
  /** Hoeveel een beeldpunt moet afwijken voor het meetelt. */
  minChange?: number;
  /**
   * Hoeveel van het midden buiten beschouwing blijft.
   *
   * Daar staat de scheidsrechter zelf. Hij beweegt ook als hij niets aanwijst —
   * hij draait zich om, hij bukt naar zijn kaartjes — en dat hoort niet mee te
   * tellen als een arm.
   */
  bodyShare?: number;
}

const ARM_DEFAULTS: Required<ArmOptions> = {
  minChange: 28,
  bodyShare: 0.3,
};

export function readArm(
  frames: readonly ArmFrame[],
  resting: Uint8Array,
  options: ArmOptions = {},
): ArmReading[] {
  const { minChange, bodyShare } = { ...ARM_DEFAULTS, ...options };
  const { width, height } = ARM_GRID;
  const body = Math.round((width * bodyShare) / 2);
  const middle = width / 2;
  const side = Math.max(1, Math.round(middle - body) * height);

  return frames.map((frame) => {
    let left = 0;
    let right = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (Math.abs(frame.pixels[i]! - resting[i]!) <= minChange) continue;
        if (x < middle - body) left += 1;
        else if (x > middle + body) right += 1;
      }
    }
    return { at: frame.at, left: left / side, right: right / side };
  });
}

export type Side = 'left' | 'right';

export interface DirectionOptions {
  /** Zoveel van het kadertje moet er minstens veranderen voor het een arm heet. */
  minShare?: number;
  /** Hoeveel meer dan de andere kant, anders is het niet te zeggen. */
  minLead?: number;
}

const DIRECTION_DEFAULTS: Required<DirectionOptions> = {
  minShare: 0.05,
  minLead: 1.6,
};

/**
 * Welke kant de arm op ging, tussen twee momenten in.
 *
 * Er wordt naar de sterkste meting gekeken en niet naar het gemiddelde: de arm
 * is er een seconde of twee, de rest van de pauze staat hij stil. Een gemiddelde
 * verdunt precies het enige moment waar het om gaat.
 */
export interface ArmWindow {
  /** De sterkste uitslag links en rechts in dit stuk. */
  left: number;
  right: number;
  /** Het oordeel, of niets als het niet te zeggen valt. */
  side: Side | null;
}

/**
 * De twee getallen én het oordeel, in één keer.
 *
 * De getallen zelf zijn het bewaren waard, ook als er geen oordeel uit komt:
 * juist de gevallen waarin de app twijfelde zijn later het leerzaamst.
 */
export function armWindow(
  readings: readonly ArmReading[],
  from: number,
  to: number,
  options: DirectionOptions = {},
): ArmWindow {
  const { minShare, minLead } = { ...DIRECTION_DEFAULTS, ...options };
  const window = readings.filter((reading) => reading.at >= from && reading.at <= to);
  if (window.length === 0) return { left: 0, right: 0, side: null };

  const left = Math.max(...window.map((reading) => reading.left));
  const right = Math.max(...window.map((reading) => reading.right));
  const [winner, best, other]: [Side, number, number] =
    left >= right ? ['left', left, right] : ['right', right, left];
  if (best < minShare || best < other * minLead) return { left, right, side: null };
  return { left, right, side: winner };
}

export function armDirection(
  readings: readonly ArmReading[],
  from: number,
  to: number,
  options: DirectionOptions = {},
): Side | null {
  return armWindow(readings, from, to, options).side;
}

export type Team = 'us' | 'them';

/**
 * Van 'de arm ging naar links' naar 'wij wonnen die rally'.
 *
 * Twee stappen die allebei kunnen omdraaien. Welke kant van het beeld van
 * jullie is, weet de app niet — dat zeg je één keer. En de arm wijst naar wie
 * mág serveren, dus naar de winnaar van de rally die net gespeeld is.
 */
export function winnerFor(direction: Side | null, ourSide: Side): Team | null {
  if (direction === null) return null;
  return direction === ourSide ? 'us' : 'them';
}

export interface Tally {
  us: number;
  them: number;
  /** De rally waarna de set uit was, als dat binnen de reeks gebeurde. */
  decidedAfter: number | null;
  /** Hoeveel rally's er ná dat moment nog in de reeks staan. */
  extra: number;
}

/**
 * De reeks winnaars optellen tot een stand.
 *
 * Dit is de controle op alles hierboven. Een set eindigt op vijfentwintig met
 * twee verschil; komt de reeks daar niet uit, of gaat hij er ruim overheen, dan
 * is er onderweg iets misgegaan en hoort de app dat te zeggen. Onbekende
 * rally's tellen niet mee en maken de uitkomst dus alleen maar korter, nooit
 * verkeerd.
 */
export function tallyOf(winners: readonly (Team | null)[], target = 25): Tally {
  let us = 0;
  let them = 0;
  let decidedAfter: number | null = null;
  let extra = 0;

  winners.forEach((winner, index) => {
    if (decidedAfter !== null) {
      if (winner !== null) extra += 1;
      return;
    }
    if (winner === 'us') us += 1;
    if (winner === 'them') them += 1;
    if (Math.max(us, them) >= target && Math.abs(us - them) >= 2) decidedAfter = index;
  });

  return { us, them, decidedAfter, extra };
}
