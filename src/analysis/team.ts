/**
 * Het eigen team over meerdere wedstrijden.
 *
 * De spiegel van het opponent-dossier: niet 'wat doet de tegenstander' maar
 * 'waar zitten wij structureel vast'. Eén slechte set zegt niets; hetzelfde
 * patroon over vijf wedstrijden wel — en dat is precies wat je op een training
 * kunt aanpakken.
 *
 * Dezelfde eerlijkheidsregels als elders: een bevinding draagt zijn aantal, en
 * onder een minimum zeggen we niets.
 */

import type { MatchBundle } from '../db/bundle';
import { ACTION_TYPE_LABELS } from '../domain/protocol';
import type { Player } from '../domain/types';
import { filterActions, toActionRows, toRallyRows, type RallyRow } from './rows';
import { statsByPlayer, statsByType, type PlayerStats, type TypeStats } from './stats';

/** Minimum aantal waarnemingen voordat een patroon genoemd wordt. */
export const MIN_ROTATION_RALLIES = 10;
export const MIN_TEAM_ACTIONS = 20;
const MIN_PLAYER_ACTIONS = 12;
const MIN_LINEUP_SETS = 2;

export interface RotationProfile {
  rotation: number;
  /** Rally's op de service van de tegenstander. */
  receiveRallies: number;
  sideoutPct: number | null;
  serveRallies: number;
  servePointPct: number | null;
  pointsFor: number;
  pointsAgainst: number;
}

export interface LineupProfile {
  key: string;
  players: { id: string; number: number; name: string }[];
  sets: number;
  pointsFor: number;
  pointsAgainst: number;
  /** Gemiddeld puntverschil per set: het enige getal dat opstellingen vergelijkbaar maakt. */
  diffPerSet: number;
}

export interface TeamFinding {
  code: string;
  text: string;
  sample: number;
  strength: number;
}

export interface TeamAdvice {
  text: string;
  because: string;
}

export interface TeamProfile {
  matches: number;
  wins: number;
  losses: number;
  totalActions: number;
  byType: TypeStats;
  rotations: RotationProfile[];
  lineups: LineupProfile[];
  players: PlayerStats[];
  findings: TeamFinding[];
  advice: TeamAdvice[];
}

export function buildTeamProfile(bundles: readonly MatchBundle[], ownTeamId: string): TeamProfile {
  const relevant = bundles.filter((bundle) => bundle.match.ownTeamId === ownTeamId);
  const rows = relevant.flatMap((bundle) => filterActions(toActionRows(bundle), { team: 'us' }));
  const rallies = relevant.flatMap((bundle) => toRallyRows(bundle));

  const players = new Map<string, Player>();
  for (const bundle of relevant) {
    for (const player of bundle.players) {
      if (player.teamId === ownTeamId) players.set(player.id, player);
    }
  }

  const byType = statsByType(rows);
  const rotations = rotationProfiles(rallies);
  const lineups = lineupProfiles(relevant, players);
  const playerStats = statsByPlayer(rows, [...players.values()]);

  let wins = 0;
  let losses = 0;
  for (const bundle of relevant) {
    const setsUs = bundle.sets.filter((set) => set.set.pointsUs > set.set.pointsThem).length;
    const setsThem = bundle.sets.filter((set) => set.set.pointsThem > set.set.pointsUs).length;
    if (setsUs > setsThem) wins++;
    else if (setsThem > setsUs) losses++;
  }

  const findings = collectFindings({ byType, rotations, lineups, players: playerStats });

  return {
    matches: relevant.length,
    wins,
    losses,
    totalActions: rows.length,
    byType,
    rotations,
    lineups,
    players: playerStats,
    findings,
    advice: adviceFor(findings),
  };
}

