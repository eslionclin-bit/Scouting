/**
 * Welk adres de app voor de online koppeling gebruikt, en hoe een ploegcode
 * eruitziet.
 *
 * Het adres wordt bij het bouwen ingevuld vanuit de omgeving (in GitHub Actions
 * vanuit een repository-secret). Staat het er niet, dan is de app precies wat
 * hij daarvoor was: alles lokaal, en koppelen kan alleen met een apparaat in
 * dezelfde zaal.
 */

const URL_KEY = 'VITE_SYNC_URL';

function fromEnv(name: string): string {
  // In tests (node, geen Vite) bestaat import.meta.env niet; dan is er geen
  // server ingebouwd en blijft de app lokaal.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  return (env[name] ?? '').trim();
}

export function isCloudConfigured(): boolean {
  return fromEnv(URL_KEY).length > 0;
}

export function cloudUrl(): string {
  return fromEnv(URL_KEY);
}

/**
 * Hoe lang een ploegcode minstens moet zijn.
 *
 * Dit is geen formaliteit. De server bewaart de code niet en kent geen
 * accounts: de ploeg ís de code. Alles hangt dus aan de vraag of hij te raden
 * valt, en daar is lengte het enige echte antwoord op. De server weigert
 * hetzelfde minimum.
 */
export const MIN_CODE_LENGTH = 16;

/**
 * Woorden waaruit een code wordt gebouwd.
 *
 * Vier woorden uit deze lijst plus vier cijfers is ruim voldoende om niet te
 * raden te zijn, en het is over te tikken en door de telefoon te zeggen —
 * anders dan een reeks willekeurige tekens, die op een tablet in een zaal
 * gegarandeerd fout wordt overgenomen.
 */
const WORDS = [
  'anker', 'beuk', 'bries', 'dijk', 'duin', 'eik', 'gors', 'haven',
  'hei', 'kade', 'kiel', 'klei', 'kust', 'lisdodde', 'maas', 'mist',
  'molen', 'mos', 'polder', 'riet', 'schans', 'sluis', 'stroom', 'terp',
  'tij', 'veen', 'vlier', 'vloed', 'waard', 'wad', 'wilg', 'zeil',
] as const;

/**
 * De code zoals de server hem ziet: kleine letters, geen witruimte.
 *
 * Dit is geen vormvoorkeur maar een noodzaak. De ploeg *is* de code — de server
 * hasht hem en kent geen accounts — dus één afwijkend teken levert een andere,
 * lege ploeg op, zonder foutmelding. En precies dat gebeurt op een telefoon: het
 * klavier zet een hoofdletter aan het begin, of plakt er een spatie achter na
 * automatisch aanvullen. Door aan beide kanten hetzelfde af te vlakken kan die
 * hulpvaardigheid geen kwaad meer.
 *
 * De worker doet exact hetzelfde (zie `server/cloud/worker.js`); die twee horen
 * gelijk te blijven.
 */
export function normalizeTeamCode(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, '');
}

/** Een verse ploegcode. Wie hem heeft, ziet de wedstrijden van de ploeg. */
export function generateTeamCode(): string {
  const random = new Uint32Array(5);
  crypto.getRandomValues(random);
  const words = [...random.slice(0, 4)].map((value) => WORDS[value % WORDS.length]);
  const digits = String(random[4]! % 10_000).padStart(4, '0');
  return [...words, digits].join('-');
}
