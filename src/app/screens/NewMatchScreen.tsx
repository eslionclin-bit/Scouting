/**
 * Wedstrijd opzetten: eigen team met spelers, tegenstander en datum.
 *
 * Wie begint met serveren staat hier bewust níét: dat weet je pas na de toss aan
 * het eind van de warming-up. Die vraag komt in het invoerscherm, vlak voor de
 * eerste rally.
 *
 * De spelers blijven bewaard bij het team, dus na de eerste keer hoeft er
 * alleen nog een tegenstander ingevuld te worden.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { PLAYER_ROLES, PLAYER_ROLE_LABELS } from '../../domain/players';
import type { PlayerRole } from '../../domain/types';
import { useQuery, useStore } from '../StoreProvider';

export interface NewMatchScreenProps {
  onCreated: (matchId: string) => void;
  onCancel: () => void;
}

interface PlayerRow {
  number: string;
  name: string;
  role?: PlayerRole | '';
}

const EMPTY_ROWS: PlayerRow[] = Array.from({ length: 8 }, () => ({ number: '', name: '', role: '' }));
const EMPTY_OPPONENT_ROWS: PlayerRow[] = Array.from({ length: 6 }, () => ({ number: '', name: '' }));

/** Het team waar deze app voor gemaakt is; aan te passen voor elk ander team. */
const DEFAULT_TEAM_NAME = 'VCH DS 1';

