/**
 * De online koppeling: twee eindpunten, verder niets.
 *
 * `POST /sync/push` neemt wijzigingen aan, `POST /sync/pull` geeft terug wat er
 * sinds het meegegeven punt bij kwam. De rest — de outbox, opnieuw proberen,
 * samenvoegen op revisie — zit al in de app en hoort daar te blijven: die moet
 * ook werken als er geen server te bereiken is.
 *
 * ## Waarom er geen accounts zijn
 *
 * De ploeg wordt bepaald door een gedeelde code, en de server bewaart die code
 * niet. Hij rekent er een hash over en gebruikt die als kolom. Gevolg:
 *
 *  - Er is niets aan te maken en niets te beheren; de eerste keer dat een
 *    apparaat een code gebruikt, ontstaat de ploeg vanzelf.
 *  - Wie de database in kijkt, kan er niet mee inloggen.
 *  - Een typefout in de code levert geen foutmelding op maar een lege, andere
 *    ploeg. Daarom telt `pull` erbij hoeveel er onder die code staat, zodat de
 *    app kan zeggen: hier staat nog niets, klopt de code wel?
 *
 * Dat het veilig is, hangt dus aan de lengte van de code. Daarom genereert de
 * app hem, en daarom weigert dit bestand alles wat korter is dan
 * `MIN_CODE_LENGTH`.
 */

/** Korter dan dit is te raden, en dan is de hele opzet waardeloos. */
const MIN_CODE_LENGTH = 16;

/** Zoveel wijzigingen gaan er per keer terug. */
const MAX_BATCH = 500;

/** Groter dan dit is geen wedstrijdinvoer meer maar iets anders. */
const MAX_BODY_BYTES = 1_000_000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('origin') ?? '*';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Alleen POST.' }, 405, origin);
    }

    const url = new URL(request.url);
    try {
      if (url.pathname === '/sync/push') return await push(request, env, origin);
      if (url.pathname === '/sync/pull') return await pull(request, env, origin);
      return json({ error: 'Onbekend adres.' }, 404, origin);
    } catch (error) {
      // Nooit een stacktrace naar buiten: de app kan er niets mee en het zegt
      // meer over de server dan nodig is.
      console.error(error);
      return json({ error: 'Er ging iets mis op de server.' }, 500, origin);
    }
  },
};

async function push(request, env, origin) {
  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  const team = await teamOf(body.value.teamCode);
  if (!team) return json({ error: badCode() }, 400, origin);

  const changes = Array.isArray(body.value.changes) ? body.value.changes : [];
  const now = new Date().toISOString();
  const statements = [];
  const accepted = [];

  for (const change of changes) {
    const record = change?.record;
    if (!record || typeof record.id !== 'string' || typeof record.rev !== 'string') continue;
    if (typeof change.entity !== 'string') continue;

    // Twee statements samen zijn de hele samenvoegregel:
    //
    //   1. weg met de oude rij, maar alleen als die ouder is dan wat er
    //      binnenkomt;
    //   2. de nieuwe rij erin, en als de oude er nog staat gebeurt er niets.
    //
    // Daarmee wint de hoogste revisie, krijgt een gewijzigd record een nieuw
    // volgnummer, en is een bericht dat vertraagd binnenkomt ongevaarlijk.
    statements.push(
      env.DB.prepare(
        'delete from changes where team = ? and entity = ? and record_id = ? and rev < ?',
      ).bind(team, change.entity, record.id, record.rev),
      env.DB.prepare(
        `insert into changes (team, entity, record_id, rev, match_id, payload, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)
         on conflict (team, entity, record_id) do nothing`,
      ).bind(
        team,
        change.entity,
        record.id,
        record.rev,
        typeof change.matchId === 'string' ? change.matchId : null,
        JSON.stringify(record),
        now,
      ),
    );

    // Aangekomen is aangekomen. Een revisie die de server al in een nieuwere
    // versie had, telt ook mee: hij mag uit de outbox, hij is alleen niet de
    // winnaar geworden.
    accepted.push(record.rev);
  }

  if (statements.length > 0) await env.DB.batch(statements);
  return json({ acceptedRevs: accepted }, 200, origin);
}

async function pull(request, env, origin) {
  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  const team = await teamOf(body.value.teamCode);
  if (!team) return json({ error: badCode() }, 400, origin);

  const cursor = Number.parseInt(String(body.value.cursor ?? '0'), 10) || 0;
  const batch = Math.min(Math.max(Number(body.value.batch) || 200, 1), MAX_BATCH);
  const matchId = typeof body.value.matchId === 'string' ? body.value.matchId : null;

  const query = matchId
    ? env.DB.prepare(
        `select seq, entity, payload from changes
         where team = ? and seq > ? and (match_id = ? or match_id is null)
         order by seq limit ?`,
      ).bind(team, cursor, matchId, batch)
    : env.DB.prepare(
        `select seq, entity, payload from changes
         where team = ? and seq > ?
         order by seq limit ?`,
      ).bind(team, cursor, batch);

  const { results = [] } = await query.all();

  const changes = [];
  let last = cursor;
  for (const row of results) {
    try {
      changes.push({ entity: row.entity, record: JSON.parse(row.payload) });
    } catch {
      // Onleesbare rij overslaan in plaats van de hele ronde laten mislukken:
      // één kapot record mag een wedstrijd niet blokkeren.
    }
    last = row.seq;
  }

  // Hoeveel staat er in totaal onder deze code? Daarmee kan de app het enige
  // geval opvangen dat de server niet kan zien: een typefout in de code, die
  // hier gewoon een andere, lege ploeg oplevert.
  const total = await env.DB.prepare('select count(*) as n from changes where team = ?')
    .bind(team)
    .first();

  return json(
    {
      changes,
      cursor: String(last),
      hasMore: results.length >= batch,
      total: Number(total?.n ?? 0),
    },
    200,
    origin,
  );
}

/**
 * De ploeg bij een code: de SHA-256 van de code, in hex.
 *
 * Niet gezouten, en dat is hier met opzet: elk apparaat moet onafhankelijk op
 * dezelfde kolomwaarde uitkomen zonder eerst iets op te halen. Wat de hash
 * moet weerstaan is niet een gestolen database — de code stáát er niet in —
 * maar raden, en daar is lengte het antwoord op.
 */
async function teamOf(code) {
  if (typeof code !== 'string' || code.trim().length < MIN_CODE_LENGTH) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code.trim()));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function badCode() {
  return `De ploegcode ontbreekt of is te kort (minstens ${MIN_CODE_LENGTH} tekens).`;
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
