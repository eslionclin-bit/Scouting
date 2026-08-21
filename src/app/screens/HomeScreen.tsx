/** Startscherm: wedstrijden openen, een nieuwe beginnen, of data exporteren. */

import { useState, type ReactElement } from 'react';

import { loadMatchBundle } from '../../db/bundle';
import { toMatchCsv } from '../../export/csv';
import { toMatchJson } from '../../export/json';
import type { DeviceRole } from '../../domain/types';
import { pendingCount } from '../../sync/outbox';
import { PairingSheet } from '../components/PairingSheet';
import { RoleSheet } from '../components/RoleSheet';
import type { PeerSession } from '../hooks/usePeerSession';
import { useQuery, useStore } from '../StoreProvider';

export interface HomeScreenProps {
  session: PeerSession;
  /** Rolkeuze hoort bij het openen van een wedstrijd (projectbrief §6). */
  onOpenMatch: (matchId: string, role: DeviceRole) => void;
  onOpenDashboard: (matchId: string) => void;
  onOpenOpponent: (opponentId: string) => void;
  onOpenTeam: () => void;
  onNewMatch: () => void;
}

export function HomeScreen({
  session,
  onOpenMatch,
  onOpenDashboard,
  onOpenOpponent,
  onOpenTeam,
  onNewMatch,
}: HomeScreenProps): ReactElement {
  const store = useStore();
  const [showPairing, setShowPairing] = useState(false);
  const [choosingRole, setChoosingRole] = useState<{ id: string; label: string } | null>(null);

  const { data } = useQuery(async (instance) => {
    const matches = await instance.matches.list();
    const teams = await instance.teams.list();
    const teamNames = new Map(teams.map((team) => [team.id, team.name]));
    const withScores = await Promise.all(
      matches.map(async (match) => ({
        match,
        opponent: teamNames.get(match.opponentTeamId) ?? 'onbekend',
        // Het dossier groeit met elke wedstrijd tegen dezelfde tegenstander.
        earlier: matches.filter((other) => other.opponentTeamId === match.opponentTeamId).length - 1,
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
            Alles wordt op dit apparaat opgeslagen. Zonder verbinding werkt de app gewoon door. Tik
            een wedstrijd aan en kies wat je op dit apparaat doet: invoeren, aanvullen of meelezen.
          </p>
        </div>
        <div className="home__actions">
          {/* Een meelezer heeft de wedstrijd nog niet; die haalt hij hier binnen. */}
          <button
            type="button"
            className={`button ${session.status === 'connected' ? 'button--live' : ''}`}
            onClick={() => setShowPairing(true)}
          >
            {session.status === 'connected' ? 'Verbonden' : 'Koppelen met ander apparaat'}
          </button>
          <button type="button" className="button" onClick={onOpenTeam}>
            Ons team
          </button>
          <button type="button" className="button button--primary" onClick={onNewMatch}>
            + Nieuwe wedstrijd
          </button>
        </div>
      </header>

      {data && data.pending > 0 && (
        <p className="home__pending">
          {data.pending} wijziging{data.pending === 1 ? '' : 'en'} lokaal opgeslagen, nog niet
          gesynchroniseerd.
        </p>
      )}

      <ul className="matchlist">
        {data?.matches.map(({ match, opponent, earlier, sets }) => (
          <li key={match.id} className="matchlist__item">
            <button
              type="button"
              className="matchlist__open"
              onClick={() => setChoosingRole({ id: match.id, label: `${opponent} · ${match.date}` })}
            >
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
              <button
                type="button"
                className="button button--ghost"
                onClick={() => onOpenDashboard(match.id)}
              >
                Cijfers
              </button>
              <button
                type="button"
                className="button button--ghost"
                onClick={() => onOpenOpponent(match.opponentTeamId)}
                title={
                  earlier > 0
                    ? `Dossier over ${earlier + 1} wedstrijden tegen ${opponent}`
                    : `Dossier over ${opponent}`
                }
              >
                Dossier{earlier > 0 ? ` (${earlier + 1})` : ''}
              </button>
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
      {showPairing && (
        <PairingSheet role="viewer" session={session} onClose={() => setShowPairing(false)} />
      )}

      {choosingRole && (
        <RoleSheet
          matchLabel={choosingRole.label}
          onChoose={(role) => {
            onOpenMatch(choosingRole.id, role);
            setChoosingRole(null);
          }}
          onClose={() => setChoosingRole(null)}
        />
      )}
    </div>
  );
}
