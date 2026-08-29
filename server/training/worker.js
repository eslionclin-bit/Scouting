/**
 * De deelserver van de trainingsapp.
 *
 * `POST /share/push` neemt wijzigingen aan, `POST /share/pull` geeft terug wat
 * er sinds het meegegeven punt bij kwam. De outbox, het opnieuw proberen en het
 * samenvoegen op revisie zitten in de app en horen daar te blijven: die moet
 * ook werken als er geen server te bereiken is.
 *
 * ## Wie er binnen mag
 *
 * Daaromheen zit een inlog. Iedere trainer heeft een eigen account met een
 * wachtwoord, en zonder geldige sessie doet deze server niets — ook niet
 * meelezen. Accounts maakt de eigenaar aan; er is geen openbare aanmeldpagina,
 * want wie deze server gebruikt is een handjevol mensen dat elkaar kent.
 *
 * De allereerste keer is er nog niemand. Dan, en alleen dan, neemt
 * `POST /auth/setup` één eigenaarsaccount aan. Staat er eenmaal iemand in de
 * tabel, dan is dat adres dicht. Zet daarom meteen na het uitrollen je eigen
 * account klaar; wie wil kan dat afdwingen met het secret `SETUP_TOKEN`, dat
 * dan bij die ene aanroep meegestuurd moet worden.
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

import {
  afterFailedAttempt,
  bearerToken,
  cryptoSelfTest,
  hashPassword,
  hashToken,
  lockedUntil,
  looksLikeEmail,
  newToken,
  normalizeEmail,
  passwordProblem,
  sessionExpiry,
  sessionIsValid,
  verifyPassword,
} from './auth.js';

/** Korter dan dit is te raden, en dan is de hele opzet waardeloos. */
const MIN_CODE_LENGTH = 16;

/** Wat er gedeeld mag worden. De rest hoort op het apparaat te blijven. */
const SHAREABLE = new Set(['exercises', 'trainings', 'series', 'groups']);

/** In de openbare bak hoort geen groep thuis: die is per definitie besloten. */
const PUBLIC_SHAREABLE = new Set(['exercises', 'trainings', 'series']);

const SCHEMA = [
  `create table if not exists users (
     id text primary key,
     email text not null,
     name text not null,
     role text not null,
     password text not null,
     created_at text not null,
     last_login_at text,
     failed_attempts integer not null default 0,
     locked_until text
   )`,
  'create unique index if not exists users_email on users (email)',
  `create table if not exists sessions (
     token text primary key,
     user_id text not null,
     created_at text not null,
     expires_at text not null
   )`,
  'create index if not exists sessions_by_user on sessions (user_id)',
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
        const people = await userCount(env);
        database = `in orde — ${Number(row?.n ?? 0)} gedeelde records, ${people} ${
          people === 1 ? 'account' : 'accounts'
        }${people === 0 ? ' (maak in de app het eerste account aan)' : ''}`;
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

    try {
      await ensureSchema(env);

      // Kan deze server überhaupt wachtwoorden verwerken? Het aantal rondes
      // van PBKDF2 is aan de omgeving gebonden en niet aan onze code; toen dat
      // te hoog stond, gaf het aanmaken van het eerste account niets anders dan
      // 'er ging iets mis op de server'. Dit adres beantwoordt die vraag zonder
      // dat er een account voor nodig is.
      if (request.method === 'GET' && url.pathname === '/health/crypto') {
        const result = await cryptoSelfTest();
        return json(result, result.ok ? 200 : 500, origin);
      }

      // Of er al iemand is. Het enige dat zonder inlog te vragen valt, en de app
      // heeft het nodig om te weten of hij een inlogscherm of een
      // eerste-keer-scherm moet tonen.
      if (request.method === 'GET' && url.pathname === '/auth/status') {
        const count = await userCount(env);
        return json({ setupNeeded: count === 0, users: count }, 200, origin);
      }

      if (request.method !== 'POST') return json({ error: 'Alleen POST.' }, 405, origin);

      if (url.pathname === '/auth/setup') return await setup(request, env, origin);
      if (url.pathname === '/auth/login') return await login(request, env, origin);
      if (url.pathname === '/auth/logout') return await logout(request, env, origin);
      if (url.pathname === '/auth/me') return await me(request, env, origin);
      if (url.pathname === '/auth/password') return await changeOwnPassword(request, env, origin);

      if (url.pathname === '/admin/users') return await listUsers(request, env, origin);
      if (url.pathname === '/admin/users/add') return await addUser(request, env, origin);
      if (url.pathname === '/admin/users/remove') return await removeUser(request, env, origin);
      if (url.pathname === '/admin/users/password') return await resetPassword(request, env, origin);
      if (url.pathname === '/admin/users/role') return await changeRole(request, env, origin);

      if (url.pathname === '/share/push') return await push(request, env, origin);
      if (url.pathname === '/share/pull') return await pull(request, env, origin);
      return json({ error: 'Onbekend adres.' }, 404, origin);
    } catch (error) {
      // Nooit een stacktrace naar buiten, maar wél de naam van de fout: 'er ging
      // iets mis' zonder meer kostte hier een avond zoeken, terwijl één woord
      // ('OperationError') meteen de goede kant op wijst.
      console.error(error);
      const naam = error instanceof Error ? error.name : 'onbekend';
      return json({ error: `Er ging iets mis op de server (${naam}).` }, 500, origin);
    }
  },
};

