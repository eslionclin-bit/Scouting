/**
 * De cliënt voor de inlog: alle gesprekken met de deelserver over accounts.
 *
 * Eén klasse met korte methodes, en verder niets slims. De reden dat dit apart
 * staat van de schermen is dat het zo te testen valt met een verzonnen `fetch`:
 * wat er gebeurt bij een fout wachtwoord, bij een verlopen sessie of bij een
 * server die er niet is, wil je niet in een scherm hoeven naspelen.
 */

import type { Account, ServerStatus, Session } from './types';

/** Een hangend verzoek mag de app niet ophouden. */
const TIMEOUT_MS = 15_000;

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }

  /** Is dit 'je bent niet (meer) ingelogd'? Dan moet de app het token weggooien. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Geen verbinding: dat is iets anders dan een verkeerd wachtwoord. */
  get isOffline(): boolean {
    return this.status === 0;
  }
}

export type Fetcher = typeof fetch;

export class AuthClient {
  constructor(
    private readonly url: string,
    private readonly fetcher: Fetcher = (...args) => fetch(...args),
  ) {}

  status(): Promise<ServerStatus> {
    return this.call<ServerStatus>('GET', '/auth/status');
  }

  /** De allereerste keer: dit account wordt de eigenaar. */
  setup(input: { name: string; email: string; password: string; setupToken?: string }): Promise<Session> {
    return this.call<Session>('POST', '/auth/setup', input);
  }

  login(email: string, password: string): Promise<Session> {
    return this.call<Session>('POST', '/auth/login', { email, password });
  }

  async logout(token: string): Promise<void> {
    await this.call('POST', '/auth/logout', {}, token);
  }

  async me(token: string): Promise<Account> {
    const result = await this.call<{ user: Account }>('POST', '/auth/me', {}, token);
    return result.user;
  }

  async changePassword(token: string, currentPassword: string, newPassword: string): Promise<void> {
    await this.call('POST', '/auth/password', { currentPassword, newPassword }, token);
  }

  // ---------- Alleen voor de eigenaar ----------

  async users(token: string): Promise<Account[]> {
    const result = await this.call<{ users: Account[] }>('POST', '/admin/users', {}, token);
    return result.users ?? [];
  }

  async addUser(
    token: string,
    input: { name: string; email: string; password: string; role?: Account['role'] },
  ): Promise<Account> {
    const result = await this.call<{ user: Account }>('POST', '/admin/users/add', input, token);
    return result.user;
  }

  async removeUser(token: string, id: string): Promise<void> {
    await this.call('POST', '/admin/users/remove', { id }, token);
  }

  async resetPassword(token: string, id: string, password: string): Promise<void> {
    await this.call('POST', '/admin/users/password', { id, password }, token);
  }

  async changeRole(token: string, id: string, role: Account['role']): Promise<void> {
    await this.call('POST', '/admin/users/role', { id, role }, token);
  }

  private async call<T>(method: 'GET' | 'POST', path: string, body?: unknown, token?: string): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await this.fetcher(`${this.url.replace(/\/$/, '')}${path}`, {
        method,
        headers: {
          ...(method === 'POST' ? { 'content-type': 'application/json' } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
      if (!response.ok) {
        throw new AuthError(payload?.error ?? melding(response.status), response.status);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof AuthError) throw error;
      // Alles wat geen antwoord van de server is, is voor de app hetzelfde:
      // we konden er niet bij. Status 0 zegt dat, en dan weet het scherm dat
      // 'opnieuw proberen' zin heeft en 'wachtwoord controleren' niet.
      throw new AuthError('Geen verbinding met de server.', 0);
    } finally {
      clearTimeout(timer);
    }
  }
}

function melding(status: number): string {
  if (status === 401) return 'Niet (meer) ingelogd.';
  if (status === 403) return 'Dit mag je niet.';
  if (status === 429) return 'Te vaak geprobeerd. Wacht even.';
  return `Er ging iets mis op de server (${status}).`;
}
