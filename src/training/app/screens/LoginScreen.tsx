/**
 * Het inlogscherm, en de eerste keer meteen ook het scherm waarop de eigenaar
 * zichzelf aanmaakt.
 *
 * Twee schermen in één bestand omdat het één moment is: je komt hier omdat je
 * er nog niet in bent, en of dat komt doordat de server nog leeg is of doordat
 * je nog niet bent ingelogd, is voor de bouw van het scherm het enige verschil.
 */

import { useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { AuthError } from '../../auth/client';
import { Field } from '../components/ui';

export function LoginScreen() {
  const { state, login, setupOwner, serverUrl } = useAuth();
  const first = state.kind === 'setup';

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [setupToken, setSetupToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const known = state.kind === 'setup' || state.kind === 'anonymous' ? state.error : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (first && password !== again) {
      setError('De twee wachtwoorden zijn niet hetzelfde.');
      return;
    }

    setBusy(true);
    try {
      if (first) {
        await setupOwner({
          name,
          email,
          password,
          ...(setupToken.trim() ? { setupToken: setupToken.trim() } : {}),
        });
      } else {
        await login(email, password);
      }
    } catch (cause) {
      setError(cause instanceof AuthError ? cause.message : 'Inloggen lukte niet.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        <h1>{first ? 'Zet je eigen account klaar' : 'Volleybal training'}</h1>

        {first ? (
          <p className="muted">
            Op deze server staat nog geen enkel account. Wie zich hier als eerste aanmeldt, wordt de
            eigenaar en kan daarna de andere trainers toevoegen. Doe dit meteen, zodat niemand
            anders je voor is.
          </p>
        ) : (
          <p className="muted">Log in met het adres en het wachtwoord dat je van je trainer kreeg.</p>
        )}

        {first && (
          <Field label="Je naam">
            <input
              className="input"
              value={name}
              autoComplete="name"
              required
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
        )}

        <Field label="E-mailadres">
          <input
            className="input"
            type="email"
            value={email}
            autoComplete="username"
            required
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>

        <Field label="Wachtwoord" hint={first ? 'Minstens tien tekens.' : undefined}>
          <input
            className="input"
            type="password"
            value={password}
            autoComplete={first ? 'new-password' : 'current-password'}
            required
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>

        {first && (
          <>
            <Field label="Nog een keer">
              <input
                className="input"
                type="password"
                value={again}
                autoComplete="new-password"
                required
                onChange={(event) => setAgain(event.target.value)}
              />
            </Field>
            <Field
              label="Code voor de eerste keer"
              hint="Alleen invullen als je bij het uitrollen een SETUP_TOKEN hebt ingesteld."
            >
              <input
                className="input"
                value={setupToken}
                onChange={(event) => setSetupToken(event.target.value)}
              />
            </Field>
          </>
        )}

        {(error ?? known) && <p className="warning warning--blocking">{error ?? known}</p>}

        <button type="submit" className="button button--primary login__submit" disabled={busy}>
          {busy ? 'Bezig…' : first ? 'Account aanmaken' : 'Inloggen'}
        </button>

        <p className="muted login__server">
          Server: {serverUrl}
          <br />
          Je gegevens staan op dit apparaat; inloggen bepaalt wie de app mag gebruiken en met wie je
          kunt delen.
        </p>
      </form>
    </div>
  );
}