// ---------- Inloggen ----------

/**
 * Wat de app van een gebruiker te zien krijgt. Het wachtwoord, de teller van
 * mislukte pogingen en het slot blijven hier: die zeggen iets over de beveiliging
 * en niets over de trainer.
 */
function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at ?? null,
  };
}

async function userCount(env) {
  const row = await env.DB.prepare('select count(*) as n from users').first();
  return Number(row?.n ?? 0);
}

/**
 * Het eerste account. Kan één keer, en daarna nooit meer: staat er iemand in de
 * tabel, dan is dit adres dicht. Zo kan niemand zich er later tussen schuiven.
 */
async function setup(request, env, origin) {
  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  if ((await userCount(env)) > 0) {
    return json({ error: 'Er is al een account. Log in of vraag de eigenaar om er een te maken.' }, 403, origin);
  }

  // Staat er een SETUP_TOKEN klaar, dan moet die kloppen. Dat sluit het gaatje
  // tussen uitrollen en het aanmaken van je eigen account.
  if (env.SETUP_TOKEN && String(body.value.setupToken ?? '') !== String(env.SETUP_TOKEN)) {
    return json({ error: 'De code voor de eerste keer klopt niet.' }, 403, origin);
  }

  const created = await createUser(env, body.value, 'owner');
  if (created.error) return json({ error: created.error }, 400, origin);

  const session = await startSession(env, created.user.id);
  return json({ ...session, user: publicUser(created.user) }, 200, origin);
}

