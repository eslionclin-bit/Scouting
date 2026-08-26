/**
 * De balcontacten binnen een rally terugvinden, en er hoogte uit halen.
 *
 * Het scharnier van de hele kwalificatie zit in één natuurkundig feit: de tijd
 * tussen twee balcontacten hangt alleen van de hoogte af. Niet van de afstand,
 * niet van de snelheid, niet van de richting — zwaartekracht is de enige die
 * meedoet. Een bal die tussen de pass en de set anderhalve seconde onderweg is,
 * is ruim vier meter hoog geweest, waar hij ook vandaan kwam.
 *
 * Daarmee verschuift het probleem van 'de bal zien' naar 'het moment horen'.
 * Een aanraking is een korte klap over de hele breedte van het geluid, en de
 * app luistert tijdens de versnelde scan toch al mee voor de fluit. De fluit
 * zit in een smalle band rond de drieënhalve kilohertz; een klap zit overal.
 *
 * Wat hier bewust níet gebeurt: gokken. Een rally waarin de klappen niet
 * duidelijk zijn levert geen contacten op, en dan ook geen hoogtes. Een
 * verzonnen hoogte in uw seizoenscijfers is erger dan een lege plek.
 */

import type { RallySpan, SoundSample } from './rallyIndex';

/** Waar op aarde dit ook gespeeld wordt. */
const G = 9.81;

/** Hoe hoog de bal ongeveer geraakt en weer aangeraakt wordt, in meters. */
export interface ContactHeights {
  /** Waar hij vertrok: een pass van onderaf, ongeveer een meter. */
  from: number;
  /** Waar hij weer geraakt werd: een spelverdeler reikt tot ruim twee meter. */
  to: number;
}

const DEFAULT_HEIGHTS: ContactHeights = { from: 1.0, to: 2.3 };

/** Hoe lang een bal onderweg is die tot deze hoogte stijgt. */
export function flightTime(apex: number, heights: ContactHeights = DEFAULT_HEIGHTS): number {
  const { from, to } = heights;
  if (apex <= from || apex <= to) return 0;
  return Math.sqrt((2 * (apex - from)) / G) + Math.sqrt((2 * (apex - to)) / G);
}

/**
 * Andersom: uit de tijd tussen twee aanrakingen de hoogte halen.
 *
 * Er is geen kant-en-klare formule voor, dus wordt hij ingesloten: begin met
 * een ruime boven- en ondergrens en halveer net zolang tot de gezochte hoogte
 * op een centimeter vastligt. Twintig stappen is ruim voldoende en kost niets.
 *
 * Buiten de grenzen van wat in een sporthal kan, geeft dit niets terug. Een
 * tussentijd van vier seconden hoort bij een bal van twintig meter hoog: dan
 * zijn er twee aanrakingen gemist, en dan is zwijgen het juiste antwoord.
 */
export function apexBetween(
  seconds: number,
  heights: ContactHeights = DEFAULT_HEIGHTS,
): number | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const floor = Math.max(heights.from, heights.to);
  if (seconds < flightTime(floor + 0.05, heights) || seconds > flightTime(12, heights)) return null;

  let low = floor;
  let high = 12;
  for (let step = 0; step < 24; step++) {
    const middle = (low + high) / 2;
    if (flightTime(middle, heights) < seconds) low = middle;
    else high = middle;
  }
  return Math.round(((low + high) / 2) * 10) / 10;
}

export interface ContactOptions {
  /**
   * Twee aanrakingen dichter op elkaar dan dit zijn er één.
   *
   * Een blok en de aanval erop kunnen elkaar sneller opvolgen, maar dan zijn ze
   * ook in het geluid niet meer te scheiden — en doen alsof dat wel kan is
   * precies het soort verzinsel dat hier niet in hoort.
   */
  minGapSeconds?: number;
  /** Hoeveel de klap boven het gewone zaalgeluid moet uitkomen. */
  minRise?: number;
  /** Zo dicht bij een fluitsignaal telt een klap niet: dat is de fluit zelf. */
  whistleGuardSeconds?: number;
}

