/**
 * De deelserver van de trainingsapp: twee eindpunten, verder niets.
 *
 * `POST /share/push` neemt wijzigingen aan, `POST /share/pull` geeft terug wat
 * er sinds het meegegeven punt bij kwam. De outbox, het opnieuw proberen en het
 * samenvoegen op revisie zitten in de app en horen daar te blijven: die moet
 * ook werken als er geen server te bereiken is.
 *
 * ## Twee soorten bakken
 *
 * - **groep** — bepaald door een gedeelde code. De server bewaart die code niet;
 *   hij rekent er een hash over en gebruikt die als kolom. Wie de code heeft,
 *   hoort erbij; er valt niets aan te maken en niets te beheren.
 * - **openbaar** — één vaste bak voor oefeningen die iedereen mag zien. Hier
 *   geldt precies wat er staat: openbaar is openbaar. Iedereen met het adres
 *   van deze server kan erin lezen én schrijven, dus wat hier binnenkomt is
 *   niet meer van jou alleen. De app zet er alleen in wat een trainer expliciet
 *   op 'openbaar' zet.
 *
 * Persoonlijke gegevens gaan hier nooit doorheen: teams en spelers hebben geen
 * zichtbaarheid en worden door de app niet verstuurd. De server weigert ze ook,
 * zodat een fout in de app geen namenlijst kan lekken.
 */

/** Korter dan dit is te raden, en dan is de hele opzet waardeloos. */
const MIN_CODE_LENGTH = 16;

/** Wat er gedeeld mag worden. De rest hoort op het apparaat te blijven. */
const SHAREABLE = new Set(['exercises', 'trainings', 'series', 'groups']);

/** In de openbare bak hoort geen groep thuis: die is per definitie besloten. */
const PUBLIC_SHAREABLE = new Set(['exercises', 'trainings', 'series']);

const SCHEMA = [
  `create table if not exists shared (
     seq integer primary key autoincrement,
     scope text not null,
     entity text not null,
     record_id text not null,
     rev text not null,
     payload text not null,
     updated_at text not null
   )`,
  'create unique index if not exists shared_record on shared (scope, entity, record_id)',
  'create index if not exists shared_by_scope_seq on shared (scope, seq)',
];

let schemaReady = null;

function ensureSchema(env) {
  schemaReady ??= env.DB.batch(SCHEMA.map((statement) => env.DB.prepare(statement))).catch(
    (error) => {
      schemaReady = null;
      throw error;
    },
  );
  return schemaReady;
}

const MAX_BATCH = 500;

/** Een oefening met animatie is groot; een bericht van een megabyte is genoeg. */
const MAX_BODY_BYTES = 1_000_000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') ?? '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);

    // Eén pagina die een mens kan lezen: 'uitgerold' en 'bereikbaar' zijn niet
    // hetzelfde, en zonder dit ziet elk antwoord van deze server eruit als iets
    // dat stukging.
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/status')) {
      let database = 'niet gecontroleerd';
      try {
        await ensureSchema(env);
        const row = await env.DB.prepare('select count(*) as n from shared').first();
        database = `in orde — ${Number(row?.n ?? 0)} gedeelde records`;
      } catch (error) {
        database = `probleem: ${error instanceof Error ? error.message : String(error)}`;
      }

      return new Response(
        `<!doctype html><meta charset="utf-8">
         <title>Deelserver trainingsapp</title>
         <style>body{font:16px/1.5 system-ui;margin:2rem;max-width:34rem}
         h1{font-size:1.3rem}</style>
         <h1>De deelserver draait.</h1>
         <p>Zie je deze zin, dan is de server bereikbaar vanaf dit apparaat en dit
            netwerk. Werkt het delen dan nog steeds niet, dan zit het probleem
            niet hier.</p>
         <p>Database: ${database}</p>
         <p>Tijd op de server: ${new Date().toISOString()}</p>`,
        { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...cors(origin) } },
      );
    }

    if (request.method !== 'POST') return json({ error: 'Alleen POST.' }, 405, origin);

    try {
      await ensureSchema(env);
      if (url.pathname === '/share/push') return await push(request, env, origin);
      if (url.pathname === '/share/pull') return await pull(request, env, origin);
      return json({ error: 'Onbekend adres.' }, 404, origin);
    } catch (error) {
      console.error(error);
      return json({ error: 'Er ging iets mis op de server.' }, 500, origin);
    }
  },
};

