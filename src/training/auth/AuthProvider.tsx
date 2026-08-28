/**
 * Wie er is ingelogd, en of dat überhaupt gevraagd wordt.
 *
 * De regel is kort: is er een deelserver ingesteld, dan moet je inloggen; is
 * die er niet, dan is er niets om tegen te controleren en werkt de app zoals
 * hij altijd werkte — alles op dit apparaat.
 *
 * Eén ding is bewust anders dan gebruikelijk: een bewaarde sessie is genoeg om
 * de app te openen, ook zonder verbinding. De controle bij de server gebeurt
 * erna, op de achtergrond. Anders zou de app in een sporthal zonder bereik om
 * een wachtwoord vragen dat hij daar toch niet kan controleren — en juist daar
 * heb je hem nodig.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadDeviceSettings } from '../app/deviceSettings';
import { resolveServerUrl } from '../sync/serverUrl';
import { AuthClient, AuthError } from './client';
import { AUTH_EXPIRED_EVENT } from './events';
import { clearSession, loadSession, saveSession } from './session';
import type { Account, Session } from './types';

export { AUTH_EXPIRED_EVENT };

export type AuthState =
  /** Geen server ingesteld: geen inlog, alles blijft lokaal. */
  | { kind: 'solo' }
  | { kind: 'loading' }
  /** Server zonder accounts: de eerste die zich meldt wordt eigenaar. */
  | { kind: 'setup'; error: string | null }
  | { kind: 'anonymous'; error: string | null }
  | { kind: 'signed-in'; session: Session };

interface AuthContextValue {
  state: AuthState;
  account: Account | null;
  token: string | null;
  serverUrl: string | null;
  client: AuthClient | null;
  login: (email: string, password: string) => Promise<void>;
  setupOwner: (input: {
    name: string;
    email: string;
    password: string;
    setupToken?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // De inlog staat bóven de opslag: welke database er opengaat, hangt af van
  // wie er inlogt. Het adres van de server komt daarom van het apparaat zelf en
  // niet uit de database.
  const serverUrl = resolveServerUrl(loadDeviceSettings());
  const [state, setState] = useState<AuthState>({ kind: 'loading' });

  const client = useMemo(() => (serverUrl ? new AuthClient(serverUrl) : null), [serverUrl]);

  /**
   * Na het inloggen hoeft hier niets meer te gebeuren dan de sessie bewaren: de
   * opslaglaag ziet het account veranderen en opent de database die daarbij
   * hoort.
   */
  const adopt = useCallback(async (session: Session) => {
    saveSession(session);
    setState({ kind: 'signed-in', session });
  }, []);

  // Bij het openen bepalen waar we staan.
  useEffect(() => {
    let cancelled = false;

    if (!client) {
      setState({ kind: 'solo' });
      return;
    }

    const stored = loadSession();
    if (stored) {
      setState({ kind: 'signed-in', session: stored });
      // Achteraf navragen of de sessie nog geldt. Lukt dat niet omdat er geen
      // verbinding is, dan blijft hij staan: dat is precies waar een bewaarde
      // sessie voor is.
      client
        .me(stored.token)
        .then((user) => {
          if (cancelled) return;
          const session = { ...stored, user };
          saveSession(session);
          setState({ kind: 'signed-in', session });
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          if (error instanceof AuthError && error.isUnauthorized) {
            clearSession();
            setState({ kind: 'anonymous', error: 'Je sessie is verlopen. Log opnieuw in.' });
          }
        });
      return () => {
        cancelled = true;
      };
    }

    setState({ kind: 'loading' });
    client
      .status()
      .then((status) => {
        if (cancelled) return;
        setState(status.setupNeeded ? { kind: 'setup', error: null } : { kind: 'anonymous', error: null });
      })
      .catch(() => {
        if (cancelled) return;
        setState({
          kind: 'anonymous',
          error: 'Geen verbinding met de server. Probeer het zo nog eens.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [client]);

  // Merkt het delen dat de sessie niet meer geldig is, dan gaat het slot erop.
  useEffect(() => {
    const onExpired = () => {
      clearSession();
      setState({ kind: 'anonymous', error: 'Je sessie is verlopen. Log opnieuw in.' });
    };
    addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      if (!client) return;
      const session = await client.login(email, password);
      await adopt(session);
    },
    [adopt, client],
  );

  const setupOwner = useCallback(
    async (input: { name: string; email: string; password: string; setupToken?: string }) => {
      if (!client) return;
      const session = await client.setup(input);
      await adopt(session);
    },
    [adopt, client],
  );

  const logout = useCallback(async () => {
    const stored = loadSession();
    clearSession();
    setState(client ? { kind: 'anonymous', error: null } : { kind: 'solo' });
    // Het token bij de server intrekken mag mislukken (geen verbinding); op dit
    // apparaat is het hoe dan ook weg.
    if (client && stored) await client.logout(stored.token).catch(() => undefined);
  }, [client]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const stored = loadSession();
      if (!client || !stored) throw new AuthError('Niet ingelogd.', 401);
      await client.changePassword(stored.token, currentPassword, newPassword);
    },
    [client],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      account: state.kind === 'signed-in' ? state.session.user : null,
      token: state.kind === 'signed-in' ? state.session.token : null,
      serverUrl,
      client,
      login,
      setupOwner,
      logout,
      changePassword,
    }),
    [changePassword, client, login, logout, serverUrl, setupOwner, state],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth buiten een AuthProvider gebruikt.');
  return value;
}
