/**
 * Van DataVolley-codes naar onze begrippen.
 *
 * Dit is de plek waar een keuze wordt gemaakt die je moet kunnen navertellen:
 * DataVolley kent per vaardigheid zes waarderingen (`#` `+` `!` `-` `/` `=`) en
 * wij vier (perfect, goed, matig, fout). Die vertaling staat hieronder als
 * tabel, met per regel waarom hij daar staat. Zonder die tabel zou een
 * ingelezen wedstrijd cijfers opleveren die er precies uitzien en het niet zijn.
 */

import type { ActionType, AttackTempo, BlockCount, Quality, TeamSide, Zone } from '../../domain/types';
import type { DvwFile, DvwRole, DvwRow } from './parse';

export interface ImportedAction {
  team: TeamSide;
  playerNumber: number | null;
  type: ActionType;
  quality: Quality;
  zoneFrom: Zone | null;
  zoneTo: Zone | null;
  tempo: AttackTempo | null;
  blockers: BlockCount | null;
  /** De oorspronkelijke code, zodat een cijfer terug te zoeken is. */
  code: string;
}

export interface ImportedRally {
  setNumber: number;
  servingTeam: TeamSide | null;
  wonBy: TeamSide;
  /** Positie van onze spelverdeler (1-6): zo nummert DataVolley de rotatie. */
  rotationUs: number | null;
  pointsUs: number;
  pointsThem: number;
  actions: ImportedAction[];
}

export interface ImportedSet {
  setNumber: number;
  pointsUs: number;
  pointsThem: number;
}

export interface ImportedPlayer {
  number: number;
  name: string;
  role: DvwRole | null;
}

export interface ImportedMatch {
  date: string | null;
  competition: string | null;
  /** In een ingelezen bestand is de thuisploeg 'wij' — er is geen eigen team. */
  homeTeam: string;
  visitingTeam: string;
  homePlayers: ImportedPlayer[];
  visitingPlayers: ImportedPlayer[];
  sets: ImportedSet[];
  rallies: ImportedRally[];
  /** Codes die we bewust hebben laten liggen, met de reden erbij. */
  skipped: { code: string; line: number; reason: string }[];
}

/** DataVolley-vaardigheden naar onze actietypes. */
const SKILLS: Record<string, ActionType> = {
  S: 'serve',
  R: 'reception',
  E: 'set',
  A: 'attack',
  B: 'block',
  D: 'dig',
  // Een vrije bal terugspelen is bij ons geen apart type; het dichtstbijzijnde
  // is verdediging, want dat is wat het in het spel doet.
  F: 'dig',
};

/**
 * De waarderingstabel.
 *
 * DataVolley zet de codes per vaardigheid op een schaal van goed naar slecht:
 * `#` `/` `+` `!` `-` `=` bij de service, `#` `+` `!` `-` `/` `=` bij de pass.
 * Wij vouwen die zes op vier: de bovenste twee worden perfect en goed, de
 * middelste twee matig, en alles wat de bal weggeeft fout.
 */
const QUALITIES: Record<ActionType, Record<string, Quality>> = {
  // Service: '#' is een ace. '/' (geen aanval mogelijk) en '+' (beperkte
  // aanval) zetten de ontvanger onder druk, dus goed. '!' en '-' geven de
  // tegenstander een vrije aanval.
  serve: { '#': 'perfect', '/': 'good', '+': 'good', '!': 'poor', '-': 'poor', '=': 'error' },
  // Pass: '#' is een perfecte pass, '+' laat de aanval nog kiezen, '!' en '-'
  // beperken die tot een hoge bal, '/' laat helemaal geen aanval toe.
  reception: { '#': 'perfect', '+': 'good', '!': 'poor', '-': 'poor', '/': 'poor', '=': 'error' },
  // Aanval: '/' is geblokt, en dat is een punt tegen — bij ons dus fout, net
  // als een bal buiten.
  attack: { '#': 'perfect', '+': 'good', '!': 'poor', '-': 'poor', '/': 'error', '=': 'error' },
  // Blok: '/' is een netfout of doorgeschoten bal, '=' een fout.
  block: { '#': 'perfect', '+': 'good', '!': 'poor', '-': 'poor', '/': 'error', '=': 'error' },
  // Verdediging: '/' betekent dat de bal direct terugkomt over het net.
  dig: { '#': 'perfect', '+': 'good', '!': 'poor', '-': 'poor', '/': 'poor', '=': 'error' },
  set: { '#': 'perfect', '+': 'good', '!': 'poor', '-': 'poor', '/': 'poor', '=': 'error' },
};

/**
 * DataVolley verdeelt het veld in negen zones: de zes bekende plus 7, 8 en 9
 * voor het diepe achterveld. Die drie vallen bij ons samen met de achterzones
 * die erboven liggen.
 */
const ZONE_MAP: Record<string, Zone> = {
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 5,
  '8': 6,
  '9': 1,
};

/**
 * Tempo van een aanval uit de typecode van DataVolley.
 *
 * Onze vier soorten gaan over tempo, niet over plaats: `H` (hoge bal) is
 * langzaam, en `Q` (snel), `M` (half), `F` (fast), `N` (slide), `T` (gestrekte
 * bal) en `U` (super) zijn allemaal snel — of ze nu in het midden of naar de
 * antenne gaan. `O` is de restcategorie. Een aanval vanaf een achterzone heet
 * bij ons 'achter', ongeacht de code: dat is wat een coach ziet.
 */
const TEMPO_BY_TYPE: Record<string, AttackTempo> = {
  H: 'high',
  Q: 'quick',
  M: 'quick',
  F: 'quick',
  N: 'quick',
  T: 'quick',
  U: 'quick',
  O: 'other',
};

