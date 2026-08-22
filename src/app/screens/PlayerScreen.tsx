/**
 * Eén speler, uitgeklapt.
 *
 * Drie vragen die een coach hier stelt: waar kan zij aan werken, wordt zij beter
 * gedurende het seizoen, en speelt zij vandaag onder of boven haar eigen niveau.
 * Dat laatste is iets anders dan 'slecht spelen' — en alleen dat eerste is een
 * reden om nu te wisselen.
 */

import { useMemo, type ReactElement } from 'react';
import { buildPlayerProfile, type FormComparison } from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { playerLabel, PLAYER_ROLE_LABELS } from '../../domain/players';
import { ACTION_TYPE_LABELS } from '../../domain/protocol';
import { ACTION_TYPES } from '../../domain/types';
import { Placeholder } from '../components/Placeholder';
import { StatTile } from '../components/StatTile';
import { useQuery } from '../StoreProvider';

export interface PlayerScreenProps {
  playerId: string;
  onExit: () => void;
  onOpenMatch: (matchId: string) => void;
}

export function PlayerScreen({ playerId, onExit, onOpenMatch }: PlayerScreenProps): ReactElement {
  const { data, error } = useQuery(
    async (store) => {
      const player = await store.players.get(playerId);
      if (!player) return { player: undefined, bundles: [] };

      const matches = (await store.matches.list()).filter(
        (match) => match.ownTeamId === player.teamId || match.opponentTeamId === player.teamId,
      );
      const bundles = await Promise.all(matches.map((match) => loadMatchBundle(store, match.id)));
      return { player, bundles };
    },
    [playerId],
  );

  const profile = useMemo(
    () => (data?.player ? buildPlayerProfile(data.bundles, data.player) : null),
    [data],
  );

  if (error) return <Placeholder title="Er ging iets mis" hint={error.message} onExit={onExit} tone="error" />;
  if (!data) return <Placeholder title="Speler laden…" onExit={onExit} />;
  if (!data.player || !profile) {
    return (
      <Placeholder
        title="Speler niet gevonden"
        hint="Deze speler staat niet meer in de app; misschien is hij verwijderd."
        onExit={onExit}
        tone="empty"
      />
    );
  }

  const attack = profile.season.byType.attack;
  const serve = profile.season.byType.serve;
  const reception = profile.season.byType.reception;

  // Verloop over het seizoen: oudste wedstrijd links.
  const trend = [...profile.matches].reverse().filter((row) => row.byType.attack.total > 0);

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Terug
        </button>
        <div>
          <h1>{playerLabel(data.player)}</h1>
          <p className="dashboard__sub">
            {data.player.role ? `${PLAYER_ROLE_LABELS[data.player.role]} · ` : ''}
            {profile.matchesPlayed} {profile.matchesPlayed === 1 ? 'wedstrijd' : 'wedstrijden'} ·{' '}
            {profile.season.overall.total} acties
          </p>
        </div>
      </header>

      {profile.matchesPlayed === 0 ? (
        <section className="card">
          <p className="card__hint">
            Nog geen acties van deze speler vastgelegd. Zodra er wedstrijden zijn ingevoerd, staat
            hier haar verloop.
          </p>
        </section>
      ) : (
        <>
          <div className="tiles">
            <StatTile
              label="Aanvalsrendement"
              value={attack.total === 0 ? '—' : signed(attack.efficiency ?? 0)}
              hint={`${attack.total} aanvallen`}
            />
            <StatTile
              label="Service"
              value={serve.total === 0 ? '—' : pct(serve.pointPct ?? 0)}
              hint={`${serve.counts.error} fout van ${serve.total}`}
            />
            <StatTile
              label="Pass positief"
              value={reception.total === 0 ? '—' : pct(reception.positivePct)}
              hint={`${reception.total} passes`}
            />
            <StatTile
              label="Fout"
              value={pct(profile.season.overall.errorPct)}
              hint="van alle acties"
            />
          </div>

          {profile.form.length > 0 && (
            <section className="card">
              <h2>Vorm: laatste wedstrijd tegenover het seizoen</h2>
              <p className="card__hint">
                Alleen als er genoeg van gezien is — zowel vandaag als daarvoor.
              </p>
              <ul className="findings">
                {profile.form.map((entry) => (
                  <li key={entry.type} className={`findings__item findings__item--${entry.verdict}`}>
                    <span className="findings__text">{describeForm(entry)}</span>
                    <span className="findings__sample">
                      {entry.actionsNow} nu · {entry.actionsSeason} eerder
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {trend.length > 1 && (
            <section className="card">
              <h2>Verloop van de aanval</h2>
              <p className="card__hint">Rendement per wedstrijd, oudste links.</p>
              <div className="trend">
                {trend.map((row) => {
                  const value = row.byType.attack.efficiency ?? 0;
                  return (
                    <div key={row.matchId} className="trend__item">
                      <div className="trend__track" aria-hidden="true">
                        <div
                          className={`trend__bar ${value < 0 ? 'trend__bar--negative' : ''}`}
                          // Halve baan is de hele helft van het spoor: een
                          // rendement van +100% raakt de bovenkant.
                          style={{ height: `${Math.min(Math.abs(value), 1) * 50}%` }}
                        />
                      </div>
                      <span className="trend__value">{signed(value)}</span>
                      <span className="trend__label">{row.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          <section className="card">
            <h2>Per actietype</h2>
            <div className="tablewrap">
              <table className="stats">
                <thead>
                  <tr>
                    <th scope="col">Actie</th>
                    <th scope="col">Aantal</th>
                    <th scope="col">Positief</th>
                    <th scope="col">Fout</th>
                    <th scope="col">Punt</th>
                  </tr>
                </thead>
                <tbody>
                  {ACTION_TYPES.map((type) => {
                    const stats = profile.season.byType[type];
                    return (
                      <tr key={type}>
                        <th scope="row">{ACTION_TYPE_LABELS[type]}</th>
                        <td>{stats.total}</td>
                        <td>{stats.total > 0 ? pct(stats.positivePct) : '—'}</td>
                        <td>{stats.total > 0 ? pct(stats.errorPct) : '—'}</td>
                        <td>
                          {stats.pointPct === null || stats.total === 0 ? '—' : pct(stats.pointPct)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h2>Per wedstrijd</h2>
            <div className="tablewrap">
              <table className="stats">
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col">Tegen</th>
                    <th scope="col">Acties</th>
                    <th scope="col">Aanval</th>
                    <th scope="col">Fout%</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.matches.map((row) => (
                    <tr key={row.matchId}>
                      <th scope="row">
                        <button
                          type="button"
                          className="linkish"
                          onClick={() => onOpenMatch(row.matchId)}
                        >
                          {row.date}
                        </button>
                      </th>
                      <td>{row.opponent}</td>
                      <td>{row.actions}</td>
                      <td>
                        {row.byType.attack.total === 0
                          ? '—'
                          : `${row.byType.attack.total} · ${signed(row.byType.attack.efficiency ?? 0)}`}
                      </td>
                      <td>{pct(row.overall.errorPct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function describeForm(entry: FormComparison): string {
  const label = ACTION_TYPE_LABELS[entry.type].toLowerCase();
  const now = entry.metric === 'positive' ? pct(entry.now) : signed(entry.now);
  const season = entry.metric === 'positive' ? pct(entry.season) : signed(entry.season);

  if (entry.verdict === 'onder') return `Onder niveau op de ${label}: ${now} tegenover ${season}.`;
  if (entry.verdict === 'boven') return `Boven niveau op de ${label}: ${now} tegenover ${season}.`;
  return `Op niveau op de ${label}: ${now} tegenover ${season}.`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
