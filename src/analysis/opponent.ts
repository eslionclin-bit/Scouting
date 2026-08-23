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
import { MIN_SERVES_PER_TARGET, serveTargets } from './chains';
import { filterActions, toActionRows, type ActionRow } from './rows';
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

/**
 * Eén speelster van de tegenstander, bekeken vanaf de serveerlijn.
 *
 * Dit is het cijfer waar een dossier om begon: niet 'zij zijn sterk in de
 * receptie', maar wie van hen de bal niet schoon aanneemt. Daar serveer je
 * naartoe.
 *
 * Twee bronnen, die elkaar aanvullen. Haar passes zeggen hoe zij het doet; onze
 * services op haar zeggen wat het óns oplevert — en dat tweede is wat telt,
 * want een matige passer achter een ploeg die er toch uitkomt, is geen doelwit.
 */
export interface OpponentPasser {
  number: number;
  name: string;
  receptions: number;
  /** Perfect of goed: de bal is schoon bij de spelverdeler gekomen. */
  positive: number;
  errors: number;
  positivePct: number | null;
  /** Hoe vaak wij bewust op haar serveerden (doelzone ingevuld). */
  servedAt: number;
  /** Daarvan gewonnen rally's. */
  wonAfterServe: number;
  wonPct: number | null;
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
  /** Wie van hen slecht past, slechtste eerst. */
  passers: OpponentPasser[];
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
  const passers = passersOf(relevant, rows, opponentPlayers);
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
    passers,
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

/** Onder dit aantal passes zeggen we niets over een speelster. */
export const MIN_RECEPTIONS_PER_PLAYER = 8;

/**
 * De passers van de tegenstander, slechtste eerst.
 *
 * Alleen speelsters met genoeg ballen komen in de lijst: een oordeel over drie
 * passes is geen oordeel maar een toevalstreffer, en op zo'n cijfer een
 * serveerplan bouwen is erger dan niets weten.
 *
 * Wie er bij een pass aan de bal was, komt uit de invoer — de verfijnbalk vraagt
 * dat na de tik. Waar wij naartoe serveerden komt uit de doelzone, en wie daar
 * stond leidt de app af uit hun opstelling en rotatie. Ontbreekt een van beide,
 * dan blijft die kolom leeg in plaats van geraden.
 */
function passersOf(
  bundles: readonly MatchBundle[],
  rows: readonly ActionRow[],
  players: readonly Player[],
): OpponentPasser[] {
  const byNumber = new Map<number, OpponentPasser>();
  const nameOf = new Map<number, string>();
  for (const player of players) nameOf.set(player.number, player.name);

  const row = (number: number): OpponentPasser => {
    const existing = byNumber.get(number);
    if (existing) return existing;
    const fresh: OpponentPasser = {
      number,
      name: nameOf.get(number) ?? '',
      receptions: 0,
      positive: 0,
      errors: 0,
      positivePct: null,
      servedAt: 0,
      wonAfterServe: 0,
      wonPct: null,
    };
    byNumber.set(number, fresh);
    return fresh;
  };

  for (const entry of rows) {
    const { action } = entry;
    if (action.type !== 'reception' || action.playerNumber === null) continue;
    const passer = row(action.playerNumber);
    passer.receptions++;
    if (action.quality === 'perfect' || action.quality === 'good') passer.positive++;
    if (action.quality === 'error') passer.errors++;
  }

  for (const target of serveTargets(bundles).byPlayer) {
    if (target.number === null) continue;
    const passer = row(target.number);
    passer.servedAt += target.serves;
    passer.wonAfterServe += target.won;
  }

  return [...byNumber.values()]
    .map((passer) => ({
      ...passer,
      positivePct: passer.receptions > 0 ? passer.positive / passer.receptions : null,
      wonPct: passer.servedAt > 0 ? passer.wonAfterServe / passer.servedAt : null,
    }))
    .filter(
      (passer) =>
        passer.receptions >= MIN_RECEPTIONS_PER_PLAYER ||
        passer.servedAt >= MIN_SERVES_PER_TARGET,
    )
    // Slechtste passer bovenaan; wie geen passcijfer heeft, onderaan.
    .sort((a, b) => (a.positivePct ?? 2) - (b.positivePct ?? 2));
}
