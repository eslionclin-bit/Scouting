/**
 * De handvol getallen waar je een team op afrekent.
 *
 * Ze staan hier apart omdat ze op drie plekken naast elkaar moeten komen: wat
 * het nú is, wat het bij ons gemiddeld is, en wat het op topniveau is. Dat
 * drieluik is de enige manier om een percentage te kunnen lezen — 50% sideout
 * zegt niets, 50% tegenover je eigen 53% en 64% op topniveau zegt alles.
 */

import type { MatchBundle } from '../db/bundle';
import { filterActions, toActionRows, toRallyRows } from './rows';
import { statsByType } from './stats';

export type MetricKey =
  | 'sideout'
  | 'breakPoint'
  | 'receptionPositive'
  | 'attackKill'
  | 'attackEfficiency'
  | 'serveError';

export const METRIC_KEYS: readonly MetricKey[] = [
  'sideout',
  'breakPoint',
  'receptionPositive',
  'attackKill',
  'attackEfficiency',
  'serveError',
] as const;

export interface MetricDefinition {
  key: MetricKey;
  label: string;
  /** Bij servicefouten is lager beter; bij de rest hoger. */
  better: 'higher' | 'lower';
  /** Rendement kan negatief zijn en krijgt daarom een plusteken. */
  format: 'pct' | 'signed';
  /** Waar het getal uit gerekend is, in één regel. */
  explain: string;
  /** Wat er geteld wordt: rally's of acties. */
  unit: 'rallies' | 'acties';
}

export const METRICS: Record<MetricKey, MetricDefinition> = {
  sideout: {
    key: 'sideout',
    label: 'Sideout',
    better: 'higher',
    format: 'pct',
    explain: 'Rally’s gewonnen als de tegenstander serveert.',
    unit: 'rallies',
  },
  breakPoint: {
    key: 'breakPoint',
    label: 'Punt op eigen service',
    better: 'higher',
    format: 'pct',
    explain: 'Rally’s gewonnen als wij serveren — elk zo’n punt is winst op de stand.',
    unit: 'rallies',
  },
  receptionPositive: {
    key: 'receptionPositive',
    label: 'Pass positief',
    better: 'higher',
    format: 'pct',
    explain: 'Passes waarna de aanval nog te kiezen had (perfect of goed).',
    unit: 'acties',
  },
  attackKill: {
    key: 'attackKill',
    label: 'Aanval punt',
    better: 'higher',
    format: 'pct',
    explain: 'Aanvallen die direct een punt opleveren.',
    unit: 'acties',
  },
  attackEfficiency: {
    key: 'attackEfficiency',
    label: 'Aanvalsrendement',
    better: 'higher',
    format: 'signed',
    explain: 'Punten min fouten, gedeeld door het aantal aanvallen.',
    unit: 'acties',
  },
  serveError: {
    key: 'serveError',
    label: 'Servicefouten',
    better: 'lower',
    format: 'pct',
    explain: 'Services die de bal weggeven zonder dat er gespeeld is.',
    unit: 'acties',
  },
};

export interface MetricValue {
  value: number | null;
  /** Aantal rally’s of acties waar het getal op berust. */
  sample: number;
}

export type MetricSet = Record<MetricKey, MetricValue>;

/**
 * Onder dit aantal is een eigen gemiddelde geen niveau maar een momentopname.
 * Hetzelfde principe als overal: liever niets zeggen dan te vroeg iets zeggen.
 */
export const MIN_BASELINE_SAMPLE = 25;

/** Meet de zes getallen over een stapel wedstrijden — of over één. */
export function measureMetrics(
  bundles: readonly MatchBundle[],
  options: { setId?: string } = {},
): MetricSet {
  const rallies = bundles
    .flatMap((bundle) => toRallyRows(bundle))
    .filter((row) => (options.setId ? row.setId === options.setId : true))
    .filter((row) => row.rally.wonBy !== null);

  const actions = bundles
    .flatMap((bundle) => toActionRows(bundle))
    .filter((row) => (options.setId ? row.setId === options.setId : true));
  const ours = statsByType(filterActions(actions, { team: 'us' }));

  const receiving = rallies.filter((row) => row.rally.servingTeam === 'them');
  const serving = rallies.filter((row) => row.rally.servingTeam === 'us');

  return {
    sideout: {
      value: share(receiving.filter((row) => row.rally.wonBy === 'us').length, receiving.length),
      sample: receiving.length,
    },
    breakPoint: {
      value: share(serving.filter((row) => row.rally.wonBy === 'us').length, serving.length),
      sample: serving.length,
    },
    receptionPositive: {
      value: ours.reception.total > 0 ? ours.reception.positivePct : null,
      sample: ours.reception.total,
    },
    attackKill: {
      value: ours.attack.total > 0 ? ours.attack.pointPct : null,
      sample: ours.attack.total,
    },
    attackEfficiency: {
      value: ours.attack.total > 0 ? ours.attack.efficiency : null,
      sample: ours.attack.total,
    },
    serveError: {
      value: ours.serve.total > 0 ? ours.serve.errorPct : null,
      sample: ours.serve.total,
    },
  };
}

/** Lege meting, voor als er nog niets gespeeld is. */
export function emptyMetrics(): MetricSet {
  const empty = {} as MetricSet;
  for (const key of METRIC_KEYS) empty[key] = { value: null, sample: 0 };
  return empty;
}

function share(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}

export function formatMetric(key: MetricKey, value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value * 100);
  if (METRICS[key].format === 'signed') return `${rounded > 0 ? '+' : ''}${rounded}%`;
  return `${rounded}%`;
}