async function login(request, env, origin) {
  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  const email = normalizeEmail(body.value.email);
  const password = String(body.value.password ?? '');
  const user = await env.DB.prepare('select * from users where email = ?').bind(email).first();

  // Eén en dezelfde melding voor 'dit adres kennen we niet' en 'dit wachtwoord
  // klopt niet'. Anders is deze server een manier om te achterhalen wie er
  // trainer is bij deze club.
  const wrong = { error: 'Dit adres en wachtwoord horen niet bij elkaar.' };

  if (!user) {
    // Toch even rekenen, zodat een onbekend adres niet sneller antwoordt dan een
    // bekend adres met een fout wachtwoord.
    await verifyPassword(password, 'pbkdf2$210000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    return json(wrong, 401, origin);
  }

  const locked = lockedUntil(user);
  if (locked) {
    return json(
      { error: 'Te vaak mis achter elkaar. Probeer het over een kwartier nog eens.', lockedUntil: locked },
      429,
      origin,
    );
  }

  if (!(await verifyPassword(password, user.password))) {
    const next = afterFailedAttempt(user);
    await env.DB.prepare('update users set failed_attempts = ?, locked_until = ? where id = ?')
      .bind(next.attempts, next.lockedUntil, user.id)
      .run();
    return json(wrong, 401, origin);
  }

  await env.DB.prepare(
    'update users set failed_attempts = 0, locked_until = null, last_login_at = ? where id = ?',
  )
    .bind(new Date().toISOString(), user.id)
    .run();

  const session = await startSession(env, user.id);
  return json({ ...session, user: publicUser({ ...user, last_login_at: new Date().toISOString() }) }, 200, origin);
}

async function logout(request, env, origin) {
  const token = bearerToken(request);
  if (token) {
    await env.DB.prepare('delete from sessions where token = ?').bind(await hashToken(token)).run();
  }
  return json({ ok: true }, 200, origin);
}

async function me(request, env, origin) {
  const session = await authenticate(request, env);
  if (!session) return json({ error: 'Niet ingelogd.' }, 401, origin);
  return json({ user: publicUser(session.user) }, 200, origin);
}

/** Je eigen wachtwoord veranderen. Het oude moet erbij; anders is een openstaande telefoon genoeg. */
async function changeOwnPassword(request, env, origin) {
  const session = await authenticate(request, env);
  if (!session) return json({ error: 'Niet ingelogd.' }, 401, origin);

  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  if (!(await verifyPassword(String(body.value.currentPassword ?? ''), session.user.password))) {
    return json({ error: 'Het huidige wachtwoord klopt niet.' }, 400, origin);
  }

  const problem = passwordProblem(body.value.newPassword);
  if (problem) return json({ error: problem }, 400, origin);

  await env.DB.prepare('update users set password = ? where id = ?')
    .bind(await hashPassword(String(body.value.newPassword)), session.user.id)
    .run();

  // Alle andere sessies eruit: een nieuw wachtwoord hoort een oude, gestolen
  // sessie ongeldig te maken. Deze blijft staan, anders vlieg je er zelf uit.
  await env.DB.prepare('delete from sessions where user_id = ? and token != ?')
    .bind(session.user.id, session.tokenHash)
    .run();

  return json({ ok: true }, 200, origin);
}

async function startSession(env, userId) {
  const token = newToken();
  const expiresAt = sessionExpiry();
  const now = new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('insert into sessions (token, user_id, created_at, expires_at) values (?, ?, ?, ?)')
      .bind(await hashToken(token), userId, now, expiresAt),
    // Ook hier bijhouden wanneer iemand voor het laatst binnenkwam: anders staat
    // er bij wie zich net als eigenaar heeft aangemeld 'nog nooit ingelogd'.
    env.DB.prepare('update users set last_login_at = ? where id = ?').bind(now, userId),
  ]);
  return { token, expiresAt };
}

/**
 * De gebruiker achter een verzoek, of null.
 *
 * Een verlopen sessie wordt meteen opgeruimd: dan groeit die tabel niet aan
 * rijen die toch niets meer betekenen.
 */
async function authenticate(request, env) {
  const token = bearerToken(request);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await env.DB.prepare('select * from sessions where token = ?').bind(tokenHash).first();
  if (!session) return null;
  if (!sessionIsValid(session)) {
    await env.DB.prepare('delete from sessions where token = ?').bind(tokenHash).run();
    return null;
  }
  const user = await env.DB.prepare('select * from users where id = ?').bind(session.user_id).first();
  if (!user) return null;
  return { user, tokenHash, session };
}

// ---------- Gebruikers beheren ----------

async function requireOwner(request, env, origin) {
  const session = await authenticate(request, env);
  if (!session) return { response: json({ error: 'Niet ingelogd.' }, 401, origin) };
  if (session.user.role !== 'owner') {
    return { response: json({ error: 'Alleen de eigenaar kan gebruikers beheren.' }, 403, origin) };
  }
  return { session };
}

