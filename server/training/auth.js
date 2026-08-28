/**
 * Het rekenwerk achter inloggen: wachtwoorden, tokens en de regels eromheen.
 *
 * Staat los van `worker.js` omdat dit het deel is dat écht goed moet zijn en dat
 * je dus wil kunnen testen zonder een database of een server. Hier staan geen
 * SQL-vragen in; alleen wat er met een wachtwoord gebeurt voordat het de
 * database in gaat, en wat er met een token gebeurt voordat het eruit komt.
 *
 * Uitgangspunten:
 *
 * - Een wachtwoord wordt nooit bewaard, ook niet versleuteld: er gaat een
 *   PBKDF2-afgeleide overheen met een eigen zout per gebruiker. Wie de database
 *   in kijkt, kan er niet mee inloggen en kan hem ook niet in één keer over
 *   alle gebruikers heen kraken.
 * - Een sessietoken wordt gehasht bewaard, om dezelfde reden: de database
 *   bevat dan geen sleutel waarmee je zomaar iemands sessie kunt overnemen.
 * - Vergelijken gebeurt in gelijke tijd. Een vergelijking die bij het eerste
 *   verkeerde teken stopt, verklapt met de duur van het antwoord hoe ver je zat.
 */

/**
 * Zoveel rondes gaan er over een wachtwoord heen.
 *
 * De rem op raden is dat dit tijd kost. Cloudflare rekent per verzoek met een
 * CPU-limiet, dus het kan niet eindeloos omhoog; 210.000 is wat OWASP voor
 * PBKDF2-SHA256 aanhoudt en blijft ruim binnen de limiet.
 */
export const PBKDF2_ROUNDS = 210_000;

/** Korter dan dit is geen wachtwoord maar een formaliteit. */
export const MIN_PASSWORD_LENGTH = 10;

/** Na zoveel mispogingen op rij gaat het slot erop. */
export const MAX_ATTEMPTS = 10;

/** En dan zo lang. Lang genoeg om raden zinloos te maken, kort genoeg om te wachten. */
export const LOCK_MINUTES = 15;

/** Zo lang blijft een sessie geldig; daarna moet je opnieuw inloggen. */
export const SESSION_DAYS = 90;

const encoder = new TextEncoder();

/**
 * Maak een bewaarbare vorm van een wachtwoord.
 *
 * De uitkomst draagt zijn eigen instellingen mee (`pbkdf2$rondes$zout$hash`),
 * zodat het aantal rondes later omhoog kan zonder dat bestaande gebruikers
 * eruit vliegen: hun oude regel blijft controleerbaar.
 */
export async function hashPassword(password, rounds = PBKDF2_ROUNDS) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, rounds);
  return `pbkdf2$${rounds}$${toBase64(salt)}$${toBase64(hash)}`;
}

/** Hoort dit wachtwoord bij deze bewaarde regel? */
export async function verifyPassword(password, stored) {
  const parts = String(stored ?? '').split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const rounds = Number(parts[1]);
  if (!Number.isFinite(rounds) || rounds < 1000) return false;
  const salt = fromBase64(parts[2]);
  const expected = fromBase64(parts[3]);
  if (!salt || !expected) return false;
  const actual = await derive(password, salt, rounds, expected.length);
  return equalInConstantTime(actual, expected);
}

async function derive(password, salt, rounds, length = 32) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Een nieuw sessietoken: 32 willekeurige bytes, leesbaar als tekst. */
export function newToken() {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Wat er van een token in de database komt te staan. */
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(String(token)));
  return toHex(new Uint8Array(digest));
}

/**
 * Adressen worden vergeleken, dus moeten ze er hetzelfde uitzien.
 *
 * Kleine letters en spaties eraf. Verder niets: het puntje in een Gmail-adres
 * weghalen is slim bedoeld maar levert bij andere aanbieders een ander postvak
 * op, en dan log je iemand anders in.
 */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** Ziet dit eruit als een adres? Streng genoeg om een typefout te vangen. */
export function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalizeEmail(email));
}

/** Waarom een wachtwoord niet deugt, of null als het deugt. */
export function passwordProblem(password) {
  const value = String(password ?? '');
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Een wachtwoord van minstens ${MIN_PASSWORD_LENGTH} tekens, graag.`;
  }
  if (value.length > 200) return 'Dit wachtwoord is onwerkbaar lang.';
  if (value.trim() === '') return 'Een wachtwoord van alleen spaties telt niet.';
  return null;
}

/** Zit dit account op slot, en tot wanneer? */
export function lockedUntil(user, now = Date.now()) {
  const until = user?.locked_until ? Date.parse(user.locked_until) : 0;
  return Number.isFinite(until) && until > now ? new Date(until).toISOString() : null;
}

/**
 * Wat er na een mislukte poging in de database komt te staan.
 *
 * Tellen per gebruiker en niet per adres van de bezoeker: een bezoekersadres
 * wisselt per telefoon en per netwerk, en dan remt het niets.
 */
export function afterFailedAttempt(user, now = Date.now()) {
  const attempts = Number(user?.failed_attempts ?? 0) + 1;
  const locked = attempts >= MAX_ATTEMPTS ? new Date(now + LOCK_MINUTES * 60_000).toISOString() : null;
  return { attempts, lockedUntil: locked };
}

/** Wanneer een sessie die nu begint verloopt. */
export function sessionExpiry(now = Date.now()) {
  return new Date(now + SESSION_DAYS * 24 * 60 * 60_000).toISOString();
}

/** Is deze sessie nog geldig? */
export function sessionIsValid(session, now = Date.now()) {
  if (!session?.expires_at) return false;
  const expires = Date.parse(session.expires_at);
  return Number.isFinite(expires) && expires > now;
}

/** Het token uit een `Authorization: Bearer ...`-kop, of null. */
export function bearerToken(request) {
  const header = request?.headers?.get?.('authorization') ?? '';
  const match = /^bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] ?? '').trim() || null : null;
}

/**
 * Twee reeksen bytes vergelijken zonder bij het eerste verschil te stoppen.
 * Ze zijn even lang (allebei uit dezelfde afleiding), maar de lengte staat er
 * toch bij: anders zegt de duur alsnog iets zodra dat ooit verandert.
 */
export function equalInConstantTime(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export function toBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function toBase64Url(bytes) {
  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64(text) {
  try {
    const binary = atob(String(text));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

function toHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