export function NewMatchScreen({ onCreated, onCancel }: NewMatchScreenProps): ReactElement {
  const store = useStore();
  const [ownTeamName, setOwnTeamName] = useState(DEFAULT_TEAM_NAME);
  const [opponentName, setOpponentName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [homeAway, setHomeAway] = useState<'home' | 'away'>('home');
  const [rows, setRows] = useState<PlayerRow[]>(EMPTY_ROWS);
  const [opponentRows, setOpponentRows] = useState<PlayerRow[]>(EMPTY_OPPONENT_ROWS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: existing } = useQuery(async (instance) => {
    const ownTeam = await instance.teams.ownTeam();
    const players = ownTeam ? await instance.players.listByTeam(ownTeam.id) : [];
    return { ownTeam, players };
  }, []);

  // Een bestaand eigen team is de normale situatie: dan hoeft alleen de
  // tegenstander nog ingevuld te worden.
  useEffect(() => {
    if (!existing?.ownTeam) return;
    setOwnTeamName(existing.ownTeam.name);
    setRows(
      existing.players.length > 0
        ? existing.players.map((player) => ({
          number: String(player.number),
          name: player.name,
          role: player.role ?? '',
        }))
        : EMPTY_ROWS,
    );
  }, [existing]);

  function updateRow(index: number, patch: Partial<PlayerRow>): void {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function updateOpponentRow(index: number, patch: Partial<PlayerRow>): void {
    setOpponentRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function save(): Promise<void> {
    setError(null);
    if (!ownTeamName.trim()) return setError('Vul de naam van het eigen team in.');
    if (!opponentName.trim()) return setError('Vul de naam van de tegenstander in.');

    setSaving(true);
    try {
      const ownTeam =
        existing?.ownTeam ?? (await store.teams.create({ name: ownTeamName.trim(), isOwnTeam: true }));
      if (existing?.ownTeam && existing.ownTeam.name !== ownTeamName.trim()) {
        await store.teams.update(ownTeam.id, { name: ownTeamName.trim() });
      }

      const known = new Map((existing?.players ?? []).map((player) => [player.number, player]));
      const newPlayers = rows
        .map((row) => ({
          number: Number(row.number),
          name: row.name.trim(),
          role: row.role || null,
        }))
        .filter((row) => Number.isInteger(row.number) && row.name.length > 0)
        .filter((row) => !known.has(row.number))
        .map((row) => ({
          teamId: ownTeam.id,
          number: row.number,
          name: row.name,
          role: row.role,
        }));
      if (newPlayers.length > 0) await store.players.createMany(newPlayers);

      const opponent = await store.teams.findOrCreateOpponent(opponentName.trim());

      // Rugnummers van de tegenstander mogen nu al, zodat je tijdens de wedstrijd
      // niet hoeft te stoppen om ze toe te voegen. Een naam is niet nodig.
      const knownOpponents = new Map(
        (await store.players.listByTeam(opponent.id, { includeInactive: true })).map((player) => [
          player.number,
          player,
        ]),
      );
      const newOpponents = opponentRows
        .map((row) => ({ number: Number(row.number), name: row.name.trim() }))
        .filter((row) => Number.isInteger(row.number) && row.number > 0)
        .filter((row) => !knownOpponents.has(row.number))
        .map((row) => ({ teamId: opponent.id, number: row.number, name: row.name }));
      if (newOpponents.length > 0) await store.players.createMany(newOpponents);

      const match = await store.matches.create({
        date,
        ownTeamId: ownTeam.id,
        opponentTeamId: opponent.id,
        homeAway,
        status: 'live',
      });
      // Zonder beginservice: die vraagt het invoerscherm na de warming-up.
      await store.sets.start({ matchId: match.id });
      await store.setActiveMatchId(match.id);
      onCreated(match.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="setup">
      <header className="setup__header">
        <button type="button" className="button button--ghost" onClick={onCancel}>
          ← Terug
        </button>
        <h1>Nieuwe wedstrijd</h1>
      </header>

      <div className="setup__grid">
        <label className="field">
          <span>Eigen team</span>
          <input value={ownTeamName} onChange={(event) => setOwnTeamName(event.target.value)} placeholder="Onze ploeg" />
        </label>

        <label className="field">
          <span>Tegenstander</span>
          <input
            value={opponentName}
            onChange={(event) => setOpponentName(event.target.value)}
            placeholder="VC Tegenpartij"
          />
        </label>

        <label className="field">
          <span>Datum</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>

        <fieldset className="field">
          <span>Thuis of uit</span>
          <div className="choices">
            {(['home', 'away'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`chip ${homeAway === option ? 'chip--active' : ''}`}
                onClick={() => setHomeAway(option)}
              >
                {option === 'home' ? 'Thuis' : 'Uit'}
              </button>
            ))}
          </div>
        </fieldset>


      </div>

      <h2 className="setup__subtitle">Spelers eigen team</h2>
      <p className="setup__hint">
        Blijven bewaard voor volgende wedstrijden. De rol is optioneel; alleen bij een libero maakt
        het verschil, want die serveert niet.
      </p>
      <div className="roster">
        {rows.map((row, index) => (
          <div key={index} className="roster__row">
            <input
              className="roster__number"
              inputMode="numeric"
              value={row.number}
              onChange={(event) => updateRow(index, { number: event.target.value })}
              placeholder="#"
              aria-label={`Rugnummer speler ${index + 1}`}
            />
            <input
              className="roster__name"
              value={row.name}
              onChange={(event) => updateRow(index, { name: event.target.value })}
              placeholder="Naam"
              aria-label={`Naam speler ${index + 1}`}
            />
            {/* De rol is alleen voor de libero echt nodig: die serveert niet. */}
            <select
              className="roster__role"
              value={row.role ?? ''}
              onChange={(event) => updateRow(index, { role: event.target.value as PlayerRole | '' })}
              aria-label={`Rol speler ${index + 1}`}
            >
              <option value="">Rol</option>
              {PLAYER_ROLES.map((role) => (
                <option key={role} value={role}>
                  {PLAYER_ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
        ))}
        <button
          type="button"
          className="button button--ghost"
          onClick={() => setRows((current) => [...current, { number: '', name: '', role: '' }])}
        >
          + Speler
        </button>
      </div>

      <h2 className="setup__subtitle">Rugnummers tegenstander</h2>
      <p className="setup__hint">Optioneel, en een naam hoeft niet.</p>
      <div className="roster">
        {opponentRows.map((row, index) => (
          <div key={index} className="roster__row">
            <input
              className="roster__number"
              inputMode="numeric"
              value={row.number}
              onChange={(event) => updateOpponentRow(index, { number: event.target.value })}
              placeholder="#"
              aria-label={`Rugnummer tegenstander ${index + 1}`}
            />
            <input
              className="roster__name"
              value={row.name}
              onChange={(event) => updateOpponentRow(index, { name: event.target.value })}
              placeholder="Naam (optioneel)"
              aria-label={`Naam tegenstander ${index + 1}`}
            />
          </div>
        ))}
        <button
          type="button"
          className="button button--ghost"
          onClick={() => setOpponentRows((current) => [...current, { number: '', name: '' }])}
        >
          + Rugnummer
        </button>
      </div>

      {error && <p className="setup__error">{error}</p>}

      <button type="button" className="button button--primary button--wide" disabled={saving} onClick={() => void save()}>
        {saving ? 'Bezig…' : 'Wedstrijd starten'}
      </button>
    </div>
  );
}