async function createUser(env, input, forcedRole) {
  const email = normalizeEmail(input.email);
  const name = String(input.name ?? '').trim();
  const role = forcedRole ?? (input.role === 'owner' ? 'owner' : 'trainer');

  if (!looksLikeEmail(email)) return { error: 'Dit e-mailadres klopt niet.' };
  if (name.length < 2) return { error: 'Vul een naam in.' };
  const problem = passwordProblem(input.password);
  if (problem) return { error: problem };

  const existing = await env.DB.prepare('select id from users where email = ?').bind(email).first();
  if (existing) return { error: 'Er is al een account met dit adres.' };

  const user = {
    id: crypto.randomUUID(),
    email,
    name,
    role,
    password: await hashPassword(String(input.password)),
    created_at: new Date().toISOString(),
    last_login_at: null,
    failed_attempts: 0,
    locked_until: null,
  };

  await env.DB.prepare(
    `insert into users (id, email, name, role, password, created_at, failed_attempts)
     values (?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(user.id, user.email, user.name, user.role, user.password, user.created_at)
    .run();

  return { user };
}

async function listUsers(request, env, origin) {
  const guard = await requireOwner(request, env, origin);
  if (guard.response) return guard.response;
  const { results = [] } = await env.DB.prepare('select * from users order by created_at').all();
  return json({ users: results.map(publicUser) }, 200, origin);
}

async function addUser(request, env, origin) {
  const guard = await requireOwner(request, env, origin);
  if (guard.response) return guard.response;

  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  const created = await createUser(env, body.value);
  if (created.error) return json({ error: created.error }, 400, origin);
  return json({ user: publicUser(created.user) }, 200, origin);
}

async function removeUser(request, env, origin) {
  const guard = await requireOwner(request, env, origin);
  if (guard.response) return guard.response;

  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);
  const id = String(body.value.id ?? '');

  if (id === guard.session.user.id) {
    return json({ error: 'Jezelf verwijderen kan niet; maak eerst iemand anders eigenaar.' }, 400, origin);
  }

  const target = await env.DB.prepare('select * from users where id = ?').bind(id).first();
  if (!target) return json({ error: 'Deze gebruiker bestaat niet (meer).' }, 404, origin);
  if (await wouldLeaveNoOwner(env, target, null)) {
    return json({ error: 'Er moet minstens één eigenaar overblijven.' }, 400, origin);
  }

  // De sessies gaan mee. Anders blijft iemand die je net verwijderd hebt
  // gewoon werken tot zijn sessie vanzelf verloopt, en dat kan maanden duren.
  await env.DB.batch([
    env.DB.prepare('delete from sessions where user_id = ?').bind(id),
    env.DB.prepare('delete from users where id = ?').bind(id),
  ]);

  return json({ ok: true }, 200, origin);
}

/** Wachtwoord opnieuw zetten voor iemand die het kwijt is. */
async function resetPassword(request, env, origin) {
  const guard = await requireOwner(request, env, origin);
  if (guard.response) return guard.response;

  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  const problem = passwordProblem(body.value.password);
  if (problem) return json({ error: problem }, 400, origin);

  const id = String(body.value.id ?? '');
  const target = await env.DB.prepare('select id from users where id = ?').bind(id).first();
  if (!target) return json({ error: 'Deze gebruiker bestaat niet (meer).' }, 404, origin);

  await env.DB.batch([
    env.DB.prepare('update users set password = ?, failed_attempts = 0, locked_until = null where id = ?')
      .bind(await hashPassword(String(body.value.password)), id),
    // Ook hier: een nieuw wachtwoord hoort de oude sessies ongeldig te maken.
    env.DB.prepare('delete from sessions where user_id = ?').bind(id),
  ]);

  return json({ ok: true }, 200, origin);
}

async function changeRole(request, env, origin) {
  const guard = await requireOwner(request, env, origin);
  if (guard.response) return guard.response;

  const body = await readBody(request);
  if (body.error) return json({ error: body.error }, 400, origin);

  const id = String(body.value.id ?? '');
  const role = body.value.role === 'owner' ? 'owner' : 'trainer';
  const target = await env.DB.prepare('select * from users where id = ?').bind(id).first();
  if (!target) return json({ error: 'Deze gebruiker bestaat niet (meer).' }, 404, origin);
  if (await wouldLeaveNoOwner(env, target, role)) {
    return json({ error: 'Er moet minstens één eigenaar overblijven.' }, 400, origin);
  }

  await env.DB.prepare('update users set role = ? where id = ?').bind(role, id).run();
  return json({ ok: true }, 200, origin);
}

/** Zou deze wijziging de laatste eigenaar wegnemen? */
async function wouldLeaveNoOwner(env, target, newRole) {
  if (target.role !== 'owner' || newRole === 'owner') return false;
  const row = await env.DB.prepare("select count(*) as n from users where role = 'owner'").first();
  return Number(row?.n ?? 0) <= 1;
}

async function push(request, env, origin) {
  // Delen zit achter dezelfde inlog als de rest: zonder sessie neemt deze
  // server niets aan en geeft hij niets terug.
  const session = await authenticate(request, env);
  if (!session) return json({ error: 'Niet ingelogd.' }, 401, origin);

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
  const session = await authenticate(request, env);
  if (!session) return json({ error: 'Niet ingelogd.' }, 401, origin);

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
    'access-control-allow-headers': 'content-type, authorization',
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
