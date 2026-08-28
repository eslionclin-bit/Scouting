// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthClient, AuthError } from './client';
import { clearSession, loadSession, saveSession } from './session';
import type { Session } from './types';

function fakeFetch(handler: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const result = handler(String(input), init ?? {});
    return new Response(JSON.stringify(result.body), {
      status: result.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const account = {
  id: 'gebruiker-1',
  email: 'marit@voorbeeld.nl',
  name: 'Marit',
  role: 'owner' as const,
  createdAt: '2026-08-01T00:00:00.000Z',
  lastLoginAt: null,
};

describe('de cliënt', () => {
  it('logt in en geeft de sessie terug', async () => {
    const fetcher = fakeFetch(() => ({ body: { token: 'abc', expiresAt: '2026-12-01T00:00:00.000Z', user: account } }));
    const session = await new AuthClient('https://server.test/', fetcher).login('marit@voorbeeld.nl', 'geheimpje123');
    expect(session.token).toBe('abc');
    expect(session.user.role).toBe('owner');
  });

  it('stuurt het token mee als kop, niet in het adres', async () => {
    let seen: RequestInit = {};
    const fetcher = fakeFetch((_, init) => {
      seen = init;
      return { body: { user: account } };
    });
    await new AuthClient('https://server.test', fetcher).me('geheim-token');
    expect((seen.headers as Record<string, string>).authorization).toBe('Bearer geheim-token');
  });

  it('geeft de melding van de server door bij een fout wachtwoord', async () => {
    const fetcher = fakeFetch(() => ({ status: 401, body: { error: 'Dit adres en wachtwoord horen niet bij elkaar.' } }));
    const client = new AuthClient('https://server.test', fetcher);
    await expect(client.login('marit@voorbeeld.nl', 'fout')).rejects.toThrow(
      'Dit adres en wachtwoord horen niet bij elkaar.',
    );
    await expect(client.login('marit@voorbeeld.nl', 'fout')).rejects.toMatchObject({ status: 401 });
  });

  it('scheidt "geen verbinding" van "verkeerd wachtwoord"', async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    const error = await new AuthClient('https://server.test', fetcher)
      .login('marit@voorbeeld.nl', 'geheimpje123')
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).isOffline).toBe(true);
    expect((error as AuthError).isUnauthorized).toBe(false);
  });

  it('herkent een verlopen sessie als "niet meer ingelogd"', async () => {
    const fetcher = fakeFetch(() => ({ status: 401, body: { error: 'Niet ingelogd.' } }));
    const error = await new AuthClient('https://server.test', fetcher)
      .me('oud-token')
      .catch((cause: unknown) => cause);
    expect((error as AuthError).isUnauthorized).toBe(true);
  });

  it('vraagt de server of er al iemand is', async () => {
    const fetcher = fakeFetch((url) => {
      expect(url).toBe('https://server.test/auth/status');
      return { body: { setupNeeded: true, users: 0 } };
    });
    expect(await new AuthClient('https://server.test/', fetcher).status()).toEqual({
      setupNeeded: true,
      users: 0,
    });
  });

  it('beheert gebruikers via de beheerpaden', async () => {
    const paden: string[] = [];
    const fetcher = fakeFetch((url) => {
      paden.push(url.replace('https://server.test', ''));
      return { body: { users: [account], user: account } };
    });
    const client = new AuthClient('https://server.test', fetcher);
    await client.users('t');
    await client.addUser('t', { name: 'Joost', email: 'joost@voorbeeld.nl', password: 'wachtwoord12' });
    await client.removeUser('t', 'gebruiker-2');
    await client.resetPassword('t', 'gebruiker-2', 'nieuwwachtwoord');
    await client.changeRole('t', 'gebruiker-2', 'owner');
    expect(paden).toEqual([
      '/admin/users',
      '/admin/users/add',
      '/admin/users/remove',
      '/admin/users/password',
      '/admin/users/role',
    ]);
  });
});

describe('de bewaarde sessie', () => {
  const session: Session = {
    token: 'abc',
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    user: account,
  };

  beforeEach(() => {
    clearSession();
  });

  it('overleeft het sluiten van de app', () => {
    saveSession(session);
    expect(loadSession()?.token).toBe('abc');
  });

  it('vergeet een sessie die verlopen is', () => {
    saveSession({ ...session, expiresAt: new Date(Date.now() - 1000).toISOString() });
    expect(loadSession()).toBeNull();
  });

  it('vergeet rommel in de opslag zonder eruit te klappen', () => {
    globalThis.localStorage.setItem('volley-training.session', 'geen json');
    expect(loadSession()).toBeNull();
  });

  it('is na uitloggen weg', () => {
    saveSession(session);
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
