/**
 * Wat er binnen een rally gebeurt — de ketens.
 *
 * De cijfers in `stats.ts` tellen losse acties. Hier gaat het om het verband
 * ertussen: wat levert een goede pass op, is een aanval de eerste bal of een
 * transitiebal, en wie krijgt de bal in welke rotatie. Dat zijn de vragen waar
 * een training uit volgt, en ze zijn te beantwoorden met wat er al ligt — er
 * hoeft geen extra tik bij tijdens de wedstrijd.
 */

import type { ActionRow, RallyRow } from './rows';
import { summarize, type ActionStats } from './stats';
import type { MatchBundle } from '../db/bundle';
import type { ErrorReason } from '../domain/errors';
import type { ActionType, AttackTempo, BlockCount, Player, Quality, TeamSide } from '../domain/types';
import { ATTACK_TEMPOS, BLOCK_COUNTS, QUALITIES } from '../domain/types';
import { toActionRows, toRallyRows } from './rows';

/** Onder dit aantal passes van één soort zeggen we er niets over. */
export const MIN_PASSES = 8;

export interface PassOutcome {
  quality: Quality;
  receptions: number;
  sideouts: number;
  /** Aandeel gewonnen rally's na een pass van deze kwaliteit. */
  sideoutPct: number | null;
}

export interface SideoutByPass {
  rows: PassOutcome[];
  /** Alle ontvangen rally's met een pass erin. */
  total: number;
  sideoutPct: number | null;
  /**
   * Het verschil tussen een perfecte en een matige pass, in procentpunten.
   * Alleen ingevuld als beide genoeg voorkomen — dit is het getal waarmee je
   * uitlegt wat passen waard is.
   */
  gain: number | null;
}

/**
 * Wat een pass oplevert.
 *
 * Per rally telt de eerste pass van deze ploeg: die bepaalt waar de aanval mee
 * moet werken. Rally's zonder ingevoerde pass blijven buiten beschouwing —
 * meetellen zou de noemer opblazen met ballen waar we niets van weten.
 */
export function sideoutByPass(
  bundles: readonly MatchBundle[],
  options: { side?: TeamSide; setId?: string } = {},
): SideoutByPass {
  const side: TeamSide = options.side ?? 'us';
  const other: TeamSide = side === 'us' ? 'them' : 'us';

  const perRally = new Map<string, ActionRow[]>();
  for (const row of bundles.flatMap((bundle) => toActionRows(bundle))) {
    if (options.setId && row.setId !== options.setId) continue;
    const list = perRally.get(row.action.rallyId) ?? [];
    list.push(row);
    perRally.set(row.action.rallyId, list);
  }

  const counts = new Map<Quality, { receptions: number; sideouts: number }>();
  let total = 0;
  let sideouts = 0;

  const rallies = bundles.flatMap((bundle) => toRallyRows(bundle));
  for (const rally of rallies) {
    if (options.setId && rally.setId !== options.setId) continue;
    if (rally.rally.wonBy === null || rally.rally.servingTeam !== other) continue;

    const pass = (perRally.get(rally.rally.id) ?? [])
      .filter((row) => row.action.team === side && row.action.type === 'reception')
      .sort((a, b) => a.action.sequence - b.action.sequence)[0];
    if (!pass) continue;

    const entry = counts.get(pass.action.quality) ?? { receptions: 0, sideouts: 0 };
    entry.receptions++;
    total++;
    if (rally.rally.wonBy === side) {
      entry.sideouts++;
      sideouts++;
    }
    counts.set(pass.action.quality, entry);
  }

  const rows: PassOutcome[] = QUALITIES.map((quality) => {
    const entry = counts.get(quality) ?? { receptions: 0, sideouts: 0 };
    return {
      quality,
      receptions: entry.receptions,
      sideouts: entry.sideouts,
      sideoutPct: entry.receptions > 0 ? entry.sideouts / entry.receptions : null,
    };
  });

  const best = rows.find((row) => row.quality === 'perfect');
  const weak = rows.find((row) => row.quality === 'poor');
  const gain =
    best && weak && best.receptions >= MIN_PASSES && weak.receptions >= MIN_PASSES
      ? (best.sideoutPct ?? 0) - (weak.sideoutPct ?? 0)
      : null;

  return { rows, total, sideoutPct: total > 0 ? sideouts / total : null, gain };
}

