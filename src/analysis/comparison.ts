/**
 * Het drieluik: nu — bij ons gemiddeld — op topniveau.
 *
 * Een los percentage is niet te lezen. Pas naast je eigen gemiddelde weet je of
 * dit een mindere dag is, en pas naast een externe maat weet je of jullie
 * gemiddelde zelf goed of matig is. Die twee vergelijkingen doen verschillend
 * werk, en daarom staan ze allebei op het scherm.
 */

import { referenceFor, TOP_LEVEL, type Reference, type ReferenceLevel } from './benchmarks';
import {
  METRIC_KEYS,
  METRICS,
  MIN_BASELINE_SAMPLE,
  type MetricDefinition,
  type MetricKey,
  type MetricSet,
  type MetricValue,
} from './metrics';

/** Onder dit aantal is 'nu' nog te weinig om tegen iets af te zetten. */
const MIN_NOW_RALLIES = 10;
const MIN_NOW_ACTIONS = 8;

/** Vanaf dit verschil noemen we het een afwijking van het eigen gemiddelde. */
const NOTABLE = 0.05;

export type Verdict = 'boven' | 'gelijk' | 'onder';

export interface MetricComparison {
  metric: MetricDefinition;
  /** Deze wedstrijd of set. Null als er nog niets gespeeld is. */
  now: MetricValue;
  /** Het eigen gemiddelde over de wedstrijden ervoor. */
  own: MetricValue;
  reference: Reference;
  /** Alleen ingevuld als beide kanten genoeg waarnemingen hebben. */
  vsOwn: Verdict | null;
}

export function compareMetrics(
  now: MetricSet,
  own: MetricSet,
  level: ReferenceLevel = TOP_LEVEL,
): MetricComparison[] {
  return METRIC_KEYS.map((key) => ({
    metric: METRICS[key],
    now: now[key],
    own: own[key],
    reference: referenceFor(key, level),
    vsOwn: verdictFor(key, now[key], own[key]),
  }));
}

function verdictFor(key: MetricKey, now: MetricValue, own: MetricValue): Verdict | null {
  const minimum = METRICS[key].unit === 'rallies' ? MIN_NOW_RALLIES : MIN_NOW_ACTIONS;
  if (now.value === null || own.value === null) return null;
  if (now.sample < minimum || own.sample < MIN_BASELINE_SAMPLE) return null;

  // Bij servicefouten is minder beter, dus daar draait het oordeel om.
  const delta =
    METRICS[key].better === 'lower' ? own.value - now.value : now.value - own.value;
  if (delta >= NOTABLE) return 'boven';
  if (delta <= -NOTABLE) return 'onder';
  return 'gelijk';
}
