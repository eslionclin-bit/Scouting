/**
 * Waar de sessie blijft tussen twee keer openen.
 *
 * In localStorage, niet in een cookie: de app praat met een server op een ander
 * adres dan waar hij vandaan komt, en een token in een kop is dan eenvoudiger
 * en veiliger dan een cookie die je over domeinen heen moet toestaan. Gevolg is
 * wel dat de sessie per browser geldt — inloggen op je telefoon en op je laptop
 * zijn twee sessies, en dat is precies wat je verwacht.
 *
 * Het token blijft staan tot het verloopt, ook zonder verbinding. Anders zou de
 * app in een sporthal zonder bereik om een wachtwoord vragen dat hij daar toch
 * niet kan controleren.
 */

import type { Session } from './types';

const KEY = 'volley-training.session';

export function loadSession(): Session | null {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (typeof parsed?.token !== 'string' || !parsed.user || typeof parsed.expiresAt !== 'string') {
      return null;
    }
    if (Date.parse(parsed.expiresAt) <= Date.now()) {
      clearSession();
      return null;
    }
    return parsed as Session;
  } catch {
    return null;
  }
}

export function saveSession(session: Session): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(session));
  } catch {
    // Privémodus of opslag uit: dan werkt de app deze sessie lang gewoon door,
    // en vraagt hij bij de volgende keer opnieuw om inloggen.
  }
}

export function clearSession(): void {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // Niets te doen: er valt dan ook niets te bewaren.
  }
}
