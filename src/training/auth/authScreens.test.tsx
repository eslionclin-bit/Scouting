// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newId } from '../../domain/ids';
import { App } from '../app/App';
import { StoreProvider } from '../app/StoreProvider';
import { LibraryScreen } from '../app/screens/LibraryScreen';
import { ManageScreen } from '../app/screens/ManageScreen';
import { TrainingStore } from '../db/store';
import { AuthGate } from './AuthGate';
import { AuthProvider } from './AuthProvider';
import { makeExercise } from '../test/factory';
import { databaseFor, forgetDevice, saveDeviceSettings } from '../app/deviceSettings';
import { clearSession, saveSession } from './session';
import type { Account } from './types';

afterEach(() => {
  cleanup();
  clearSession();
  forgetDevice();
  vi.unstubAllGlobals();
});

const owner: Account = {
  id: 'account-eigenaar',
  email: 'marit@voorbeeld.nl',
  name: 'Marit',
  role: 'owner',
  createdAt: '2026-08-01T00:00:00.000Z',
  lastLoginAt: null,
};

const trainer: Account = { ...owner, id: 'account-trainer', email: 'joost@voorbeeld.nl', name: 'Joost', role: 'trainer' };

/**
 * Een deelserver van niks. De echte staat in `server/training`, en die heeft
 * zijn eigen tests; hier gaat het om wat de schermen ermee doen.
 */
function fakeServer(options: { setupNeeded?: boolean; users?: Account[] } = {}) {
  const calls: { path: string; body: unknown; token: string | null }[] = [];
  let users = options.users ?? [owner];
  // Wie de server terugmeldt bij '/auth/me'. In het echt hangt dat aan het
  // token; hier zetten de tests het, zodat 'iemand anders logt in op ditzelfde
  // apparaat' na te spelen is.
  let current: Account | null = null;

  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input).replace('https://server.test', '');
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const header = (init?.headers ?? {}) as Record<string, string>;
    calls.push({ path, body, token: header.authorization?.replace('Bearer ', '') ?? null });

    const json = (payload: unknown, status = 200) =>
      new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });

    switch (path) {
      case '/auth/status':
        return json({ setupNeeded: options.setupNeeded ?? false, users: users.length });
      case '/auth/login':
        if (body.password !== 'goedwachtwoord') {
          return json({ error: 'Dit adres en wachtwoord horen niet bij elkaar.' }, 401);
        }
        return json({ token: 'sessie-token', expiresAt: verloopt(), user: owner });
      case '/auth/setup':
        return json({ token: 'sessie-token', expiresAt: verloopt(), user: owner });
      case '/auth/me':
        return json({ user: current ?? users[0] ?? owner });
      case '/admin/users':
        return json({ users });
      case '/admin/users/add':
        users = [...users, { ...trainer, name: body.name, email: body.email }];
        return json({ user: users[users.length - 1] });
      case '/admin/users/remove':
        users = users.filter((user) => user.id !== body.id);
        return json({ ok: true });
      case '/share/pull':
        return json({ changes: [], cursor: '0', hasMore: false });
      case '/share/push':
        return json({ acceptedRevs: [] });
      default:
        return json({ error: 'Onbekend adres.' }, 404);
    }
  });

  vi.stubGlobal('fetch', fetcher);
  return {
    calls,
    get users() {
      return users;
    },
    actAs(user: Account) {
      current = user;
    },
  };
}

function verloopt(): string {
  return new Date(Date.now() + 30 * 86_400_000).toISOString();
}

async function openStore(serverUrl: string | null): Promise<TrainingStore> {
  saveDeviceSettings({ syncUrl: serverUrl });
  return TrainingStore.open({ name: `test-${newId()}`, deviceId: 'apparaat-a' });
}

function renderApp(store: TrainingStore, ui = <App />) {
  return render(
    <AuthProvider>
      <AuthGate>
        <StoreProvider store={store}>{ui}</StoreProvider>
      </AuthGate>
    </AuthProvider>,
  );
}

