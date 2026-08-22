/**
 * Het DataVolley-bestandsformaat (.dvw), zo ver als wij het nodig hebben.
 *
 * Een .dvw is platte tekst in secties (`[3MATCH]`, `[3TEAMS]`, `[3SCOUT]`, …),
 * met puntkomma's als scheidingsteken. De regels in `[3SCOUT]` zijn de wedstrijd
 * zelf: één regel per balcontact, in een code van twaalf tekens plus kolommen
 * met tijd, setnummer, rotatie en wie er in het veld staat.
 *
 * Deze module leest het bestand alleen uit; het vertalen naar onze begrippen
 * gebeurt in `interpret.ts`. Dat scheelt bij het testen: wat er in het bestand
 * staat en wat wij ervan maken zijn twee verschillende vragen.
 *
 * Het formaat is afgeleid uit de openvolley-implementatie (MIT), zie
 * docs/import-datavolley.md.
 */

export interface DvwMatchInfo {
  /** ISO-datum, of null als het bestand geen leesbare datum heeft. */
  date: string | null;
  season: string | null;
  competition: string | null;
  phase: string | null;
}

export interface DvwTeam {
  code: string;
  name: string;
  setsWon: number | null;
}

/** Rolcodes zoals DataVolley ze opslaat. */
export type DvwRole = 'libero' | 'outside' | 'opposite' | 'middle' | 'setter' | 'unknown';

export interface DvwPlayer {
  number: number;
  lastName: string;
  firstName: string;
  role: DvwRole | null;
}

export interface DvwRow {
  /** De code zelf, bijvoorbeeld `*06SM#~~~18C`. */
  code: string;
  setNumber: number | null;
  /** Positie van de spelverdeler (1-6) — DataVolley noemt de rotatie zo. */
  homeSetterPosition: number | null;
  visitingSetterPosition: number | null;
  /** Regelnummer in het bestand, zodat een melding te herleiden is. */
  line: number;
}

/** De eindstand per set zoals het bestand hem zelf noteert. */
export interface DvwDeclaredSet {
  setNumber: number;
  pointsHome: number;
  pointsVisiting: number;
}

export interface DvwFile {
  info: DvwMatchInfo;
  home: DvwTeam;
  visiting: DvwTeam;
  homePlayers: DvwPlayer[];
  visitingPlayers: DvwPlayer[];
  /**
   * Uit `[3SET]`. Handig als controle: wat wij uit de rally's optellen hoort
   * hiermee overeen te komen, anders leest onze parser het bestand verkeerd.
   */
  declaredSets: DvwDeclaredSet[];
  rows: DvwRow[];
}

export class DvwParseError extends Error {}

/**
 * Tekstcodering van een .dvw.
 *
 * Scoutbestanden komen uit heel Europa en zijn zelden UTF-8: een Pools bestand
 * staat in windows-1250, een Duits in windows-1252. Daarom eerst UTF-8 streng
 * proberen, en anders de opgegeven codering. Namen kunnen er verkeerd uitzien
 * als die gok misgaat, en dan is dit de knop om aan te draaien — de cijfers
 * veranderen er niet van.
 */
export function decodeDvw(bytes: ArrayBuffer, fallback = 'windows-1252'): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder(fallback).decode(bytes);
  }
}

/**
 * DataVolley zet naast een naam soms een UTF-8-versie in een extra kolom, als
 * `\u000f` gevolgd door het aantal hex-tekens per teken en dan de codepunten.
 * Die versie is altijd juist, ongeacht de codering van de rest van het bestand.
 */
export function decodeDvText(value: string | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text.startsWith('\u000f')) return null;
  const width = Number(text.charAt(1));
  if (!Number.isFinite(width) || width < 2 || width % 2 !== 0) return null;

  let out = '';
  for (let i = 2; i + width <= text.length; i += width) {
    const point = Number.parseInt(text.slice(i, i + width), 16);
    if (!Number.isFinite(point) || point === 0) return null;
    out += String.fromCodePoint(point);
  }
  return out.replace(/[\u00a0\u2000-\u200b\u202f\u205f\u3000\ufeff]/g, ' ').trim();
}

/**
 * Leest de tekst van een .dvw-bestand.
 *
 * Ontbrekende velden leveren null op in plaats van een fout: scoutbestanden uit
 * verschillende programma's laten van alles weg, en een wedstrijd zonder
 * competitienaam is nog steeds een bruikbare wedstrijd.
 */
