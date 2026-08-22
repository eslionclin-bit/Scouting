/**
 * Referentiewaarden berekenen uit ingelezen wedstrijden.
 *
 * Dit is het verschil tussen 'topniveau ligt rond de 64%' en '62%, geteld uit
 * vier wedstrijden'. Alleen het tweede is een maatstaf.
 *
 * Twee regels houden het eerlijk:
 *  - **beide ploegen tellen mee.** Wie alleen naar de thuisploeg kijkt meet of
 *    die won, niet wat het niveau is.
 *  - **ondiep gescoute bestanden tellen alleen mee voor de rally-getallen.**
 *    In sommige bestanden is alleen de belangrijkste bal per rally vastgelegd.
 *    De sideout klopt dan nog steeds — die volgt uit de uitslag — maar het
 *    aanvalspercentage zou over een selectie gaan in plaats van over alle
 *    aanvallen.
 */

import type { MatchBundle } from '../db/bundle';
import type { Reference, ReferenceLevel } from './benchmarks';
import { TOP_LEVEL } from './benchmarks';
import {
  addTallies,
  emptyTallies,
  METRIC_KEYS,
  METRICS,
  tallyMetrics,
  type MetricKey,
  type MetricTallies,
} from './metrics';

/** Onder dit aantal waarnemingen blijft de indicatieve waarde staan. */
export const MIN_REFERENCE_SAMPLE = 100;

/** Acties per rally waaronder een bestand als 'ondiep gescout' geldt. */
export const FULLY_SCOUTED = 4;

/** Getallen die uit de rally-uitslagen volgen en dus niet van de scoutdiepte afhangen. */
const RALLY_METRICS: readonly MetricKey[] = ['sideout', 'breakPoint'];

export interface ReferenceSource {
  matches: number;
  /** Wedstrijden die diep genoeg gescout zijn voor de actiegetallen. */
  detailedMatches: number;
  competitions: string[];
}

export interface ComputedReference {
  level: ReferenceLevel;
  source: ReferenceSource;
}

/**
 * Bouwt een referentieniveau uit ingelezen wedstrijden. Metingen met te weinig
 * waarnemingen vallen terug op de indicatieve waarde, zodat er nooit een
 * berekend ogend getal op het scherm staat dat op twee rally's berust.
 */
export function computeReference(bundles: readonly MatchBundle[]): ComputedReference | null {
  if (bundles.length === 0) return null;

  let all = emptyTallies();
  let detailed = emptyTallies();
  let detailedMatches = 0;
  const competitions = new Set<string>();

  for (const bundle of bundles) {
    if (bundle.match.competition) competitions.add(bundle.match.competition);

    const both = addTallies(
      tallyMetrics([bundle], { side: 'us' }),
      tallyMetrics([bundle], { side: 'them' }),
    );
    all = addTallies(all, both);

    if (depthOf(bundle) >= FULLY_SCOUTED) {
      detailed = addTallies(detailed, both);
      detailedMatches++;
    }
  }

  const source: ReferenceSource = {
    matches: bundles.length,
    detailedMatches,
    competitions: [...competitions].sort(),
  };

  const values = {} as Record<MetricKey, Reference>;
  for (const key of METRIC_KEYS) {
    const tally = RALLY_METRICS.includes(key) ? all[key] : detailed[key];
    values[key] =
      tally.total >= MIN_REFERENCE_SAMPLE
        ? {
            metric: key,
            value: tally.part / tally.total,
            basis: 'berekend',
            source: describe(key, tally, source),
          }
        : TOP_LEVEL.values[key];
  }

  return {
    level: {
      id: 'imported',
      label: 'Referentie',
      description: describeLevel(source),
      values,
    },
    source,
  };
}

/** Acties per rally: de maat voor hoe volledig een bestand gescout is. */
export function depthOf(bundle: MatchBundle): number {
  const rallies = bundle.sets.reduce((sum, set) => sum + set.rallies.length, 0);
  if (rallies === 0) return 0;
  const actions = bundle.sets.reduce(
    (sum, set) => sum + set.rallies.reduce((count, rally) => count + rally.actions.length, 0),
    0,
  );
  return actions / rallies;
}

function describe(key: MetricKey, tally: { total: number }, source: ReferenceSource): string {
  const rallyBased = RALLY_METRICS.includes(key);
  const matches = rallyBased ? source.matches : source.detailedMatches;
  const unit = METRICS[key].unit;
  const line = [
    `Berekend uit ${matches} ingelezen ${matches === 1 ? 'wedstrijd' : 'wedstrijden'}`,
    `${tally.total} ${unit}, beide ploegen meegeteld`,
    source.competitions.length > 0 ? source.competitions.join(', ') : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');

  // Sideout en breakpoint volgen uit de uitslag van een rally en zijn dus
  // precies hetzelfde getal als bij ons. De andere vier komen uit een
  // waardering, en die is vertaald van zes DataVolley-codes naar onze vier —
  // vergelijkbaar, maar niet tot op de procent.
  return rallyBased
    ? line
    : `${line}. Let op: dit getal komt uit een waardering die vertaald is van de zesdelige DataVolley-schaal naar onze vier, dus vergelijk het als richting en niet tot op de procent.`;
}

function describeLevel(source: ReferenceSource): string {
  if (source.matches === 0) return TOP_LEVEL.description;
  const shallow = source.matches - source.detailedMatches;
  return [
    `${source.matches} ingelezen ${source.matches === 1 ? 'wedstrijd' : 'wedstrijden'}`,
    shallow > 0
      ? `waarvan ${shallow} te ondiep gescout voor de actiegetallen — die tellen alleen mee voor sideout en punt op eigen service`
      : 'alle volledig gescout',
  ].join(', ');
}
