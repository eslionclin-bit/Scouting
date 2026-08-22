/**
 * De handvol getallen waar je een team op afrekent.
 *
 * Ze staan hier apart omdat ze op drie plekken naast elkaar moeten komen: wat
 * het nú is, wat het bij ons gemiddeld is, en wat het op topniveau is. Dat
 * drieluik is de enige manier om een percentage te kunnen lezen — 50% sideout
 * zegt niets, 50% tegenover je eigen 53% en 64% op topniveau zegt alles.
 */

import type { MatchBundle } from '../db/bundle';
import type { TeamSide } from '../domain/types';
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

/**
 * De ruwe tellingen achter een getal: teller en noemer apart.
 *
 * Dat is nodig om te kunnen optellen. Twee wedstrijden met 50% en 60% sideout
 * hebben samen niet 55% sideout — dat hangt af van het aantal rally's. Alleen
 * met tellers en noemers komt er iets kloppends uit.
 */
export interface MetricTally {
  part: number;
  total: number;
}

export type MetricTallies = Record<MetricKey, MetricTally>;

export interface MeasureOptions {
  setId?: string;
  /** Vanuit welke ploeg gekeken wordt. Standaard onze eigen kant. */
  side?: TeamSide;
}

/** Telt de zes getallen over een stapel wedstrijden — of over één. */
export function tallyMetrics(
  bundles: readonly MatchBundle[],
  options: MeasureOptions = {},
): MetricTallies {
  const side: TeamSide = options.side ?? 'us';
  const other: TeamSide = side === 'us' ? 'them' : 'us';

  const rallies = bundles
    .flatMap((bundle) => toRallyRows(bundle))
    .filter((row) => (options.setId ? row.setId === options.setId : true))
    .filter((row) => row.rally.wonBy !== null);

  const actions = bundles
    .flatMap((bundle) => toActionRows(bundle))
    .filter((row) => (options.setId ? row.setId === options.setId : true));
  const ours = statsByType(filterActions(actions, { team: side }));

  const receiving = rallies.filter((row) => row.rally.servingTeam === other);
  const serving = rallies.filter((row) => row.rally.servingTeam === side);

  return {
    sideout: {
      part: receiving.filter((row) => row.rally.wonBy === side).length,
      total: receiving.length,
    },
    breakPoint: {
      part: serving.filter((row) => row.rally.wonBy === side).length,
      total: serving.length,
    },
    receptionPositive: {
      part: ours.reception.counts.perfect + ours.reception.counts.good,
      total: ours.reception.total,
    },
    attackKill: { part: ours.attack.counts.perfect, total: ours.attack.total },
    attackEfficiency: {
      part: ours.attack.counts.perfect - ours.attack.counts.error,
      total: ours.attack.total,
    },
    serveError: { part: ours.serve.counts.error, total: ours.serve.total },
  };
}

/** Telt twee metingen bij elkaar op — tellers bij tellers, noemers bij noemers. */
export function addTallies(a: MetricTallies, b: MetricTallies): MetricTallies {
  const sum = {} as MetricTallies;
  for (const key of METRIC_KEYS) {
    sum[key] = { part: a[key].part + b[key].part, total: a[key].total + b[key].total };
  }
  return sum;
}

export function toMetricSet(tallies: MetricTallies): MetricSet {
  const result = {} as MetricSet;
  for (const key of METRIC_KEYS) {
    const { part, total } = tallies[key];
    result[key] = { value: total > 0 ? part / total : null, sample: total };
  }
  return result;
}

export function measureMetrics(
  bundles: readonly MatchBundle[],
  options: MeasureOptions = {},
): MetricSet {
  return toMetricSet(tallyMetrics(bundles, options));
}

/** Lege meting, voor als er nog niets gespeeld is. */
export function emptyMetrics(): MetricSet {
  const empty = {} as MetricSet;
  for (const key of METRIC_KEYS) empty[key] = { value: null, sample: 0 };
  return empty;
}

export function emptyTallies(): MetricTallies {
  const empty = {} as MetricTallies;
  for (const key of METRIC_KEYS) empty[key] = { part: 0, total: 0 };
  return empty;
}

export function formatMetric(key: MetricKey, value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value * 100);
  if (METRICS[key].format === 'signed') return `${rounded > 0 ? '+' : ''}${rounded}%`;
  return `${rounded}%`;
}
