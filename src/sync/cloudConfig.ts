/**
 * Welk Supabase-project de app gebruikt.
 *
 * Twee waarden, allebei publiek: de URL van het project en de anon-sleutel. Ze
 * worden bij het bouwen ingevuld vanuit de omgeving (in GitHub Actions vanuit
 * de repository-secrets), en ze mogen in de gebouwde app staan — op de server
 * mag die sleutel niets. Alles loopt via functies die om de ploegcode vragen,
 * en die code staat alleen op het apparaat zelf.
 *
 * Staan ze er niet, dan is de app precies wat hij hiervoor was: alles lokaal,
 * en koppelen kan alleen met een apparaat in dezelfde zaal.
 */

interface CloudProject {
  url: string;
  anonKey: string;
}

const URL_KEY = 'VITE_SUPABASE_URL';
const KEY_KEY = 'VITE_SUPABASE_ANON_KEY';

function fromEnv(name: string): string {
  // In tests (node, geen Vite) bestaat import.meta.env niet; dan is er gewoon
  // geen project ingebouwd en blijft de app lokaal.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  return (env[name] ?? '').trim();
}

export function isCloudConfigured(): boolean {
  return fromEnv(URL_KEY).length > 0 && fromEnv(KEY_KEY).length > 0;
}

export function cloudProject(): CloudProject {
  return { url: fromEnv(URL_KEY), anonKey: fromEnv(KEY_KEY) };
}