export function parseDvw(text: string): DvwFile {
  const lines = text.split(/\r?\n/);
  const sections = splitSections(lines);

  const scout = sections.get('3SCOUT');
  if (!scout) {
    throw new DvwParseError('Geen [3SCOUT]-sectie gevonden: dit lijkt geen DataVolley-bestand.');
  }

  const teams = sections.get('3TEAMS') ?? [];
  const home = teamFrom(teams[0]?.text);
  const visiting = teamFrom(teams[1]?.text);
  if (!home || !visiting) {
    throw new DvwParseError('De [3TEAMS]-sectie bevat geen twee ploegen.');
  }

  return {
    info: matchInfoFrom(sections.get('3MATCH')?.[0]?.text),
    home,
    visiting,
    homePlayers: playersFrom(sections.get('3PLAYERS-H') ?? []),
    visitingPlayers: playersFrom(sections.get('3PLAYERS-V') ?? []),
    declaredSets: declaredSetsFrom(sections.get('3SET') ?? []),
    rows: rowsFrom(scout),
  };
}

interface SectionLine {
  text: string;
  line: number;
}

function splitSections(lines: readonly string[]): Map<string, SectionLine[]> {
  const sections = new Map<string, SectionLine[]>();
  let current: SectionLine[] | null = null;

  lines.forEach((raw, index) => {
    const line = raw.trimEnd();
    const header = /^\[([^\]]+)\]$/.exec(line.trim());
    if (header?.[1]) {
      current = [];
      sections.set(header[1].toUpperCase(), current);
      return;
    }
    if (current && line.trim().length > 0) current.push({ text: line, line: index + 1 });
  });

  return sections;
}

function matchInfoFrom(line: string | undefined): DvwMatchInfo {
  const fields = (line ?? '').split(';');
  return {
    date: isoDate(fields[0]),
    season: nonEmpty(fields[2]),
    competition: nonEmpty(fields[3]),
    phase: nonEmpty(fields[4]),
  };
}

/**
 * DataVolley schrijft de datum als `mm/dd/yyyy` of `dd/mm/yyyy`, afhankelijk van
 * de instellingen van wie het bestand maakte. Is het eerste getal groter dan
 * twaalf, dan is dat de dag; anders houden we de Amerikaanse volgorde aan, want
 * dat is wat de software zelf standaard doet.
 */
function isoDate(value: string | undefined): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec((value ?? '').trim());
  if (!match) return null;
  const first = Number(match[1]);
  const second = Number(match[2]);
  const year = match[3];
  const [month, day] = first > 12 ? [second, first] : [first, second];
  if (!month || !day || month > 12 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function teamFrom(line: string | undefined): DvwTeam | null {
  if (!line) return null;
  const fields = line.split(';');
  const name = decodeDvText(fields[6]) ?? nonEmpty(fields[1]);
  if (!name) return null;
  return {
    code: nonEmpty(fields[0]) ?? '',
    name,
    setsWon: numberOrNull(fields[2]),
  };
}

const ROLES: Record<string, DvwRole> = {
  '1': 'libero',
  '2': 'outside',
  '3': 'opposite',
  '4': 'middle',
  '5': 'setter',
  '6': 'unknown',
};

function playersFrom(lines: readonly SectionLine[]): DvwPlayer[] {
  const players: DvwPlayer[] = [];
  for (const entry of lines) {
    const fields = entry.text.split(';');
    const number = numberOrNull(fields[1]);
    if (number === null) continue;
    players.push({
      number,
      lastName: decodeDvText(fields[17]) ?? nonEmpty(fields[9]) ?? '',
      firstName: decodeDvText(fields[18]) ?? nonEmpty(fields[10]) ?? '',
      role: ROLES[(fields[13] ?? '').trim()] ?? null,
    });
  }
  return players;
}

/**
 * Kolommen in `[3SCOUT]`: 1 code, 2-3 fase, 5-7 coördinaten, 8 tijd, 9 set,
 * 10-11 positie van de spelverdelers, 12-13 video, 15-20 en 21-26 wie er in het
 * veld staat. Wij hebben de code, de set en de rotatie nodig.
 */
function rowsFrom(lines: readonly SectionLine[]): DvwRow[] {
  return lines.map((entry) => {
    const fields = entry.text.split(';');
    return {
      code: (fields[0] ?? '').trim(),
      setNumber: numberOrNull(fields[8]),
      homeSetterPosition: numberOrNull(fields[9]),
      visitingSetterPosition: numberOrNull(fields[10]),
      line: entry.line,
    };
  });
}

/**
 * `[3SET]` heeft per set een regel met de tussenstanden bij 8, 16 en 21 punten
 * en daarna de eindstand: `True;8 -7;16-10;21-13;25-16;21;`. Sets die niet
 * gespeeld zijn hebben lege velden.
 */
function declaredSetsFrom(lines: readonly SectionLine[]): DvwDeclaredSet[] {
  const sets: DvwDeclaredSet[] = [];
  lines.forEach((entry, index) => {
    const score = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(entry.text.split(';')[4] ?? '');
    if (!score) return;
    sets.push({
      setNumber: index + 1,
      pointsHome: Number(score[1]),
      pointsVisiting: Number(score[2]),
    });
  });
  return sets;
}

function nonEmpty(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: string | undefined): number | null {
  const trimmed = (value ?? '').trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}
