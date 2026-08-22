/**
 * Referentiewaarden: wat is dit getal op topniveau?
 *
 * Twee dingen zijn hier belangrijker dan de getallen zelf.
 *
 * Eén: ze staan als **data** in dit bestand, niet als drempel in de code. Een
 * andere competitie of een beter onderbouwd getal is dan een regel aanpassen,
 * geen verbouwing.
 *
 * Twee: bij elk getal staat waar het vandaan komt, en dat is ook op het scherm
 * te zien. De waarden hieronder zijn `indicatief`: ordegroottes die in de
 * volleybalanalyse breed worden aangehouden voor internationaal topniveau, niet
 * door ons uit een dataset gerekend. Dat verschil hoort zichtbaar te zijn — de
 * hele app draait erom dat je weet waar een getal op berust. Zodra er echte
 * wedstrijden zijn ingelezen (DataVolley-bestanden), kan hier `berekend` staan
 * met het aantal wedstrijden erbij, en dan pas is het een harde maatstaf.
 */

import type { MetricKey } from './metrics';

export type ReferenceBasis = 'indicatief' | 'berekend';

export interface Reference {
  metric: MetricKey;
  value: number;
  basis: ReferenceBasis;
  /** Letterlijk op het scherm te tonen: waar dit getal op berust. */
  source: string;
}

export interface ReferenceLevel {
  id: string;
  label: string;
  /** Korte omschrijving van het niveau waar deze getallen bij horen. */
  description: string;
  values: Record<MetricKey, Reference>;
}

const INDICATIVE =
  'Indicatief: ordegrootte die in de volleybalanalyse voor internationaal topniveau wordt aangehouden. Niet uit een dataset berekend.';

/**
 * Internationale top (dames/heren op interlandniveau en de sterkste
 * competities). Bewust één niveau: meer niveaus zonder betere onderbouwing
 * zouden precisie suggereren die er niet is.
 */
export const TOP_LEVEL: ReferenceLevel = {
  id: 'top',
  label: 'Topniveau',
  description:
    'Internationale top. Ver boven jullie competitie — bedoeld als richting, niet als norm voor volgende week.',
  values: {
    sideout: {
      metric: 'sideout',
      value: 0.64,
      basis: 'indicatief',
      source: `${INDICATIVE} Boven de 60% geldt daar als ondergrens; de beste ploegen zitten richting 70%.`,
    },
    breakPoint: {
      metric: 'breakPoint',
      value: 0.36,
      basis: 'indicatief',
      source: `${INDICATIVE} Het spiegelbeeld van de sideout van de tegenstander: wat zij niet sideouten, win jij op je service.`,
    },
    receptionPositive: {
      metric: 'receptionPositive',
      value: 0.6,
      basis: 'indicatief',
      source: `${INDICATIVE} Op topniveau wordt zwaar geserveerd, dus een hoger percentage is er moeilijker dan bij ons.`,
    },
    attackKill: {
      metric: 'attackKill',
      value: 0.47,
      basis: 'indicatief',
      source: `${INDICATIVE} Tegenover een topblok; individuele uitschieters liggen hoger.`,
    },
    attackEfficiency: {
      metric: 'attackEfficiency',
      value: 0.25,
      basis: 'indicatief',
      source: `${INDICATIVE} Punten min fouten per aanval; +25% is op topniveau een goede wedstrijd.`,
    },
    serveError: {
      metric: 'serveError',
      value: 0.15,
      basis: 'indicatief',
      source: `${INDICATIVE} Bewust hoog: op topniveau wordt risico genomen op de service. Lager is daar niet automatisch beter.`,
    },
  },
};

export const REFERENCE_LEVELS: readonly ReferenceLevel[] = [TOP_LEVEL];

export function referenceFor(metric: MetricKey, level: ReferenceLevel = TOP_LEVEL): Reference {
  return level.values[metric];
}
