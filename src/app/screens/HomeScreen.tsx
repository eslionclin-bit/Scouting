/** Startscherm: wedstrijden openen, een nieuwe beginnen, of data exporteren. */

import type { ReactElement } from 'react';

import { loadMatchBundle } from '../../db/bundle';
import { toMatchCsv } from '../../export/csv';
import { toMatchJson } from '../../export/json';
import { pendingCount } from '../../sync/outbox';
import { useQuery, useStore } from '../StoreProvider';

export interface HomeScreenProps {
  onOpenMatch: (matchId: string) => void;
  onNewMatch: () => void;
}

export function HomeScreen({ onOpenMatch, onNewMatch }: HomeScreenProps): ReactElement {
  const store = useStore();

  const { data } = useQuery(async (instance) => {
    const matches = await instance.matches.list();
    const teams = await instance.teams.list();
    const teamNames = new Map(teams.map((team) => [team.id, team.name]));
    const withScores = await Promise.all(
      matches.map(async (match) => ({
        match,
        opponent: teamNames.get(match.opponentTeamId) ?? 'onbekend',
        sets: await instance.sets.listByMatch(match.id),
      })),
    );
    return { matches: withScores, pending: await pendingCount(instance.db) };
  }, []);

  async function download(matchId: string, format: 'json' | 'csv'): Promise<void> {
    const bundle = await loadMatchBundle(store, matchId);
    const content = format === 'json' ? toMatchJson(bundle) : toMatchCsv(bundle);
    const type = format === 'json' ? 'application/json' : 'text/csv;charset=utf-8';
    const name = `${bundle.match.date}-${bundle.opponent?.name ?? 'wedstrijd'}.${format}`;

    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="home">
      <header className="home__header">
        <div>
          <h1>Volleybal scouting</h1>
          <p className="home__sub">
            Alles wordt op dit apparaat opgeslagen. Zonder verbinding werkt de app gewoon door.
          </p>
        </div>
        <button type="button" className="button button--primary" onClick={onNewMatch}>
          + Nieuwe wedstrijd
        </button>
      </header>

      {data && data.pending > 0 && (
        <p className="home__pending">
          {data.pending} wijziging{data.pending === 1 ? '' : 'en'} lokaal opgeslagen, nog niet
          gesynchroniseerd.
        </p>
      )}

      <ul className="matchlist">
        {data?.matches.map(({ match, opponent, sets }) => (
          <li key={match.id} className="matchlist__item">
            <button type="button" className="matchlist__open" onClick={() => onOpenMatch(match.id)}>
              <span className="matchlist__opponent">{opponent}</span>
              <span className="matchlist__meta">
                {match.date} · {match.homeAway === 'home' ? 'thuis' : 'uit'} ·{' '}
                {match.status === 'live' ? 'bezig' : match.status === 'finished' ? 'afgelopen' : 'gepland'}
              </span>
              <span className="matchlist__sets">
                {sets.length === 0
                  ? 'nog geen sets'
                  : sets.map((set) => `${set.pointsUs}-${set.pointsThem}`).join(' · ')}
              </span>
            </button>
            <div className="matchlist__actions">
              <button type="button" className="button button--ghost" onClick={() => void download(match.id, 'json')}>
                JSON
              </button>
              <button type="button" className="button button--ghost" onClick={() => void download(match.id, 'csv')}>
                CSV
              </button>
            </div>
          </li>
        ))}
        {data?.matches.length === 0 && (
          <li className="matchlist__empty">Nog geen wedstrijden. Begin er een met de knop hierboven.</li>
        )}
      </ul>
    </div>
  );
}
