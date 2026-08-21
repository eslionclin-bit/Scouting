/**
 * Opponent-dossier: wat weten we van deze tegenstander, over alle wedstrijden
 * die we tegen ze speelden?
 *
 * De projectbrief is hier expliciet over: de bevindingen zijn "puur afgeleid uit
 * tellingen, geen giswerk". Dat betekent hier drie dingen:
 *   - elke bevinding noemt het aantal waarnemingen waarop hij berust;
 *   - onder een minimum aantal zeggen we niets, hoe verleidelijk het patroon ook
 *     oogt — drie aanvallen uit zone 4 is geen voorkeur;
 *   - het advies verwijst terug naar de bevinding, en voegt zelf niets toe.
 */

import type { MatchBundle } from '../db/bundle';
import type { Player } from '../domain/types';
import { ZONE_LABELS } from '../domain/zones';
import { filterActions, toActionRows } from './rows';
import { statsByPlayer, statsByType, zoneTally, type PlayerStats, type TypeStats, type ZoneTally } from './stats';

/** Minimum aantal waarnemingen voordat we een patroon durven te noemen. */
export const MIN_SAMPLE = 12;
const MIN_PLAYER_SAMPLE = 8;

export interface MatchResult {
  matchId: string;
  date: string;
  homeAway: 'home' | 'away';
  setsUs: number;
  setsThem: number;
  wonByUs: boolean | null;
}

export interface DossierFinding {
  code: string;
  text: string;
  /** Aantal waarnemingen waarop deze bevinding berust. */
  sample: number;
  /** Hoe sterk het patroon afwijkt; bepaalt de volgorde. */
  strength: number;
}

export interface DossierAdvice {
  text: string;
  because: string;
}

export interface OpponentDossier {
  opponentId: string;
  opponentName: string;
  matches: MatchResult[];
  wins: number;
  losses: number;
  setsWon: number;
  setsLost: number;
  totalActions: number;
  byType: TypeStats;
  attackZones: ZoneTally;
  serveZones: ZoneTally;
  players: PlayerStats[];
  findings: DossierFinding[];
  advice: DossierAdvice[];
}

export function buildOpponentDossier(
  bundles: readonly MatchBundle[],
  opponentTeamId: string,
  opponentName: string,
): OpponentDossier {
  const relevant = bundles.filter((bundle) => bundle.match.opponentTeamId === opponentTeamId);

  const matches = relevant.map(toMatchResult).sort((a, b) => b.date.localeCompare(a.date));
  const rows = relevant.flatMap((bundle) => filterActions(toActionRows(bundle), { team: 'them' }));

  const opponentPlayers: Player[] = [];
  const seen = new Set<string>();
  for (const bundle of relevant) {
    for (const player of bundle.players) {
      if (player.teamId !== opponentTeamId || seen.has(player.id)) continue;
      seen.add(player.id);
      opponentPlayers.push(player);
    }
  }

  const byType = statsByType(rows);
  const attackZones = zoneTally(filterActions(rows, { type: 'attack' }));
  const serveZones = zoneTally(filterActions(rows, { type: 'serve' }));
  const players = statsByPlayer(rows, opponentPlayers);
  const findings = collectFindings({ byType, attackZones, serveZones, players });

  return {
    opponentId: opponentTeamId,
    opponentName,
    matches,
    wins: matches.filter((match) => match.wonByUs === true).length,
    losses: matches.filter((match) => match.wonByUs === false).length,
    setsWon: matches.reduce((sum, match) => sum + match.setsUs, 0),
    setsLost: matches.reduce((sum, match) => sum + match.setsThem, 0),
    totalActions: rows.length,
    byType,
    attackZones,
    serveZones,
    players,
    findings,
    advice: adviceFor(findings),
  };
}

function toMatchResult(bundle: MatchBundle): MatchResult {
  let setsUs = 0;
  let setsThem = 0;
  for (const set of bundle.sets) {
    if (set.set.pointsUs > set.set.pointsThem) setsUs++;
    else if (set.set.pointsThem > set.set.pointsUs) setsThem++;
  }
  return {
    matchId: bundle.match.id,
    date: bundle.match.date,
    homeAway: bundle.match.homeAway,
    setsUs,
    setsThem,
    // Zonder gespeelde sets valt er niets te zeggen over de uitslag.
    wonByUs: setsUs === setsThem ? null : setsUs > setsThem,
  };
}

interface FindingInput {
  byType: TypeStats;
  attackZones: ZoneTally;
  serveZones: ZoneTally;
  players: PlayerStats[];
}

