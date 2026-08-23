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

/**
 * Het ingebouwde adres, als het er is.
 *
 * Bewust niet meer het enige antwoord. Een adres dat bij het bouwen wordt
 * ingebakken is onzichtbaar: je kunt niet zien of het erin zit, je moet een
 * bouw afwachten om het te veranderen, en een browser die een oude kopie
 * vasthoudt geeft je een app zonder adres zonder dat iemand weet waarom. Dat
 * kostte een avond. Het adres van een apparaat kan daarom ook gewoon worden
 * ingesteld, en het reist mee in de koppellink.
 */
export function builtInUrl(): string {
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

/**
 * De koppeling doorgeven als link.
 *
 * Een code overtikken op een telefoon gaat mis, en het gaat stil mis: het
 * klavier verandert er iets aan, de server hasht hem, en je belandt zonder
 * foutmelding bij een lege ploeg. Een link heeft dat probleem niet — je tikt
 * hem aan en klaar.
 *
 * De code staat achter een `#`. Dat is geen opmaak maar het hele punt: alles na
 * een hekje blijft in de browser en gaat nooit mee in een verzoek naar de
 * server die de app uitlevert. GitHub ziet hem dus niet.
 *
 * Wat blijft gelden: wie de link heeft, heeft de code, en wie de code heeft
 * ziet de wedstrijden van de ploeg. Stuur hem dus naar jezelf en naar je
 * teamgenoten, en niet in een groep waar de tegenstander in zit.
 */
const LINK_KEY = 'ploeg';

export function couplingLink(code: string, url: string): string {
  const base = `${globalThis.location?.origin ?? ''}${globalThis.location?.pathname ?? '/'}`;
  // Het adres gaat mee. Zo hoeft het andere apparaat niets te weten, ook niet
  // of er iets is ingebakken — het krijgt alles wat het nodig heeft in één tik.
  return `${base}#${LINK_KEY}=${encodeURIComponent(code)}&${SERVER_KEY}=${encodeURIComponent(url)}`;
}

const SERVER_KEY = 'server';

export interface CouplingFromLink {
  code: string;
  /** Leeg als de link nog van de oude soort was, zonder adres. */
  url: string;
}

/**
 * Leest de code uit de link en haalt hem daarna uit de adresbalk.
 *
 * Dat opruimen is niet cosmetisch: anders staat de code in de geschiedenis van
 * de browser en in elke schermafbeelding die iemand van de app maakt.
 */
export function takeCouplingCode(): CouplingFromLink | null {
  const hash = globalThis.location?.hash ?? '';
  const match = new RegExp(`[#&]${LINK_KEY}=([^&]+)`).exec(hash);
  if (!match?.[1]) return null;

  const code = normalizeTeamCode(decodeURIComponent(match[1]));
  const server = new RegExp(`[#&]${SERVER_KEY}=([^&]+)`).exec(hash);
  const url = server?.[1] ? decodeURIComponent(server[1]).trim() : '';

  try {
    const { origin, pathname, search } = globalThis.location;
    globalThis.history?.replaceState(null, '', `${origin}${pathname}${search}`);
  } catch {
    // Lukt het opruimen niet, dan is de koppeling nog steeds gelukt; dat weegt
    // zwaarder dan een nette adresbalk.
  }

  return code.length >= MIN_CODE_LENGTH ? { code, url } : null;
}
