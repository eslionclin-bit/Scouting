/**
 * De selectie: wie er in het team zitten.
 *
 * Spelers waren tot nu toe alleen toe te voegen bij het opzetten van een
 * wedstrijd. Dat is de verkeerde plek: er komt iemand bij op een dinsdag, en
 * dan wil je haar erin zetten zonder een wedstrijd te verzinnen. En een
 * rugnummer dat verkeerd is ingetikt bleef verkeerd.
 *
 * Niemand wordt hier echt weggegooid. Wie stopt gaat uit de selectie, en haar
 * cijfers blijven staan — die horen bij de wedstrijden waarin ze speelde, en
 * die zijn niet minder waar geworden.
 */

import { useState, type ReactElement } from 'react';
import { describeRoles, primaryRoleOf, rolesOf, PLAYER_ROLES, PLAYER_ROLE_LABELS } from '../../domain/players';
import type { Player, PlayerRole } from '../../domain/types';
import { useQuery, useStore } from '../StoreProvider';

export interface SquadProps {
  teamId: string;
}

interface Draft {
  number: string;
  name: string;
  role: PlayerRole | '';
  extra: PlayerRole[];
}

const EMPTY: Draft = { number: '', name: '', role: '', extra: [] };

export function Squad({ teamId }: SquadProps): ReactElement {
  const store = useStore();
  const { data: players } = useQuery(
    async (instance) => instance.players.listByTeam(teamId, { includeInactive: true }),
    [teamId],
  );

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<unknown>): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      // Een dubbel rugnummer is de enige fout die hier echt voorkomt, en de
      // opslag zegt daar zelf een bruikbare zin over.
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function add(): Promise<void> {
    const number = Number.parseInt(draft.number, 10);
    if (!Number.isInteger(number)) return;
    await run(async () => {
      await store.players.create({
        teamId,
        number,
        name: draft.name.trim(),
        role: draft.role || null,
        roles: draft.extra,
      });
      setDraft(EMPTY);
    });
  }

  return (
    <section className="card">
      <h2>Selectie</h2>
      <p className="card__hint">
        Wie erin zit, met haar rugnummer en posities. Kan iemand meer dan één positie, tik ze er dan
        bij aan — dat beperkt niets aan wat je kunt invoeren, maar het laat zien wie er inzetbaar is
        als er iemand uitvalt.
      </p>

      <ul className="squad">
        {(players ?? []).map((player) =>
          editing === player.id ? (
            <li key={player.id} className="squad__item">
              <PlayerForm
                player={player}
                busy={busy}
                onCancel={() => setEditing(null)}
                onSave={(patch) =>
                  void run(async () => {
                    await store.players.update(player.id, patch);
                    setEditing(null);
                  })
                }
              />
            </li>
          ) : (
            <li key={player.id} className={`squad__item ${player.active ? '' : 'squad__item--gone'}`}>
              <div className="squad__who">
                <strong>
                  <span className="stats__number">#{player.number}</span> {player.name || '—'}
                </strong>
                <span className="settings__hint">
                  {describeRoles(player) || 'geen positie ingevuld'}
                  {player.active ? '' : ' · niet meer in de selectie'}
                </span>
              </div>
              <div className="squad__actions">
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => setEditing(player.id)}
                >
                  Aanpassen
                </button>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(() => store.players.update(player.id, { active: !player.active }))
                  }
                >
                  {player.active ? 'Uit de selectie' : 'Terug in de selectie'}
                </button>
              </div>
            </li>
          ),
        )}
        {players?.length === 0 && (
          <li className="squad__item">
            <span className="settings__hint">Nog niemand. Voeg hieronder de eerste toe.</span>
          </li>
        )}
      </ul>

      <h3 className="sheet__subtitle">Speelster toevoegen</h3>
      <div className="roster__row">
        <input
          className="roster__number"
          inputMode="numeric"
          value={draft.number}
          onChange={(event) => setDraft((current) => ({ ...current, number: event.target.value }))}
          placeholder="#"
          aria-label="Rugnummer nieuwe speelster"
        />
        <input
          className="roster__name"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          placeholder="Naam"
          aria-label="Naam nieuwe speelster"
        />
        <select
          className="roster__role"
          value={draft.role}
          onChange={(event) =>
            setDraft((current) => ({ ...current, role: event.target.value as PlayerRole | '' }))
          }
          aria-label="Positie nieuwe speelster"
        >
          <option value="">Positie</option>
          {PLAYER_ROLES.map((role) => (
            <option key={role} value={role}>
              {PLAYER_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <RoleChips
          label="Kan ook, nieuwe speelster"
          exclude={draft.role}
          picked={draft.extra}
          onToggle={(role) =>
            setDraft((current) => ({
              ...current,
              extra: current.extra.includes(role)
                ? current.extra.filter((entry) => entry !== role)
                : [...current.extra, role],
            }))
          }
        />
      </div>
      <button
        type="button"
        className="button button--primary"
        disabled={busy || !Number.isInteger(Number.parseInt(draft.number, 10))}
        onClick={() => void add()}
      >
        Toevoegen
      </button>

      {error && <p className="setup__error">{error}</p>}
    </section>
  );
}

interface PlayerFormProps {
  player: Player;
  busy: boolean;
  onSave: (patch: { number: number; name: string; role: PlayerRole | null; roles: PlayerRole[] }) => void;
  onCancel: () => void;
}

function PlayerForm({ player, busy, onSave, onCancel }: PlayerFormProps): ReactElement {
  const main = primaryRoleOf(player);
  const [draft, setDraft] = useState<Draft>({
    number: String(player.number),
    name: player.name,
    role: main ?? '',
    extra: rolesOf(player).filter((role) => role !== main),
  });

  const number = Number.parseInt(draft.number, 10);

  return (
    <>
      <div className="roster__row">
        <input
          className="roster__number"
          inputMode="numeric"
          value={draft.number}
          onChange={(event) => setDraft((current) => ({ ...current, number: event.target.value }))}
          aria-label={`Rugnummer van ${player.name || `#${player.number}`}`}
        />
        <input
          className="roster__name"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
          aria-label={`Naam van ${player.name || `#${player.number}`}`}
        />
        <select
          className="roster__role"
          value={draft.role}
          onChange={(event) =>
            setDraft((current) => ({ ...current, role: event.target.value as PlayerRole | '' }))
          }
          aria-label={`Positie van ${player.name || `#${player.number}`}`}
        >
          <option value="">Positie</option>
          {PLAYER_ROLES.map((role) => (
            <option key={role} value={role}>
              {PLAYER_ROLE_LABELS[role]}
            </option>
          ))}
        </select>
        <RoleChips
          label={`Kan ook, ${player.name || `#${player.number}`}`}
          exclude={draft.role}
          picked={draft.extra}
          onToggle={(role) =>
            setDraft((current) => ({
              ...current,
              extra: current.extra.includes(role)
                ? current.extra.filter((entry) => entry !== role)
                : [...current.extra, role],
            }))
          }
        />
      </div>
      <div className="step__actions">
        <button
          type="button"
          className="button button--primary"
          disabled={busy || !Number.isInteger(number)}
          onClick={() =>
            onSave({
              number,
              name: draft.name.trim(),
              role: draft.role || null,
              roles: draft.extra,
            })
          }
        >
          Bewaren
        </button>
        <button type="button" className="button button--ghost" onClick={onCancel}>
          Annuleren
        </button>
      </div>
    </>
  );
}

function RoleChips({
  label,
  exclude,
  picked,
  onToggle,
}: {
  label: string;
  exclude: PlayerRole | '';
  picked: readonly PlayerRole[];
  onToggle: (role: PlayerRole) => void;
}): ReactElement {
  return (
    <div className="roster__extra" role="group" aria-label={label}>
      {PLAYER_ROLES.filter((role) => role !== exclude).map((role) => {
        const on = picked.includes(role);
        return (
          <button
            key={role}
            type="button"
            className={`chip ${on ? 'chip--active' : ''}`}
            aria-pressed={on}
            aria-label={`${PLAYER_ROLE_LABELS[role]} erbij, ${label}`}
            onClick={() => onToggle(role)}
          >
            {PLAYER_ROLE_LABELS[role]}
          </button>
        );
      })}
    </div>
  );
}
