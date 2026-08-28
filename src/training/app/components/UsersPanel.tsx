/**
 * De gebruikerspagina van de eigenaar: wie mag er in de app.
 *
 * Alleen zichtbaar voor wie eigenaar is, en hij haalt zijn lijst rechtstreeks
 * bij de server op — niet uit de lokale opslag. Accounts horen nergens anders te
 * staan dan op de server die ze controleert; een kopietje op een telefoon zou
 * alleen maar kunnen gaan afwijken.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { AuthError } from '../../auth/client';
import type { Account } from '../../auth/types';
import { Field, Panel } from './ui';

export function UsersPanel() {
  const { client, token, account } = useAuth();
  const [users, setUsers] = useState<Account[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'trainer' as Account['role'] });
  const [made, setMade] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    if (!client || !token) return;
    try {
      setUsers(await client.users(token));
      setError(null);
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : 'De lijst kon niet worden opgehaald.');
    }
  }, [client, token]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!client || !token || account?.role !== 'owner') return null;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : 'Dat lukte niet.');
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const input = { ...form, email: form.email.trim(), name: form.name.trim() };
    await run(async () => {
      await client!.addUser(token!, input);
      setMade({ email: input.email, password: input.password });
      setForm({ name: '', email: '', password: '', role: 'trainer' });
    });
  }

  return (
    <Panel title={`Gebruikers · ${users?.length ?? 0}`}>
      <p className="muted">
        Alleen jij kunt hier accounts aanmaken en weghalen; er is geen aanmeldpagina. Geef een nieuw
        wachtwoord persoonlijk door en laat de trainer het daarna zelf veranderen.
      </p>

      {error && <p className="warning warning--blocking">{error}</p>}

      <ul className="list">
        {(users ?? []).map((user) => (
          <li key={user.id} className="list__item list__item--column">
            <div className="squad__row">
              <span className="list__title">
                {user.name}
                {user.role === 'owner' && <span className="tag">eigenaar</span>}
                {user.id === account.id && <span className="tag">jij</span>}
              </span>
            </div>
            <p className="muted">
              {user.email} ·{' '}
              {user.lastLoginAt
                ? `laatst ingelogd ${new Date(user.lastLoginAt).toLocaleDateString('nl-NL')}`
                : 'nog nooit ingelogd'}
            </p>
            <div className="row row--wrap">
              <button
                type="button"
                className="button button--ghost"
                disabled={busy}
                onClick={() => {
                  const password = prompt(`Nieuw wachtwoord voor ${user.name} (minstens 10 tekens)`);
                  if (!password) return;
                  void run(() => client.resetPassword(token, user.id, password));
                }}
              >
                Wachtwoord opnieuw
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={busy}
                onClick={() =>
                  void run(() =>
                    client.changeRole(token, user.id, user.role === 'owner' ? 'trainer' : 'owner'),
                  )
                }
              >
                {user.role === 'owner' ? 'Geen eigenaar meer' : 'Ook eigenaar maken'}
              </button>
              {user.id !== account.id && (
                <button
                  type="button"
                  className="button button--danger"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm(`${user.name} verwijderen? Hij kan daarna niet meer inloggen.`)) return;
                    void run(() => client.removeUser(token, user.id));
                  }}
                >
                  Verwijderen
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <h3>Iemand toevoegen</h3>
      <div className="grid grid--form">
        <Field label="Naam">
          <input
            className="input"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </Field>
        <Field label="E-mailadres">
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </Field>
        <Field label="Eerste wachtwoord" hint="Minstens tien tekens.">
          <input
            className="input"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </Field>
        <Field label="Rol">
          <select
            className="input"
            value={form.role}
            onChange={(event) => setForm({ ...form, role: event.target.value as Account['role'] })}
          >
            <option value="trainer">Trainer</option>
            <option value="owner">Eigenaar</option>
          </select>
        </Field>
      </div>
      <button type="button" className="button button--primary" disabled={busy} onClick={add}>
        {busy ? 'Bezig…' : 'Gebruiker toevoegen'}
      </button>

      {made && (
        <p className="warning warning--notice">
          Account klaar voor <strong>{made.email}</strong>. Geef dit wachtwoord door:{' '}
          <code>{made.password}</code> — het staat hier alleen nu, daarna is het niet meer op te
          vragen.
        </p>
      )}
    </Panel>
  );
}