const BACK_ROW_ZONES: readonly Zone[] = [1, 5, 6] as const;

const SKILL_CODE = /^([*a])(\$\$|\d+)([SREABDF])/;
const POINT_CODE = /^([*a])p(\d+):(\d+)/;
const END_OF_SET = /^\*\*(\d+)set/i;

export function interpretDvw(file: DvwFile): ImportedMatch {
  const rallies: ImportedRally[] = [];
  const sets = new Map<number, ImportedSet>();
  const skipped: ImportedMatch['skipped'] = [];

  let pending: ImportedAction[] = [];
  let setNumber = 1;
  let rotationUs: number | null = null;

  for (const row of file.rows) {
    if (row.setNumber !== null) setNumber = row.setNumber;
    if (row.homeSetterPosition !== null) rotationUs = row.homeSetterPosition;

    if (END_OF_SET.test(row.code)) {
      pending = [];
      continue;
    }

    const point = POINT_CODE.exec(row.code);
    if (point) {
      const pointsUs = Number(point[2]);
      const pointsThem = Number(point[3]);
      rallies.push({
        setNumber,
        servingTeam: servingTeamOf(pending, rallies),
        wonBy: point[1] === '*' ? 'us' : 'them',
        rotationUs,
        pointsUs,
        pointsThem,
        actions: pending,
      });
      // De stand op de laatste rally van een set is de setstand.
      sets.set(setNumber, { setNumber, pointsUs, pointsThem });
      pending = [];
      continue;
    }

    const action = actionFrom(row);
    if (action) {
      pending.push(action);
      continue;
    }

    const reason = reasonFor(row.code);
    if (reason) skipped.push({ code: row.code, line: row.line, reason });
  }

  return {
    date: file.info.date,
    competition: file.info.competition ?? file.info.season,
    homeTeam: file.home.name,
    visitingTeam: file.visiting.name,
    homePlayers: file.homePlayers.map(toPlayer),
    visitingPlayers: file.visitingPlayers.map(toPlayer),
    sets: [...sets.values()].sort((a, b) => a.setNumber - b.setNumber),
    rallies,
    skipped,
  };
}

function toPlayer(player: DvwFile['homePlayers'][number]): ImportedPlayer {
  const name = [player.firstName, player.lastName].filter((part) => part.length > 0).join(' ');
  return { number: player.number, name, role: player.role };
}

/**
 * De code van een balcontact: `*06SM#~~~18C` is thuisploeg, rugnummer 6,
 * Service, Medium, ace, startzone 1, eindzone 8, subzone C.
 */
function actionFrom(row: DvwRow): ImportedAction | null {
  const match = SKILL_CODE.exec(row.code);
  if (!match) return null;

  const team: TeamSide = match[1] === '*' ? 'us' : 'them';
  const playerNumber = match[2] === '$$' ? null : Number(match[2]);
  const type = SKILLS[match[3]!];
  if (!type) return null;

  // Na het team en het rugnummer begint de vaste codestructuur.
  const rest = row.code.slice(match[0].length - 1);
  const evaluation = rest.charAt(2);
  const quality = QUALITIES[type][evaluation];
  if (!quality) return null;

  const zoneFrom = ZONE_MAP[rest.charAt(6)] ?? null;

  return {
    team,
    playerNumber,
    type,
    quality,
    zoneFrom,
    zoneTo: ZONE_MAP[rest.charAt(7)] ?? null,
    tempo: type === 'attack' ? tempoOf(rest.charAt(1), zoneFrom) : null,
    blockers: type === 'attack' ? blockersOf(rest.charAt(10)) : null,
    code: row.code,
  };
}

function tempoOf(typeCode: string, zoneFrom: Zone | null): AttackTempo | null {
  if (zoneFrom !== null && BACK_ROW_ZONES.includes(zoneFrom)) return 'back';
  return TEMPO_BY_TYPE[typeCode] ?? null;
}

/**
 * Het aantal blokkeerders staat als cijfer in de code: 0 tot 3, en 4 voor een
 * blok met een gat erin. Die laatste tellen we als een dubbel blok — er staan
 * twee mensen, alleen niet goed.
 */
function blockersOf(code: string): BlockCount | null {
  switch (code) {
    case '0':
      return 0;
    case '1':
      return 1;
    case '2':
      return 2;
    case '3':
      return 3;
    case '4':
      return 2;
    default:
      return null;
  }
}

/**
 * Wie serveerde deze rally? De service zelf zegt het; ontbreekt die (het gebeurt
 * in bestanden waarin niet alles gescout is), dan is het de winnaar van de
 * vorige rally.
 */
function servingTeamOf(
  actions: readonly ImportedAction[],
  previous: readonly ImportedRally[],
): TeamSide | null {
  const serve = actions.find((action) => action.type === 'serve');
  if (serve) return serve.team;
  return previous.at(-1)?.wonBy ?? null;
}

/**
 * Codes die geen balcontact zijn. Ze worden geteld en gemeld, niet stilzwijgend
 * weggegooid: als een bestand vol staat met dingen die wij niet kennen, hoor je
 * dat te zien voordat je de cijfers gelooft.
 */
function reasonFor(code: string): string | null {
  if (code.length === 0) return null;
  if (/^[*a]z\d/.test(code)) return null; // positie van de spelverdeler
  if (/>LUp/i.test(code)) return null; // opstelling
  if (/^[*a][Pc]\d/.test(code)) return null; // wissel
  if (/^[*a]T/.test(code)) return null; // time-out
  if (/^[*a]\$\$&/.test(code)) return 'punt zonder toegewezen actie';
  if (/^>/.test(code)) return 'sanctie of rotatiefout';
  return 'onbekende code';
}