/**
 * Eerste bal of transitie.
 *
 * Een aanval na onze eigen pass is een andere aanval dan een aanval halverwege
 * een lange rally: de eerste heeft een opgezette aanval, de tweede is
 * improviseren. Alle scoutprogramma's houden ze uit elkaar, en terecht — een
 * ploeg kan op de eerste bal prima draaien en in transitie alles weggeven.
 */
export type AttackPhase = 'reception' | 'transition';

export interface PhaseStats {
  phase: AttackPhase;
  stats: ActionStats;
}

export function attackByPhase(
  rows: readonly ActionRow[],
  side: TeamSide = 'us',
): PhaseStats[] {
  const perRally = new Map<string, ActionRow[]>();
  for (const row of rows) {
    const list = perRally.get(row.action.rallyId) ?? [];
    list.push(row);
    perRally.set(row.action.rallyId, list);
  }

  const buckets: Record<AttackPhase, ActionRow[]> = { reception: [], transition: [] };

  for (const list of perRally.values()) {
    const ordered = [...list].sort((a, b) => a.action.sequence - b.action.sequence);
    let seenAttack = false;
    let seenReception = false;

    for (const row of ordered) {
      if (row.action.team !== side) continue;
      if (row.action.type === 'reception') {
        seenReception = true;
        continue;
      }
      if (row.action.type !== 'attack') continue;

      buckets[seenReception && !seenAttack ? 'reception' : 'transition'].push(row);
      seenAttack = true;
    }
  }

  return [
    { phase: 'reception', stats: summarize(buckets.reception, 'attack') },
    { phase: 'transition', stats: summarize(buckets.transition, 'attack') },
  ];
}

export interface AttackerShare {
  playerId: string | null;
  number: number | null;
  name: string;
  attacks: number;
  /** Aandeel van alle aanvallen in deze rotatie. */
  share: number;
  stats: ActionStats;
}

export interface RotationDistribution {
  rotation: number;
  attacks: number;
  attackers: AttackerShare[];
}

/**
 * Wie krijgt de bal, per rotatie.
 *
 * Dit is de setterverdeling zoals een coach hem leest: niet 'wie zette op' maar
 * 'wie mocht slaan, en wat kwam eruit'. Rotaties waarin één speler alles krijgt
 * zijn te verdedigen — zolang het rendement er is.
 */
export function attackDistribution(
  rows: readonly ActionRow[],
  players: readonly Player[],
  side: TeamSide = 'us',
): RotationDistribution[] {
  const byId = new Map(players.map((player) => [player.id, player]));
  const perRotation = new Map<number, Map<string, ActionRow[]>>();

  for (const row of rows) {
    if (row.action.team !== side || row.action.type !== 'attack') continue;
    if (row.rotation === null) continue;

    const key = row.action.playerId ?? 'onbekend';
    const rotation = perRotation.get(row.rotation) ?? new Map<string, ActionRow[]>();
    rotation.set(key, [...(rotation.get(key) ?? []), row]);
    perRotation.set(row.rotation, rotation);
  }

  return [...perRotation.entries()]
    .map(([rotation, perPlayer]) => {
      const attacks = [...perPlayer.values()].reduce((sum, list) => sum + list.length, 0);
      const attackers = [...perPlayer.entries()]
        .map(([key, list]) => {
          const player = key === 'onbekend' ? undefined : byId.get(key);
          return {
            playerId: player?.id ?? null,
            number: player?.number ?? list[0]?.action.playerNumber ?? null,
            name: player?.name ?? '',
            attacks: list.length,
            share: attacks > 0 ? list.length / attacks : 0,
            stats: summarize(list, 'attack'),
          };
        })
        .sort((a, b) => b.attacks - a.attacks);

      return { rotation, attacks, attackers };
    })
    .sort((a, b) => a.rotation - b.rotation);
}

