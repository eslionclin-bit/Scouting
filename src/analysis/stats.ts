/**
 * Cijfers voor het analysedashboard.
 *
 * Alles hier is een telling of een deling daarvan — geen schattingen, geen
 * gewogen scores die niemand kan navertellen. Een coach moet elk getal kunnen
 * terugvinden in de rally's waar het uit komt.
 */

import { QUALITY_SCORE } from '../domain/protocol';
import type { ActionType, Player, Quality, TeamSide, Zone } from '../domain/types';
import { ACTION_TYPES, QUALITIES, ZONES } from '../domain/types';
import { emptyZoneTally } from '../domain/zones';
import type { ActionRow, RallyRow } from './rows';

export interface ActionStats {
  total: number;
  counts: Record<Quality, number>;
  /** Aandeel perfect + goed: de bal bleef bruikbaar. */
  positivePct: number;
  errorPct: number;
  /**
   * Aandeel direct punt. Alleen zinvol bij opslag, aanval en block — een
   * perfecte receptie levert geen punt op, alleen een goede uitgangspositie.
   */
  pointPct: number | null;
  /** (perfect − fout) / totaal, het gebruikelijke rendement in volleybal. */
  efficiency: number | null;
  /** Gemiddelde op de vierpuntsschaal, 0 (fout) tot 3 (perfect). */
  averageScore: number;
}

/** Actietypes waarbij 'perfect' een direct punt betekent. */
const SCORING_TYPES: readonly ActionType[] = ['serve', 'attack', 'block'];

export function summarize(rows: readonly ActionRow[], type?: ActionType): ActionStats {
  const counts: Record<Quality, number> = { perfect: 0, good: 0, poor: 0, error: 0 };
  let score = 0;

  for (const row of rows) {
    counts[row.action.quality]++;
    score += QUALITY_SCORE[row.action.quality];
  }

  const total = rows.length;
  const scoring = type ? SCORING_TYPES.includes(type) : null;

  return {
    total,
    counts,
    positivePct: ratio(counts.perfect + counts.good, total),
    errorPct: ratio(counts.error, total),
    pointPct: scoring ? ratio(counts.perfect, total) : null,
    efficiency: scoring && total > 0 ? (counts.perfect - counts.error) / total : null,
    averageScore: total > 0 ? score / total : 0,
  };
}

export type TypeStats = Record<ActionType, ActionStats>;

export function statsByType(rows: readonly ActionRow[]): TypeStats {
  const result = {} as TypeStats;
  for (const type of ACTION_TYPES) {
    result[type] = summarize(
      rows.filter((row) => row.action.type === type),
      type,
    );
  }
  return result;
}

export interface PlayerStats {
  playerId: string;
  number: number | null;
  name: string;
  overall: ActionStats;
  byType: TypeStats;
}

/**
 * Per speler, gesorteerd op rugnummer. Spelers zonder acties blijven staan met
 * een nulregel: een lege regel is ook informatie ("deze speler kwam niet in
 * beeld"), en het voorkomt dat de lijst per set van vorm verandert.
 */
export function statsByPlayer(
  rows: readonly ActionRow[],
  players: readonly Player[],
): PlayerStats[] {
  return players
    .map((player) => {
      const playerRows = rows.filter((row) => row.action.playerId === player.id);
      return {
        playerId: player.id,
        number: player.number,
        name: player.name,
        overall: summarize(playerRows),
        byType: statsByType(playerRows),
      };
    })
    .sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
}

export interface ZoneTally {
  counts: Record<Zone, number>;
  percentages: Record<Zone, number>;
  total: number;
  /** Hoogste telling; de heatmap schaalt hierop. */
  max: number;
}

/**
 * Verdeling over de zones, voor de heatmap. `use: 'from'` beantwoordt "van
 * waaruit wordt aangevallen of geserveerd", `'to'` waar de bal landt.
 */
export function zoneTally(rows: readonly ActionRow[], use: 'from' | 'to' = 'from'): ZoneTally {
  const counts = emptyZoneTally();
  let total = 0;

  for (const row of rows) {
    const zone = use === 'from' ? row.action.zoneFrom : row.action.zoneTo;
    if (zone == null) continue;
    counts[zone]++;
    total++;
  }

  const percentages = emptyZoneTally();
  for (const zone of ZONES) percentages[zone] = ratio(counts[zone], total);

  return { counts, percentages, total, max: Math.max(...ZONES.map((zone) => counts[zone])) };
}

export interface RotationStats {
  rotation: number;
  rallies: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Rally's waarin wij serveerden. */
  serveRallies: number;
  /** Punten uit die eigen opslagbeurten. */
  servePoints: number;
  /** Rally's waarin de tegenstander serveerde. */
  receiveRallies: number;
  /** Daarvan gewonnen: het sideout-percentage, de kern van rotatie-analyse. */
  sideoutPct: number | null;
  pointPct: number | null;
}

export function statsByRotation(rows: readonly RallyRow[]): RotationStats[] {
  const byRotation = new Map<number, RallyRow[]>();
  for (const row of rows) {
    if (row.rotation == null || row.rally.wonBy === null) continue;
    const list = byRotation.get(row.rotation);
    if (list) list.push(row);
    else byRotation.set(row.rotation, [row]);
  }

  return [...byRotation.entries()]
    .map(([rotation, rallies]) => {
      const serve = rallies.filter((row) => row.rally.servingTeam === 'us');
      const receive = rallies.filter((row) => row.rally.servingTeam === 'them');
      const pointsFor = rallies.filter((row) => row.rally.wonBy === 'us').length;

      return {
        rotation,
        rallies: rallies.length,
        pointsFor,
        pointsAgainst: rallies.length - pointsFor,
        serveRallies: serve.length,
        servePoints: serve.filter((row) => row.rally.wonBy === 'us').length,
        receiveRallies: receive.length,
        sideoutPct:
          receive.length > 0
            ? receive.filter((row) => row.rally.wonBy === 'us').length / receive.length
            : null,
        pointPct: rallies.length > 0 ? pointsFor / rallies.length : null,
      };
    })
    .sort((a, b) => a.rotation - b.rotation);
}

export interface TeamTotals {
  team: TeamSide;
  actions: number;
  points: number;
  errors: number;
  byType: TypeStats;
}

export function teamTotals(rows: readonly ActionRow[], team: TeamSide): TeamTotals {
  const teamRows = rows.filter((row) => row.action.team === team);
  const byType = statsByType(teamRows);
  const points = SCORING_TYPES.reduce((sum, type) => sum + byType[type].counts.perfect, 0);
  const errors = QUALITIES.includes('error')
    ? teamRows.filter((row) => row.action.quality === 'error').length
    : 0;

  return { team, actions: teamRows.length, points, errors, byType };
}

function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0;
}