function collectFindings({ byType, attackZones, serveZones, players }: FindingInput): DossierFinding[] {
  const findings: DossierFinding[] = [];

  const attackZone = dominantZone(attackZones);
  if (attackZones.total >= MIN_SAMPLE && attackZone && attackZone.share >= 0.4) {
    findings.push({
      code: 'attack_zone_concentration',
      text: `${percent(attackZone.share)} van de aanvallen komen uit ${ZONE_LABELS[attackZone.zone].toLowerCase()}.`,
      sample: attackZones.total,
      strength: attackZone.share,
    });
  }

  const serveZone = dominantZone(serveZones);
  if (serveZones.total >= MIN_SAMPLE && serveZone && serveZone.share >= 0.5) {
    findings.push({
      code: 'serve_zone_concentration',
      text: `Er wordt bijna altijd vanaf dezelfde plek geserveerd: ${percent(serveZone.share)} vanuit ${ZONE_LABELS[serveZone.zone].toLowerCase()}.`,
      sample: serveZones.total,
      strength: serveZone.share,
    });
  }

  const reception = byType.reception;
  const shaky = reception.counts.poor + reception.counts.error;
  if (reception.total >= MIN_SAMPLE && shaky / reception.total >= 0.35) {
    findings.push({
      code: 'reception_weak',
      text: `${percent(shaky / reception.total)} van de recepties is matig of fout.`,
      sample: reception.total,
      strength: shaky / reception.total,
    });
  }

  if (byType.serve.total >= MIN_SAMPLE && byType.serve.errorPct >= 0.15) {
    findings.push({
      code: 'serve_errors',
      text: `${percent(byType.serve.errorPct)} van de opslagen gaat fout.`,
      sample: byType.serve.total,
      strength: byType.serve.errorPct,
    });
  }

  if (byType.attack.total >= MIN_SAMPLE && byType.attack.errorPct >= 0.2) {
    findings.push({
      code: 'attack_errors',
      text: `${percent(byType.attack.errorPct)} van de aanvallen eindigt in een fout.`,
      sample: byType.attack.total,
      strength: byType.attack.errorPct,
    });
  }

  if (byType.attack.total >= MIN_SAMPLE && (byType.attack.pointPct ?? 0) >= 0.45) {
    findings.push({
      code: 'attack_strong',
      text: `De aanval is scherp: ${percent(byType.attack.pointPct ?? 0)} levert direct een punt op.`,
      sample: byType.attack.total,
      strength: byType.attack.pointPct ?? 0,
    });
  }

  for (const player of players) {
    const attack = player.byType.attack;
    if (attack.total < MIN_PLAYER_SAMPLE) continue;

    if ((attack.pointPct ?? 0) >= 0.4) {
      findings.push({
        code: 'player_dangerous',
        text: `#${player.number} ${player.name} scoort met ${percent(attack.pointPct ?? 0)} van zijn aanvallen.`,
        sample: attack.total,
        strength: attack.pointPct ?? 0,
      });
    }
    if (attack.errorPct >= 0.3) {
      findings.push({
        code: 'player_error_prone',
        text: `#${player.number} ${player.name} slaat ${percent(attack.errorPct)} van zijn aanvallen fout.`,
        sample: attack.total,
        strength: attack.errorPct,
      });
    }
  }

  return findings.sort((a, b) => b.strength - a.strength);
}

/**
 * Advies is een vertaling van een bevinding naar een handeling, en nooit meer
 * dan dat. Staat er geen bevinding tegenover, dan staat er ook geen advies.
 */
function adviceFor(findings: readonly DossierFinding[]): DossierAdvice[] {
  const advice: DossierAdvice[] = [];

  for (const finding of findings) {
    switch (finding.code) {
      case 'attack_zone_concentration':
        advice.push({
          text: 'Zet het blok vroeg naar die kant en laat de verdediging daarachter aansluiten.',
          because: finding.text,
        });
        break;
      case 'reception_weak':
        advice.push({
          text: 'Druk zetten met de opslag loont: hun opbouw komt vaak niet uit.',
          because: finding.text,
        });
        break;
      case 'serve_errors':
        advice.push({
          text: 'Laat twijfelballen bij hun opslag gaan — een deel valt vanzelf uit.',
          because: finding.text,
        });
        break;
      case 'attack_errors':
        advice.push({
          text: 'Blijf lang verdedigen; ze forceren en slaan er geregeld uit.',
          because: finding.text,
        });
        break;
      case 'attack_strong':
        advice.push({
          text: 'Reken op een dubbel blok en zet de verdediging dieper.',
          because: finding.text,
        });
        break;
      case 'serve_zone_concentration':
        advice.push({
          text: 'De ontvangst kan alvast naar die hoek schuiven.',
          because: finding.text,
        });
        break;
      case 'player_dangerous':
        advice.push({ text: 'Volg deze speler met het blok.', because: finding.text });
        break;
      case 'player_error_prone':
        advice.push({ text: 'Laat deze aanvaller slaan; het risico ligt bij hem.', because: finding.text });
        break;
      default:
        break;
    }
  }

  return advice;
}

function dominantZone(tally: ZoneTally): { zone: 1 | 2 | 3 | 4 | 5 | 6; share: number } | null {
  if (tally.total === 0) return null;
  const zones = [1, 2, 3, 4, 5, 6] as const;
  const best = zones.reduce((top, zone) =>
    tally.counts[zone] > tally.counts[top] ? zone : top,
  );
  return { zone: best, share: tally.percentages[best] };
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}
