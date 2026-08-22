/**
 * Eén speler, over de wedstrijden heen.
 *
 * Drie vragen tegelijk:
 *  - waar is deze speler goed in, en waar niet (trainingsdoelen);
 *  - wordt ze beter gedurende het seizoen (verloop per wedstrijd);
 *  - speelt ze vandaag onder of boven haar eigen niveau (vorm).
 *
 * Die laatste is de reden dat dit ook tijdens een wedstrijd nut heeft: 'onder
 * haar niveau' is iets anders dan 'slecht', en alleen het eerste is een reden om
 * te wisselen.
 */

import type { MatchBundle } from '../db/bundle';
import type { ActionType, Player, PlayerRole } from '../domain/types';
import { filterActions, toActionRows } from './rows';
import { statsByType, summarize, type ActionStats, type TypeStats } from './stats';

/** Onder dit aantal acties zeggen we niets over vorm. */
export const MIN_FORM_ACTIONS = 6;
/** En zonder dit aantal in de historie is er geen niveau om mee te vergelijken. */
export const MIN_HISTORY_ACTIONS = 20;

export interface PlayerMatchRow {
  matchId: string;
  date: string;
  opponent: string;
  actions: number;
  overall: ActionStats;
  byType: TypeStats;
}

export type FormVerdict = 'boven' | 'gelijk' | 'onder';

export interface FormComparison {
  type: ActionType;
  /** Wat we meten: rendement bij aanval en service, positief bij pass en verdediging. */
  metric: 'efficiency' | 'positive';
  now: number;
  season: number;
  actionsNow: number;
  actionsSeason: number;
  verdict: FormVerdict;
}

export interface PlayerProfile {
  playerId: string;
  number: number;
  name: string;
  role: PlayerRole | null;
  matchesPlayed: number;
  season: { overall: ActionStats; byType: TypeStats };
  /** Nieuwste wedstrijd eerst. */
  matches: PlayerMatchRow[];
  /** Vergelijking van de meest recente wedstrijd met het seizoen ervoor. */
  form: FormComparison[];
}

/** Types waarvoor een vergelijking iets zegt; bij een toets is het aantal te klein. */
const FORM_TYPES: readonly ActionType[] = ['attack', 'serve', 'reception'] as const;

export function buildPlayerProfile(
  bundles: readonly MatchBundle[],
  player: Pick<Player, 'id' | 'number' | 'name' | 'role'>,
): PlayerProfile {
  const matches: PlayerMatchRow[] = [];

  for (const bundle of bundles) {
    const rows = filterActions(toActionRows(bundle), { playerId: player.id });
    if (rows.length === 0) continue;
    matches.push({
      matchId: bundle.match.id,
      date: bundle.match.date,
      opponent: bundle.opponent?.name ?? 'onbekend',
      actions: rows.length,
      overall: summarize(rows),
      byType: statsByType(rows),
    });
  }

  matches.sort((a, b) => b.date.localeCompare(a.date));

  const allRows = bundles.flatMap((bundle) =>
    filterActions(toActionRows(bundle), { playerId: player.id }),
  );

  const latest = matches[0];
  const history = matches.slice(1);

  return {
    playerId: player.id,
    number: player.number,
    name: player.name,
    role: player.role ?? null,
    matchesPlayed: matches.length,
    season: { overall: summarize(allRows), byType: statsByType(allRows) },
    matches,
    form: latest ? compareForm(latest.byType, mergeTypes(history.map((row) => row.byType))) : [],
  };
}

/**
 * Vorm van vandaag tegenover het niveau ervoor.
 *
 * Er wordt alleen iets gezegd als er genoeg van gezien is — vandaag én in de
 * historie. Twee aanvallen die misgaan zijn geen vormdip.
 */
export function compareForm(now: TypeStats, season: TypeStats): FormComparison[] {
  const comparisons: FormComparison[] = [];

  for (const type of FORM_TYPES) {
    const current = now[type];
    const before = season[type];
    if (current.total < MIN_FORM_ACTIONS || before.total < MIN_HISTORY_ACTIONS) continue;

    const metric = type === 'reception' ? 'positive' : 'efficiency';
    const valueNow = metric === 'positive' ? current.positivePct : (current.efficiency ?? 0);
    const valueSeason = metric === 'positive' ? before.positivePct : (before.efficiency ?? 0);
    const delta = valueNow - valueSeason;

    comparisons.push({
      type,
      metric,
      now: valueNow,
      season: valueSeason,
      actionsNow: current.total,
      actionsSeason: before.total,
      // Een vijfde afwijking is genoeg om op te vallen, en klein genoeg om niet
      // op ruis te reageren.
      verdict: delta <= -0.2 ? 'onder' : delta >= 0.2 ? 'boven' : 'gelijk',
    });
  }

  return comparisons;
}

/** Telt de cijfers van meerdere wedstrijden bij elkaar op. */
function mergeTypes(list: readonly TypeStats[]): TypeStats {
  const merged = {} as TypeStats;
  const types = Object.keys(list[0] ?? {}) as ActionType[];
  const allTypes: ActionType[] = types.length > 0 ? types : ['serve', 'reception', 'set', 'attack', 'block', 'dig'];

  for (const type of allTypes) {
    const counts = { perfect: 0, good: 0, poor: 0, error: 0 };
    let total = 0;
    for (const stats of list) {
      const entry = stats[type];
      if (!entry) continue;
      counts.perfect += entry.counts.perfect;
      counts.good += entry.counts.good;
      counts.poor += entry.counts.poor;
      counts.error += entry.counts.error;
      total += entry.total;
    }

    const scoring = type === 'serve' || type === 'attack' || type === 'block';
    merged[type] = {
      total,
      counts,
      positivePct: total > 0 ? (counts.perfect + counts.good) / total : 0,
      errorPct: total > 0 ? counts.error / total : 0,
      pointPct: scoring ? (total > 0 ? counts.perfect / total : 0) : null,
      efficiency: scoring && total > 0 ? (counts.perfect - counts.error) / total : null,
      averageScore:
        total > 0 ? (counts.perfect * 3 + counts.good * 2 + counts.poor) / total : 0,
    };
  }

  return merged;
}