describe('de deur', () => {
  it('blijft open als er geen deelserver is ingesteld', async () => {
    const store = await openStore(null);
    renderApp(store);
    expect(await screen.findByRole('heading', { name: 'Vandaag' })).toBeTruthy();
    expect(screen.queryByLabelText('Wachtwoord')).toBeNull();
  });

  it('vraagt om inloggen zodra er een server is', async () => {
    fakeServer();
    const store = await openStore('https://server.test');
    renderApp(store);
    expect(await screen.findByRole('button', { name: 'Inloggen' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Vandaag' })).toBeNull();
  });

  it('biedt de eerste keer aan om eigenaar te worden', async () => {
    fakeServer({ setupNeeded: true, users: [] });
    const store = await openStore('https://server.test');
    renderApp(store);
    expect(await screen.findByRole('heading', { name: 'Zet je eigen account klaar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Account aanmaken' })).toBeTruthy();
  });

  it('laat de melding van de server zien bij een fout wachtwoord', async () => {
    fakeServer();
    const store = await openStore('https://server.test');
    renderApp(store);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('E-mailadres'), 'marit@voorbeeld.nl');
    await user.type(screen.getByLabelText('Wachtwoord'), 'ietsanders');
    await user.click(screen.getByRole('button', { name: 'Inloggen' }));

    expect(await screen.findByText('Dit adres en wachtwoord horen niet bij elkaar.')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Vandaag' })).toBeNull();
  });

  it('opent de app na een geslaagde inlog en neemt het account over als profiel', async () => {
    fakeServer();
    const store = await openStore('https://server.test');
    renderApp(store);
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('E-mailadres'), 'marit@voorbeeld.nl');
    await user.type(screen.getByLabelText('Wachtwoord'), 'goedwachtwoord');
    await user.click(screen.getByRole('button', { name: 'Inloggen' }));

    expect(await screen.findByRole('heading', { name: 'Vandaag' })).toBeTruthy();
    await waitFor(async () => {
      expect((await store.profile()).name).toBe('Marit');
    });
    expect((await store.profile()).id).toBe('account-eigenaar');
  });

  it('opent meteen met een bewaarde sessie, ook zonder verbinding', async () => {
    // Geen fetch die antwoordt: de server is onbereikbaar.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    saveSession({ token: 'sessie-token', expiresAt: verloopt(), user: owner });
    const store = await openStore('https://server.test');
    renderApp(store);
    expect(await screen.findByRole('heading', { name: 'Vandaag' })).toBeTruthy();
  });

  it('zet je eruit als de server zegt dat de sessie niet meer geldt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const path = String(input);
        if (path.endsWith('/auth/me')) {
          return new Response(JSON.stringify({ error: 'Niet ingelogd.' }), { status: 401 });
        }
        return new Response(JSON.stringify({ setupNeeded: false, users: 1 }), { status: 200 });
      }),
    );
    saveSession({ token: 'oud-token', expiresAt: verloopt(), user: owner });
    const store = await openStore('https://server.test');
    renderApp(store);
    expect(await screen.findByText('Je sessie is verlopen. Log opnieuw in.')).toBeTruthy();
  });
});