export interface TempoStats {
  tempo: AttackTempo;
  stats: ActionStats;
  /** Aandeel van alle aanvallen waarvan het tempo bekend is. */
  share: number;
}

/**
 * Aanvallen per tempo.
 *
 * Aanvallen zonder ingevuld tempo blijven eruit — meetellen zou het aandeel van
 * de rest verwateren. Het aantal daarvan staat apart, zodat je ziet hoeveel van
 * de wedstrijd dit beslaat.
 */
export function attackByTempo(
  rows: readonly ActionRow[],
  side: TeamSide = 'us',
): { rows: TempoStats[]; known: number; unknown: number } {
  const attacks = rows.filter((row) => row.action.team === side && row.action.type === 'attack');
  const known = attacks.filter((row) => row.action.tempo != null);

  return {
    rows: ATTACK_TEMPOS.map((tempo) => {
      const list = known.filter((row) => row.action.tempo === tempo);
      return {
        tempo,
        stats: summarize(list, 'attack'),
        share: known.length > 0 ? list.length / known.length : 0,
      };
    }),
    known: known.length,
    unknown: attacks.length - known.length,
  };
}

export interface BlockStats {
  blockers: BlockCount;
  stats: ActionStats;
  share: number;
}

/**
 * Aanvallen tegenover het aantal blokkeerders.
 *
 * Dit is het cijfer dat een laag aanvalsrendement verklaart: tegen een enkel
 * blok hoort een aanval veel beter te scoren dan tegen een dubbel. Scoort een
 * ploeg tegen één blokkeerder net zo slecht, dan ligt het niet aan het blok.
 */
export function attackByBlock(
  rows: readonly ActionRow[],
  side: TeamSide = 'us',
): { rows: BlockStats[]; known: number; unknown: number } {
  const attacks = rows.filter((row) => row.action.team === side && row.action.type === 'attack');
  const known = attacks.filter((row) => row.action.blockers != null);

  return {
    rows: BLOCK_COUNTS.map((blockers) => {
      const list = known.filter((row) => row.action.blockers === blockers);
      return {
        blockers,
        stats: summarize(list, 'attack'),
        share: known.length > 0 ? list.length / known.length : 0,
      };
    }),
    known: known.length,
    unknown: attacks.length - known.length,
  };
}

export interface ReasonCount {
  reason: ErrorReason;
  count: number;
  share: number;
}

export interface ErrorBreakdown {
  type: ActionType;
  errors: number;
  /** Fouten waarbij een reden is ingevuld. */
  known: number;
  reasons: ReasonCount[];
}

/**
 * Waar de fouten heen gaan, per actietype.
 *
 * Twaalf servicefouten is een telling; negen daarvan in het net is een
 * trainingsopdracht. Fouten zonder ingevulde reden tellen niet mee in de
 * verdeling, maar het aantal staat er wel bij — anders zou 'drie in het net' er
 * uitzien als het hele verhaal terwijl er twintig fouten waren.
 */
export function errorsByReason(
  rows: readonly ActionRow[],
  side: TeamSide = 'us',
): ErrorBreakdown[] {
  const perType = new Map<ActionType, ActionRow[]>();
  for (const row of rows) {
    if (row.action.team !== side || row.action.quality !== 'error') continue;
    perType.set(row.action.type, [...(perType.get(row.action.type) ?? []), row]);
  }

  return [...perType.entries()]
    .map(([type, list]) => {
      const known = list.filter((row) => row.action.errorReason != null);
      const counts = new Map<ErrorReason, number>();
      for (const row of known) {
        const reason = row.action.errorReason!;
        counts.set(reason, (counts.get(reason) ?? 0) + 1);
      }

      return {
        type,
        errors: list.length,
        known: known.length,
        reasons: [...counts.entries()]
          .map(([reason, count]) => ({
            reason,
            count,
            share: known.length > 0 ? count / known.length : 0,
          }))
          .sort((a, b) => b.count - a.count),
      };
    })
    .sort((a, b) => b.errors - a.errors);
}
