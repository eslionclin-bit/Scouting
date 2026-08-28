/**
 * Beheer: je team, je groepen en het delen.
 *
 * Alles wat je één keer invult en daarna nauwelijks aanraakt. Het team staat
 * bovenaan, want dat is het enige dat je echt nodig hebt voordat de rest van de
 * app iets kan: zonder speelsters valt er niets af te vinken en niets te
 * verdelen.
 */

import { useState } from 'react';
import { useAuth } from '../../auth/AuthProvider';
import { AuthError } from '../../auth/client';
import { UsersPanel } from '../components/UsersPanel';
import { newGroupCode, normalizeGroupCode } from '../../sync/scopes';
import { POSITIONS, POSITION_LABELS, type Player, type Position } from '../../domain/types';
import { useStore } from '../StoreProvider';
import { DraftInput, Field, Panel } from '../components/ui';

export function ManageScreen() {
  const { store, data, sync, syncNow } = useStore();
  const { account, logout, changePassword, serverUrl } = useAuth();
  const [newPlayer, setNewPlayer] = useState({ name: '', number: '' });
  const [joinCode, setJoinCode] = useState('');
  const [joinName, setJoinName] = useState('');
  const [passwords, setPasswords] = useState({ current: '', next: '' });
  const [passwordNote, setPasswordNote] = useState<string | null>(null);

  const team = data.teams[0] ?? null;
  const squad = [...data.players].sort((a, b) => (a.number ?? 99) - (b.number ?? 99));

  async function ensureTeam(): Promise<string> {
    if (team) return team.id;
    const created = await store.teams.create({
      name: 'Mijn team',
      season: null,
      notes: null,
      authorId: data.profile.id,
      authorName: data.profile.name,
    });
    await store.saveSettings({ activeTeamId: created.id });
    return created.id;
  }

  async function addPlayer() {
    const name = newPlayer.name.trim();
    if (!name) return;
    const teamId = await ensureTeam();
    await store.players.create({
      teamId,
      name,
      number: newPlayer.number === '' ? null : Number(newPlayer.number),
      positions: [],
      active: true,
      notes: null,
      authorId: data.profile.id,
      authorName: data.profile.name,
    });
    setNewPlayer({ name: '', number: '' });
  }

  async function togglePosition(player: Player, position: Position) {
    const positions = player.positions.includes(position)
      ? player.positions.filter((item) => item !== position)
      : [...player.positions, position];
    await store.players.update(player.id, { positions });
  }

  async function createGroup() {
    await store.groups.create({
      name: 'Trainers',
      code: newGroupCode(),
      members: [
        { userId: data.profile.id, name: data.profile.name, joinedAt: new Date().toISOString() },
      ],
      notes: null,
      authorId: data.profile.id,
      authorName: data.profile.name,
    });
  }

  async function joinGroup() {
    const code = normalizeGroupCode(joinCode);
    if (code.length < 16) return;
    await store.groups.create({
      name: joinName.trim() || 'Groep',
      code,
      members: [
        { userId: data.profile.id, name: data.profile.name, joinedAt: new Date().toISOString() },
      ],
      notes: null,
      authorId: data.profile.id,
      authorName: data.profile.name,
    });
    setJoinCode('');
    setJoinName('');
    await syncNow();
  }

  return (
    <div className="screen">
      <h1>Beheer</h1>

      {account ? (
        <Panel title="Je account">
          <p>
            <strong>{account.name}</strong>{' '}
            {account.role === 'owner' && <span className="tag">eigenaar</span>}
            <br />
            <span className="muted">{account.email}</span>
          </p>

          <h3>Wachtwoord wijzigen</h3>
          <div className="grid grid--form">
            <Field label="Huidig wachtwoord">
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={passwords.current}
                onChange={(event) => setPasswords({ ...passwords, current: event.target.value })}
              />
            </Field>
            <Field label="Nieuw wachtwoord" hint="Minstens tien tekens.">
              <input
                className="input"
                type="password"
                autoComplete="new-password"
                value={passwords.next}
                onChange={(event) => setPasswords({ ...passwords, next: event.target.value })}
              />
            </Field>
          </div>
          {passwordNote && <p className="warning warning--notice">{passwordNote}</p>}
          <div className="row row--wrap">
            <button
              type="button"
              className="button"
              onClick={async () => {
                setPasswordNote(null);
                try {
                  await changePassword(passwords.current, passwords.next);
                  setPasswords({ current: '', next: '' });
                  setPasswordNote('Gelukt. Op je andere apparaten moet je opnieuw inloggen.');
                } catch (cause) {
                  setPasswordNote(
                    cause instanceof AuthError ? cause.message : 'Het wachtwoord is niet gewijzigd.',
                  );
                }
              }}
            >
              Wachtwoord wijzigen
            </button>
            <button type="button" className="button button--ghost" onClick={() => void logout()}>
              Uitloggen
            </button>
          </div>
        </Panel>
      ) : (
        <Panel title="Wie ben jij">
          <Field
            label="Naam"
            hint={
              serverUrl
                ? 'Staat als auteur op alles wat je deelt.'
                : 'Staat als auteur op alles wat je deelt. Er is geen deelserver ingesteld, dus er is ook niets om op in te loggen.'
            }
          >
            <DraftInput
              className="input"
              value={data.profile.name}
              onCommit={(name) => void store.setProfileName(name)}
            />
          </Field>
        </Panel>
      )}

      <Panel title={`Team · ${squad.length} speelsters`}>
        {team && (
          <Field label="Teamnaam">
            <DraftInput
              className="input"
              value={team.name}
              onCommit={(name) => void store.teams.update(team.id, { name })}
            />
          </Field>
        )}

        <ul className="squad">
          {squad.map((player) => (
            <li key={player.id} className={`squad__item ${player.active ? '' : 'is-inactive'}`}>
              <div className="squad__row">
                <DraftInput
                  className="input input--tiny"
                  type="number"
                  value={player.number === null ? '' : String(player.number)}
                  aria-label="Rugnummer"
                  onCommit={(value) =>
                    void store.players.update(player.id, {
                      number: value.trim() === '' ? null : Number(value),
                    })
                  }
                />
                <DraftInput
                  className="input"
                  value={player.name}
                  aria-label="Naam"
                  onCommit={(name) => void store.players.update(player.id, { name })}
                />
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void store.players.update(player.id, { active: !player.active })}
                >
                  {player.active ? 'In selectie' : 'Uit selectie'}
                </button>
                <button
                  type="button"
                  className="button button--icon"
                  aria-label={`${player.name} weghalen`}
                  onClick={() => {
                    if (confirm(`${player.name} weghalen?`)) void store.players.remove(player.id);
                  }}
                >
                  ×
                </button>
              </div>
              <div className="chips">
                {POSITIONS.map((position) => (
                  <button
                    key={position}
                    type="button"
                    className={`chip ${player.positions.includes(position) ? 'is-active' : ''}`}
                    onClick={() => void togglePosition(player, position)}
                  >
                    {POSITION_LABELS[position]}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>

        <div className="row">
          <input
            className="input input--tiny"
            type="number"
            placeholder="nr"
            value={newPlayer.number}
            aria-label="Rugnummer"
            onChange={(event) => setNewPlayer({ ...newPlayer, number: event.target.value })}
          />
          <input
            className="input"
            placeholder="Naam"
            value={newPlayer.name}
            aria-label="Naam nieuwe speelster"
            onChange={(event) => setNewPlayer({ ...newPlayer, name: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void addPlayer();
            }}
          />
          <button type="button" className="button button--primary" onClick={addPlayer}>
            Toevoegen
          </button>
        </div>
        <p className="muted">
          Posities zijn optioneel. Ze doen mee zodra een oefening erom vraagt — bijvoorbeeld een
          spelverdeler per groep.
        </p>
      </Panel>

      <Panel title="Groepen">
        {data.groups.length === 0 && (
          <p className="muted">
            Een groep is een handjevol trainers dat oefeningen en reeksen deelt. Maak er een en geef
            de code door, of vul de code in die je gekregen hebt.
          </p>
        )}

        <ul className="list">
          {data.groups.map((group) => (
            <li key={group.id} className="list__item list__item--column">
              <DraftInput
                className="input"
                value={group.name}
                aria-label="Groepsnaam"
                onCommit={(name) => void store.groups.update(group.id, { name })}
              />
              <p className="code">
                <code>{group.code}</code>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => void navigator.clipboard?.writeText(group.code)}
                >
                  Kopiëren
                </button>
              </p>
              <p className="muted">
                {group.members.length} {group.members.length === 1 ? 'lid' : 'leden'}:{' '}
                {group.members.map((member) => member.name).join(', ')}
              </p>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  if (confirm(`Uit ${group.name} stappen?`)) void store.groups.remove(group.id);
                }}
              >
                Uit deze groep
              </button>
            </li>
          ))}
        </ul>

        <div className="row row--wrap">
          <button type="button" className="button" onClick={createGroup}>
            Nieuwe groep
          </button>
          <input
            className="input"
            placeholder="Naam"
            value={joinName}
            aria-label="Naam van de groep waar je bij komt"
            onChange={(event) => setJoinName(event.target.value)}
          />
          <input
            className="input"
            placeholder="Code van een groep"
            value={joinCode}
            aria-label="Groepscode"
            onChange={(event) => setJoinCode(event.target.value)}
          />
          <button type="button" className="button" onClick={joinGroup} disabled={joinCode.length < 16}>
            Aansluiten
          </button>
        </div>
      </Panel>

      <UsersPanel />

      <Panel title="Delen">
        <p className="muted">
          {serverUrl
            ? `Deze app praat met ${serverUrl}.`
            : 'Er is geen deelserver ingesteld: alles blijft op dit apparaat, en er valt niets in te loggen.'}
        </p>

        <Field
          label="Ander adres gebruiken"
          hint="Leeg laten betekent: het adres dat bij het bouwen is meegegeven, of anders geen server."
        >
          <DraftInput
            className="input"
            placeholder="https://…"
            value={data.settings.syncUrl ?? ''}
            onCommit={(url) => void store.saveSettings({ syncUrl: url.trim() || null })}
          />
        </Field>

        <label className="checkline">
          <input
            type="checkbox"
            checked={data.settings.followPublic}
            onChange={(event) => void store.saveSettings({ followPublic: event.target.checked })}
          />
          Openbare oefeningen van anderen ophalen
        </label>

        <div className="row">
          <button type="button" className="button" onClick={() => void syncNow()}>
            Nu delen en ophalen
          </button>
          <span className="muted">
            {sync.status === 'off' && 'Geen server ingevuld.'}
            {sync.status === 'syncing' && 'Bezig…'}
            {sync.status === 'idle' && `Bijgewerkt${sync.received ? `, ${sync.received} binnengekomen` : ''}.`}
            {sync.status === 'error' && `Niet gelukt: ${sync.lastError}`}
            {sync.pending > 0 && ` ${sync.pending} nog te versturen.`}
          </span>
        </div>
      </Panel>
    </div>
  );
}