async function push(request, env, origin) {
  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  const scope = await scopeOf(body.value);
  if (!scope) return json({ error: badCode() }, 400, origin);
  const allowed = scope === 'public' ? PUBLIC_SHAREABLE : SHAREABLE;

  const changes = Array.isArray(body.value.changes) ? body.value.changes : [];
  const now = new Date().toISOString();
  const statements = [];
  const accepted = [];

  for (const change of changes) {
    const record = change?.record;
    if (!record || typeof record.id !== 'string' || typeof record.rev !== 'string') continue;
    if (typeof change.entity !== 'string' || !allowed.has(change.entity)) continue;

    // Twee statements samen zijn de hele samenvoegregel: weg met de oude rij
    // als die ouder is, en de nieuwe erin als de oude weg was. Daarmee wint de
    // hoogste revisie en is een bericht dat vertraagd binnenkomt ongevaarlijk.
    statements.push(
      env.DB.prepare(
        'delete from shared where scope = ? and entity = ? and record_id = ? and rev < ?',
      ).bind(scope, change.entity, record.id, record.rev),
      env.DB.prepare(
        `insert into shared (scope, entity, record_id, rev, payload, updated_at)
         values (?, ?, ?, ?, ?, ?)
         on conflict (scope, entity, record_id) do nothing`,
      ).bind(scope, change.entity, record.id, record.rev, JSON.stringify(record), now),
    );

    // Aangekomen is aangekomen: een revisie die de server al in een nieuwere
    // versie had mag ook uit de outbox, hij is alleen niet de winnaar geworden.
    accepted.push(record.rev);
  }

  if (statements.length > 0) await env.DB.batch(statements);
  return json({ acceptedRevs: accepted }, 200, origin);
}

async function pull(request, env, origin) {
  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  const scope = await scopeOf(body.value);
  if (!scope) return json({ error: badCode() }, 400, origin);

  const cursor = Number.parseInt(String(body.value.cursor ?? '0'), 10) || 0;
  const batch = Math.min(Math.max(Number(body.value.batch) || 200, 1), MAX_BATCH);

  const { results = [] } = await env.DB.prepare(
    'select seq, entity, payload from shared where scope = ? and seq > ? order by seq limit ?',
  )
    .bind(scope, cursor, batch)
    .all();

  const changes = [];
  let last = cursor;
  for (const row of results) {
    try {
      changes.push({ entity: row.entity, record: JSON.parse(row.payload) });
    } catch {
      // Eén onleesbare rij mag een hele ronde niet laten mislukken.
    }
    last = row.seq;
  }

  // Hoeveel staat er onder deze code? Daarmee kan de app het enige geval
  // opvangen dat de server niet kan zien: een typefout in de code, die hier
  // gewoon een andere, lege groep oplevert.
  const total = await env.DB.prepare('select count(*) as n from shared where scope = ?')
    .bind(scope)
    .first();

  return json(
    { changes, cursor: String(last), hasMore: results.length >= batch, total: Number(total?.n ?? 0) },
    200,
    origin,
  );
}

/**
 * De bak waar dit verzoek over gaat.
 *
 * Openbaar is een vaste naam; een groep is de SHA-256 van de code, in hex.
 * Niet gezouten, met opzet: elk apparaat moet onafhankelijk op dezelfde waarde
 * uitkomen zonder eerst iets op te halen. Wat de hash moet weerstaan is niet
 * een gestolen database — de code staat er niet in — maar raden, en daar is
 * lengte het antwoord op.
 */
async function scopeOf(body) {
  if (body.scope === 'public') return 'public';
  if (body.scope !== 'group') return null;
  if (typeof body.code !== 'string') return null;

  // Kleine letters en geen witruimte, precies zoals de app het doet. Een
  // telefoonklavier zet een hoofdletter aan het begin en plakt er soms een
  // spatie achter; zonder dit afvlakken levert die hulpvaardigheid een andere,
  // lege groep op — zonder foutmelding, want de server kent geen accounts.
  const normalized = body.code.toLowerCase().replace(/\s+/g, '');
  if (normalized.length < MIN_CODE_LENGTH) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return `g:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function badCode() {
  return `De groepscode ontbreekt of is te kort (minstens ${MIN_CODE_LENGTH} tekens).`;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: 'Bericht te groot.' };
  try {
    const value = JSON.parse(text);
    if (value == null || typeof value !== 'object') return { error: 'Bericht onleesbaar.' };
    return { value };
  } catch {
    return { error: 'Bericht onleesbaar.' };
  }
}

function cors(origin) {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-max-age': '86400',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors(origin) },
  });
}
