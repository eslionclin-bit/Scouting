/**
 * Welk adres de trainingsapp voor de deelserver gebruikt.
 *
 * Twee bronnen, in deze volgorde: wat er op de beheerpagina is ingevuld, en
 * anders wat er bij het bouwen is meegegeven. Die tweede is er zodat de
 * gepubliceerde app meteen weet waar hij moet zijn — en dus meteen om inloggen
 * kan vragen — zonder dat iedereen dat met de hand invult.
 *
 * Staat er niets, dan is er geen server. Dan is er ook geen inlog: er valt niets
 * te controleren, en de app is precies wat hij zonder server is — alles op dit
 * apparaat.
 */

const KEY = 'VITE_TRAINING_SHARE_URL';

export function builtInServerUrl(): string {
  // In tests (node, geen Vite) bestaat import.meta.env niet.
  const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {};
  return (env[KEY] ?? '').trim();
}

export function resolveServerUrl(settings: { syncUrl: string | null }): string | null {
  const chosen = (settings.syncUrl ?? '').trim();
  return chosen || builtInServerUrl() || null;
}