function rotationProfiles(rallies: readonly RallyRow[]): RotationProfile[] {
  interface Tally {
    receive: number;
    sideouts: number;
    serve: number;
    servePoints: number;
    for: number;
    against: number;
  }

  const perRotation = new Map<number, Tally>();

  for (const row of rallies) {
    if (row.rotation == null || row.rally.wonBy === null) continue;
    const tally = perRotation.get(row.rotation) ?? {
      receive: 0,
      sideouts: 0,
      serve: 0,
      servePoints: 0,
      for: 0,
      against: 0,
    };

    const wonByUs = row.rally.wonBy === 'us';
    if (wonByUs) tally.for++;
    else tally.against++;

    if (row.rally.servingTeam === 'them') {
      tally.receive++;
      if (wonByUs) tally.sideouts++;
    } else {
      tally.serve++;
      if (wonByUs) tally.servePoints++;
    }

    perRotation.set(row.rotation, tally);
  }

  return [...perRotation.entries()]
    .map(([rotation, tally]) => ({
      rotation,
      receiveRallies: tally.receive,
      sideoutPct: tally.receive > 0 ? tally.sideouts / tally.receive : null,
      serveRallies: tally.serve,
      servePointPct: tally.serve > 0 ? tally.servePoints / tally.serve : null,
      pointsFor: tally.for,
      pointsAgainst: tally.against,
    }))
    .sort((a, b) => a.rotation - b.rotation);
}

/** Sets met dezelfde zes spelers horen bij elkaar, ongeacht wie waar begon. */
function lineupProfiles(
  bundles: readonly MatchBundle[],
  players: ReadonlyMap<string, Player>,
): LineupProfile[] {
  const perLineup = new Map<string, LineupProfile>();

  for (const bundle of bundles) {
    for (const set of bundle.sets) {
      if (!set.lineup) continue;
      const ids = Object.values(set.lineup.positions).filter((id): id is string => id !== null);
      if (ids.length === 0) continue;

      const key = [...ids].sort().join('|');
      const entry =
        perLineup.get(key) ??
        ({
          key,
          players: [...ids]
            .map((id) => players.get(id))
            .filter((player): player is Player => player !== undefined)
            .map((player) => ({ id: player.id, number: player.number, name: player.name }))
            .sort((a, b) => a.number - b.number),
          sets: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          diffPerSet: 0,
        } satisfies LineupProfile);

      entry.sets++;
      entry.pointsFor += set.set.pointsUs;
      entry.pointsAgainst += set.set.pointsThem;
      entry.diffPerSet = (entry.pointsFor - entry.pointsAgainst) / entry.sets;
      perLineup.set(key, entry);
    }
  }

  return [...perLineup.values()].sort((a, b) => b.diffPerSet - a.diffPerSet);
}

interface FindingInput {
  byType: TypeStats;
  rotations: RotationProfile[];
  lineups: LineupProfile[];
  players: PlayerStats[];
}

