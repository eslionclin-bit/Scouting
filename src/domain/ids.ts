/** Identiteit van records en van dit apparaat. */

/**
 * UUID v4. Werkt offline: er is geen server nodig om een id uit te delen, dus
 * twee tablets zonder verbinding kunnen tegelijk records aanmaken.
 */
export function newId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();

  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const DEVICE_ID_KEY = 'volley-scouting.device-id';

let cachedDeviceId: string | null = null;

/**
 * Stabiel id van dit apparaat. Wordt gebruikt als tiebreak bij het samenvoegen
 * van wijzigingen en om te herkennen welke wijzigingen van onszelf komen.
 */
export function getDeviceId(): string {
  if (cachedDeviceId) return cachedDeviceId;

  const storage = safeLocalStorage();
  const stored = storage?.getItem(DEVICE_ID_KEY);
  if (stored) {
    cachedDeviceId = stored;
    return stored;
  }

  const created = newId();
  storage?.setItem(DEVICE_ID_KEY, created);
  cachedDeviceId = created;
  return created;
}

/** Alleen voor tests en voor het simuleren van een tweede apparaat. */
export function setDeviceId(id: string): void {
  cachedDeviceId = id;
  safeLocalStorage()?.setItem(DEVICE_ID_KEY, id);
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Private mode of een omgeving zonder localStorage: dan blijft het device-id
    // per sessie, wat vervelend maar niet blokkerend is.
    return null;
  }
}
