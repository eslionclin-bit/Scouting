/**
 * Instellingen van dít apparaat, en welke opslag bij welk account hoort.
 *
 * Staat in localStorage en niet in de database, om twee redenen. Ten eerste
 * reizen deze dingen nooit mee met het delen: het adres van de server en de
 * vraag of je openbare oefeningen ophaalt zijn keuzes van dit apparaat. Ten
 * tweede moet de app ze al kúnnen lezen voordat er een database open is — de
 * naam van die database hangt er namelijk vanaf.
 *
 * ## Waarom elk account zijn eigen opslag krijgt
 *
 * Inloggen zonder gescheiden opslag is een halve deur: op een gedeelde laptop
 * zou de tweede trainer de trainingen van de eerste zien staan. Elk account
 * krijgt daarom een eigen database. Het eerste account dat op een apparaat
 * inlogt neemt de bestaande opslag over — dat is bijna altijd de eigenaar van
 * de telefoon zelf, en zo raakt niemand werk kwijt dat er al stond.
 */

const KEY = 'volley-training.device';

/** Naam van de database zonder account; ook de opslag van voor de inlog. */
export const SOLO_DATABASE = 'volley-training';

export interface DeviceSettings {
  /** Adres van de deelserver. Leeg = wat er bij het bouwen is meegegeven. */
  syncUrl: string | null;
  /** Openbare oefeningen van anderen ophalen. */
  followPublic: boolean;
  /** Team waar de app standaard mee opent. */
  activeTeamId: string | null;
  /** Waar de app op rekent als er nog niets is afgevinkt. */
  defaultParticipants: number | null;
  /** Welke database bij welk account hoort, op dit apparaat. */
  databases: Record<string, string>;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  syncUrl: null,
  followPublic: true,
  activeTeamId: null,
  defaultParticipants: null,
  databases: {},
};

/**
 * Terugvalplek als de browser geen opslag geeft (privémodus, of een test die in
 * node draait). Dan gelden de instellingen deze sessie lang; dat is beter dan
 * een app die elke wijziging meteen weer vergeet.
 */
let inMemory: DeviceSettings | null = null;

export function loadDeviceSettings(): DeviceSettings {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return inMemory ? { ...inMemory } : { ...DEFAULT_DEVICE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<DeviceSettings>;
    return {
      ...DEFAULT_DEVICE_SETTINGS,
      ...parsed,
      databases: { ...(parsed.databases ?? {}) },
    };
  } catch {
    return inMemory ? { ...inMemory } : { ...DEFAULT_DEVICE_SETTINGS };
  }
}

export function saveDeviceSettings(patch: Partial<DeviceSettings>): DeviceSettings {
  const next = { ...loadDeviceSettings(), ...patch };
  inMemory = next;
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // Privémodus of opslag uit: dan blijft alleen de kopie in het geheugen.
  }
  return next;
}

/**
 * De database die bij dit account hoort op dit apparaat.
 *
 * Is er nog geen, dan krijgt het eerste account de bestaande opslag — dat is de
 * telefoon van die trainer zelf, met zijn eigen werk erin. Elk volgend account
 * krijgt een eigen database en ziet dus niets van de ander.
 */
export function databaseFor(accountId: string | null): string {
  if (!accountId) return SOLO_DATABASE;

  const settings = loadDeviceSettings();
  const known = settings.databases[accountId];
  if (known) return known;

  const taken = new Set(Object.values(settings.databases));
  const name = taken.has(SOLO_DATABASE) ? `${SOLO_DATABASE}-${accountId}` : SOLO_DATABASE;
  saveDeviceSettings({ databases: { ...settings.databases, [accountId]: name } });
  return name;
}

/** Alleen voor tests: alles vergeten wat dit apparaat onthouden had. */
export function forgetDevice(): void {
  inMemory = null;
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Niets te doen.
  }
}