function collectFindings({ byType, rotations, lineups, players }: FindingInput): TeamFinding[] {
  const findings: TeamFinding[] = [];

  const weakRotation = rotations
    .filter((entry) => entry.receiveRallies >= MIN_ROTATION_RALLIES && (entry.sideoutPct ?? 1) < 0.4)
    .sort((a, b) => (a.sideoutPct ?? 1) - (b.sideoutPct ?? 1))[0];
  if (weakRotation) {
    findings.push({
      code: 'rotation_weak',
      text: `In rotatie R${weakRotation.rotation} sideouten we maar ${percent(weakRotation.sideoutPct ?? 0)}.`,
      sample: weakRotation.receiveRallies,
      strength: 1 - (weakRotation.sideoutPct ?? 0),
    });
  }

  const weakServeRotation = rotations
    .filter((entry) => entry.serveRallies >= MIN_ROTATION_RALLIES && (entry.servePointPct ?? 1) < 0.3)
    .sort((a, b) => (a.servePointPct ?? 1) - (b.servePointPct ?? 1))[0];
  if (weakServeRotation) {
    findings.push({
      code: 'rotation_serve_weak',
      text: `Op eigen service scoren we in R${weakServeRotation.rotation} maar ${percent(weakServeRotation.servePointPct ?? 0)}.`,
      sample: weakServeRotation.serveRallies,
      strength: 1 - (weakServeRotation.servePointPct ?? 0),
    });
  }

  if (byType.serve.total >= MIN_TEAM_ACTIONS && byType.serve.errorPct >= 0.15) {
    findings.push({
      code: 'serve_errors',
      text: `${percent(byType.serve.errorPct)} van onze services gaat fout.`,
      sample: byType.serve.total,
      strength: byType.serve.errorPct,
    });
  }

  const shakyPasses = byType.reception.counts.poor + byType.reception.counts.error;
  if (byType.reception.total >= MIN_TEAM_ACTIONS && shakyPasses / byType.reception.total >= 0.35) {
    findings.push({
      code: 'reception_weak',
      text: `${percent(shakyPasses / byType.reception.total)} van onze passes is matig of fout.`,
      sample: byType.reception.total,
      strength: shakyPasses / byType.reception.total,
    });
  }

  if (byType.attack.total >= MIN_TEAM_ACTIONS && (byType.attack.efficiency ?? 1) <= 0.05) {
    findings.push({
      code: 'attack_flat',
      text: `Onze aanval levert weinig op: ${byType.attack.counts.perfect} punt tegenover ${byType.attack.counts.error} fout.`,
      sample: byType.attack.total,
      strength: 1 - (byType.attack.efficiency ?? 0),
    });
  }

  for (const player of players) {
    for (const type of ['attack', 'serve'] as const) {
      const stats = player.byType[type];
      if (stats.total >= MIN_PLAYER_ACTIONS && stats.errorPct >= 0.25) {
        findings.push({
          code: `player_${type}_errors`,
          text: `#${player.number} ${player.name}: ${percent(stats.errorPct)} van de ${ACTION_TYPE_LABELS[type].toLowerCase()}s gaat fout.`,
          sample: stats.total,
          strength: stats.errorPct,
        });
      }
    }
  }

  // Opstellingen zijn pas te vergelijken als er meer dan één is gespeeld.
  const comparable = lineups.filter((lineup) => lineup.sets >= MIN_LINEUP_SETS);
  if (comparable.length >= 2) {
    const worst = comparable[comparable.length - 1]!;
    const best = comparable[0]!;
    if (worst.diffPerSet < 0 && best.diffPerSet - worst.diffPerSet >= 3) {
      findings.push({
        code: 'lineup_weak',
        text: `Met ${describeLineup(worst)} sta je gemiddeld ${format(worst.diffPerSet)} per set; met ${describeLineup(best)} ${format(best.diffPerSet)}.`,
        sample: worst.sets + best.sets,
        strength: (best.diffPerSet - worst.diffPerSet) / 10,
      });
    }
  }

  return findings.sort((a, b) => b.strength - a.strength);
}

function adviceFor(findings: readonly TeamFinding[]): TeamAdvice[] {
  const advice: TeamAdvice[] = [];

  for (const finding of findings) {
    switch (finding.code) {
      case 'rotation_weak':
        advice.push({
          text: 'Train de ontvangst in deze rotatie apart, of wissel de opstelling zodat je er anders in staat.',
          because: finding.text,
        });
        break;
      case 'rotation_serve_weak':
        advice.push({
          text: 'Zet in deze rotatie een veiligere service in; het risico levert nu niets op.',
          because: finding.text,
        });
        break;
      case 'serve_errors':
        advice.push({
          text: 'Spreek een foutmarge af per set — nu geef je punten weg voordat de rally begint.',
          because: finding.text,
        });
        break;
      case 'reception_weak':
        advice.push({
          text: 'Passtraining loont hier het meest: de opbouw begint te vaak in nood.',
          because: finding.text,
        });
        break;
      case 'attack_flat':
        advice.push({
          text: 'Werk aan variatie in de aanval; hard slaan alleen levert het niet op.',
          because: finding.text,
        });
        break;
      case 'player_attack_errors':
      case 'player_serve_errors':
        advice.push({
          text: 'Bespreek dit met de speler zelf — het is een patroon, geen incident.',
          because: finding.text,
        });
        break;
      case 'lineup_weak':
        advice.push({
          text: 'Overweeg de sterkere opstelling vaker te starten.',
          because: finding.text,
        });
        break;
      default:
        break;
    }
  }

  return advice;
}

function describeLineup(lineup: LineupProfile): string {
  return lineup.players.map((player) => `#${player.number}`).join(' ');
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function format(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}
