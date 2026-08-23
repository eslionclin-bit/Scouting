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
import { describeRoles, rolesOf, PLAYER_ROLES, PLAYER_ROLE_LABELS } from '../../domain/players';
import type { Player, PlayerRole } from '../../domain/types';
import { useQuery, useStore } from '../StoreProvider';

export interface SquadProps {
  teamId: string;
  /** Kop boven de lijst; bij de tegenstander heet het anders dan bij ons. */
  title?: string;
  /** Regel eronder. Standaard die van de eigen selectie. */
  hint?: string;
}

interface Draft {
  number: string;
  name: string;
  /**
   * Alle posities die ze kan spelen, in de volgorde waarin ze zijn aangetikt.
   *
   * Er stond eerst een keuzelijst voor 'de' positie én knopjes voor de rest.
   * Twee plekken om hetzelfde te zeggen, en dan is het niet duidelijk welke
   * telt. Nu is er één rij knoppen: de eerste die je aantikt is de positie waar
   * ze normaal staat, de rest kan ze er ook bij.
   */
  roles: PlayerRole[];
}

const EMPTY: Draft = { number: '', name: '', roles: [] };

/** Aantikken zet hem erbij of haalt hem eraf; de volgorde blijft. */
function toggle(roles: readonly PlayerRole[], role: PlayerRole): PlayerRole[] {
  return roles.includes(role) ? roles.filter((entry) => entry !== role) : [...roles, role];
}

export function Squad({ teamId, title, hint }: SquadProps): ReactElement {
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
        // De eerste is waar ze normaal staat; de opslag zet hem sowieso in de
        // lijst, dus die twee kunnen niet uit elkaar lopen.
        role: draft.roles[0] ?? null,
        roles: draft.roles,
      });
      setDraft(EMPTY);
    });
  }

  return (
    <section className="card">
      <h2>{title ?? 'Selectie'}</h2>
      <p className="card__hint">
        {hint ??
          'Wie erin zit, met haar rugnummer en posities. Kan iemand meer dan één positie, tik ze er dan bij aan — dat beperkt niets aan wat je kunt invoeren, maar het laat zien wie er inzetbaar is als er iemand uitvalt.'}
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
        <RoleChips
          label="Posities nieuwe speelster"
          picked={draft.roles}
          onToggle={(role) =>
            setDraft((current) => ({ ...current, roles: toggle(current.roles, role) }))
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
  onSave: (patch: {
    number: number;
    name: string;
    role: PlayerRole | null;
    roles: PlayerRole[];
  }) => void;
  onCancel: () => void;
}

function PlayerForm({ player, busy, onSave, onCancel }: PlayerFormProps): ReactElement {
  const [draft, setDraft] = useState<Draft>({
    number: String(player.number),
    name: player.name,
    roles: [...rolesOf(player)],
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
        <RoleChips
          label={`Posities van ${player.name || `#${player.number}`}`}
          picked={draft.roles}
          onToggle={(role) =>
            setDraft((current) => ({ ...current, roles: toggle(current.roles, role) }))
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
              role: draft.roles[0] ?? null,
              roles: draft.roles,
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

/**
 * Eén rij knoppen voor alle posities.
 *
 * De eerste die je aantikt krijgt een merkteken: dat is waar ze normaal staat.
 * Dat onderscheid komt uit de volgorde en niet uit een tweede invoerveld —
 * anders staat er twee keer hetzelfde en weet je niet welke telt.
 */
function RoleChips({
  label,
  picked,
  onToggle,
}: {
  label: string;
  picked: readonly PlayerRole[];
  onToggle: (role: PlayerRole) => void;
}): ReactElement {
  return (
    <div className="roster__extra" role="group" aria-label={label}>
      {PLAYER_ROLES.map((role) => {
        const at = picked.indexOf(role);
        const on = at >= 0;
        return (
          <button
            key={role}
            type="button"
            className={`chip ${on ? 'chip--active' : ''}`}
            aria-pressed={on}
            aria-label={`${PLAYER_ROLE_LABELS[role]}, ${label}`}
            onClick={() => onToggle(role)}
          >
            {PLAYER_ROLE_LABELS[role]}
            {at === 0 && <span className="chip__main"> · normaal</span>}
          </button>
        );
      })}
    </div>
  );
}