const CONTACT_DEFAULTS: Required<ContactOptions> = {
  minGapSeconds: 0.25,
  minRise: 12,
  whistleGuardSeconds: 0.35,
};

/**
 * De momenten waarop de bal geraakt werd, binnen één rally.
 *
 * Niet de hardste geluiden, maar de scherpste toenames: een klap valt op door
 * hoe plotseling hij komt, niet door hoe hard hij is. Een zaal die de hele
 * rally door juicht wordt daarmee vanzelf weggefilterd, want juichen zwelt aan.
 */
export function contactsIn(
  samples: readonly SoundSample[],
  span: RallySpan,
  whistles: readonly number[] = [],
  options: ContactOptions = {},
): number[] {
  const { minGapSeconds, minRise, whistleGuardSeconds } = { ...CONTACT_DEFAULTS, ...options };
  const inside = samples.filter(
    (sample) =>
      typeof sample.impact === 'number' &&
      sample.at >= span.start - 0.6 &&
      sample.at <= span.end + 0.4,
  );
  if (inside.length < 4) return [];

  const rises: { at: number; rise: number }[] = [];
  for (let i = 1; i < inside.length; i++) {
    const rise = inside[i]!.impact! - inside[i - 1]!.impact!;
    if (rise > 0) rises.push({ at: inside[i]!.at, rise });
  }
  if (rises.length === 0) return [];

  // Een drempel die zich niets aantrekt van een paar uitschieters: de middelste
  // waarde, plus een ruime marge gemeten aan hoe ver de metingen normaal van
  // die middelste af liggen. Het gemiddelde zou door de klappen zelf omhoog
  // getrokken worden — precies wat je niet wilt bij het zoeken naar klappen.
  const sorted = [...rises].map((item) => item.rise).sort((a, b) => a - b);
  const middle = sorted[Math.floor(sorted.length / 2)]!;
  const spread = [...sorted]
    .map((value) => Math.abs(value - middle))
    .sort((a, b) => a - b)[Math.floor(sorted.length / 2)]!;
  const loudest = sorted[sorted.length - 1]!;
  // Drie eisen tegelijk, en de strengste wint. De laatste is de belangrijkste:
  // binnen één rally klinken de aanrakingen ongeveer even hard, dus wat maar
  // een fractie is van de hardste klap in diezelfde rally is er geen. Dat past
  // zich vanzelf aan een zachte of harde opname aan.
  const threshold = Math.max(
    minRise,
    middle + Math.max(4, spread * 6),
    loudest * 0.3,
  );

  const found: { at: number; rise: number }[] = [];
  for (const item of rises) {
    if (item.rise < threshold) continue;
    if (whistles.some((whistle) => Math.abs(whistle - item.at) < whistleGuardSeconds)) continue;
    const previous = found[found.length - 1];
    if (previous && item.at - previous.at < minGapSeconds) {
      // Twee metingen van dezelfde klap: de sterkste wint, en die bepaalt ook
      // het tijdstip.
      if (item.rise > previous.rise) {
        previous.at = item.at;
        previous.rise = item.rise;
      }
      continue;
    }
    found.push({ ...item });
  }
  return found.map((item) => item.at);
}

/**
 * De hoogtes tussen opeenvolgende aanrakingen.
 *
 * Eén korter dan de rij contacten, en met gaten: waar de tussentijd nergens op
 * slaat komt er niets te staan in plaats van een getal waar u iets op zou
 * kunnen baseren.
 */
export function heightsBetween(
  contacts: readonly number[],
  heights: ContactHeights = DEFAULT_HEIGHTS,
): (number | null)[] {
  const out: (number | null)[] = [];
  for (let i = 1; i < contacts.length; i++) {
    out.push(apexBetween(contacts[i]! - contacts[i - 1]!, heights));
  }
  return out;
}