describe('de gebruikerspagina', () => {
  beforeEach(() => {
    saveSession({ token: 'sessie-token', expiresAt: verloopt(), user: owner });
  });

  it('staat er voor de eigenaar, met de accounts erin', async () => {
    fakeServer({ users: [owner, trainer] });
    const store = await openStore('https://server.test');
    renderApp(store, <ManageScreen />);

    expect(await screen.findByText(/Gebruikers · 2/)).toBeTruthy();
    expect(screen.getByText(/joost@voorbeeld\.nl/)).toBeTruthy();
  });

  it('blijft weg voor een trainer', async () => {
    fakeServer({ users: [trainer] });
    saveSession({ token: 'sessie-token', expiresAt: verloopt(), user: trainer });
    const store = await openStore('https://server.test');
    renderApp(store, <ManageScreen />);

    expect(await screen.findByRole('heading', { name: 'Je account' })).toBeTruthy();
    expect(screen.queryByText(/Gebruikers ·/)).toBeNull();
  });

  it('voegt iemand toe en toont het wachtwoord één keer', async () => {
    const server = fakeServer({ users: [owner] });
    const store = await openStore('https://server.test');
    renderApp(store, <ManageScreen />);
    const user = userEvent.setup();

    await screen.findByText(/Gebruikers · 1/);
    await user.type(screen.getByLabelText('Naam'), 'Joost');
    await user.type(screen.getByLabelText('E-mailadres'), 'joost@voorbeeld.nl');
    await user.type(screen.getByLabelText('Eerste wachtwoord'), 'welkom12345');
    await user.click(screen.getByRole('button', { name: 'Gebruiker toevoegen' }));

    await waitFor(() => expect(screen.getByText(/Account klaar voor/)).toBeTruthy());
    expect(screen.getByText('welkom12345')).toBeTruthy();
    const toegevoegd = server.calls.find((call) => call.path === '/admin/users/add');
    expect(toegevoegd?.body).toMatchObject({ email: 'joost@voorbeeld.nl', name: 'Joost' });
    expect(toegevoegd?.token).toBe('sessie-token');
    expect(await screen.findByText(/Gebruikers · 2/)).toBeTruthy();
  });

  it('verwijdert iemand na een bevestiging', async () => {
    const server = fakeServer({ users: [owner, trainer] });
    vi.stubGlobal('confirm', vi.fn(() => true));
    const store = await openStore('https://server.test');
    renderApp(store, <ManageScreen />);
    const user = userEvent.setup();

    await screen.findByText(/Gebruikers · 2/);
    await user.click(screen.getByRole('button', { name: 'Verwijderen' }));

    await waitFor(() =>
      expect(server.calls.some((call) => call.path === '/admin/users/remove')).toBe(true),
    );
    expect(await screen.findByText(/Gebruikers · 1/)).toBeTruthy();
  });

  it('laat je uitloggen, en vraagt daarna weer om een wachtwoord', async () => {
    fakeServer();
    const store = await openStore('https://server.test');
    renderApp(store);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Vandaag' });
    await user.click(screen.getByRole('link', { name: /Beheer/ }));
    await user.click(await screen.findByRole('button', { name: 'Uitloggen' }));

    expect(await screen.findByRole('button', { name: 'Inloggen' })).toBeTruthy();
  });
});

describe('elk account zijn eigen opslag', () => {
  it('geeft het eerste account de bestaande opslag en elk volgend account een eigen', () => {
    expect(databaseFor(null)).toBe('volley-training');
    // De eerste die inlogt erft wat er op dit apparaat al stond.
    expect(databaseFor('account-eigenaar')).toBe('volley-training');
    expect(databaseFor('account-eigenaar')).toBe('volley-training');
    // En wie daarna inlogt begint schoon.
    expect(databaseFor('account-trainer')).toBe('volley-training-account-trainer');
  });

  it('laat de tweede trainer niets zien van de eerste', async () => {
    const server = fakeServer({ users: [owner] });
    saveDeviceSettings({ syncUrl: 'https://server.test' });

    // Iets in de opslag van Marit zetten, langs de schermen om.
    const vanMarit = await TrainingStore.open({ name: databaseFor(owner.id), deviceId: 'apparaat-a' });
    const { id, rev, updatedAt, deletedAt, ...oefening } = makeExercise({
      title: 'Alleen van Marit',
      authorId: owner.id,
      authorName: 'Marit',
    });
    await vanMarit.exercises.create(oefening);
    vanMarit.close();

    saveSession({ token: 'sessie-token', expiresAt: verloopt(), user: owner });
    const { unmount } = render(
      <AuthProvider>
        <AuthGate>
          <StoreProvider>
            <LibraryScreen />
          </StoreProvider>
        </AuthGate>
      </AuthProvider>,
    );
    expect(await screen.findByText('Alleen van Marit')).toBeTruthy();
    unmount();

    saveSession({ token: 'sessie-token', expiresAt: verloopt(), user: trainer });
    server.actAs(trainer);
    render(
      <AuthProvider>
        <AuthGate>
          <StoreProvider>
            <LibraryScreen />
          </StoreProvider>
        </AuthGate>
      </AuthProvider>,
    );
    // De ingebouwde bank staat er wel; het werk van Marit niet.
    expect(await screen.findByText('Pepperen')).toBeTruthy();
    expect(screen.queryByText('Alleen van Marit')).toBeNull();
  });
});
