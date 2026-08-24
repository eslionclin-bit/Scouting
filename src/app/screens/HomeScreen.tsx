/** Startscherm: wedstrijden openen, een nieuwe beginnen, of data exporteren. */

import { useState, type ChangeEvent, type ReactElement } from 'react';

import { loadMatchBundle } from '../../db/bundle';
import type { FileImportSummary } from '../../db/repositories/imports';
import { MatchFileError } from '../../import/matchFile';
import { toMatchCsv } from '../../export/csv';
import { toMatchJson } from '../../export/json';
import type { DeviceRole } from '../../domain/types';
import { pendingCount } from '../../sync/outbox';
import { PairingSheet } from '../components/PairingSheet';
import { RoleSheet } from '../components/RoleSheet';
import type { PeerSession } from '../hooks/usePeerSession';
import { useQuery, useStore } from '../StoreProvider';

export interface HomeScreenProps {
  /** Dit apparaat is zojuist via een link aan de ploeg gekoppeld. */
  justCoupled?: boolean;
  onDismissCoupled?: () => void;
  session: PeerSession;
  /** Rolkeuze hoort bij het openen van een wedstrijd (projectbrief §6). */
  onOpenMatch: (matchId: string, role: DeviceRole) => void;
  onOpenDashboard: (matchId: string) => void;
  onOpenOpponent: (opponentId: string) => void;
  onOpenTeam: () => void;
  onOpenSettings: () => void;
  onOpenVideo: (matchId?: string) => void;
  onNewMatch: () => void;
}

export function HomeScreen({
  justCoupled = false,
  onDismissCoupled,
  session,
  onOpenMatch,
  onOpenDashboard,
  onOpenOpponent,
  onOpenTeam,
  onOpenSettings,
  onOpenVideo,
  onNewMatch,
}: HomeScreenProps): ReactElement {
  const store = useStore();
  const [showPairing, setShowPairing] = useState(false);
  const [choosingRole, setChoosingRole] = useState<{ id: string; label: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [readResult, setReadResult] = useState<FileImportSummary[]>([]);
  /**
   * Welke wedstrijd om bevestiging vraagt.
   *
   * Weggooien kan niet ongedaan worden gemaakt, dus het gebeurt nooit met één
   * tik. Geen aparte melding erover: de vraag verschijnt op de plek van de knop,
   * zodat je ziet wélke wedstrijd je weggooit.
   */
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

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

  /**
   * Een wedstrijd van een ander apparaat inlezen. Twee keer hetzelfde bestand
   * kiezen kan geen kwaad: de id's in het bestand zijn dezelfde, dus het wordt
   * dezelfde wedstrijd en niet een tweede.
   */
  async function readFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;

    setReading(true);
    setReadError(null);
    const summaries: FileImportSummary[] = [];
    try {
      for (const file of files) {
        summaries.push(await store.imports.importMatchFile(await file.text()));
      }
      setReadResult(summaries);
    } catch (cause) {
      setReadError(
        cause instanceof MatchFileError
          ? cause.message
          : `Inlezen mislukt: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setReading(false);
    }
  }

  async function remove(matchId: string): Promise<void> {
    setConfirmDelete(null);
    await store.matches.remove(matchId);
  }

  return (
    <div className="home">
      <header className="home__header">
        <div>
          <h1>Volleybal scouting</h1>
          <p className="home__sub">
            Alles wordt op dit apparaat opgeslagen. Zonder verbinding werkt de app gewoon door. Tik
            een wedstrijd aan en kies wat je op dit apparaat doet: invoeren, aanvullen, of de coachinformatie erbij houden.
          </p>
        </div>
        <div className="home__actions">
          {/* Een meelezer heeft de wedstrijd nog niet; die haalt hij hier binnen. */}
          <button
            type="button"
            className={`button ${session.status === 'connected' ? 'button--live' : ''}`}
            onClick={() => setShowPairing(true)}
          >
            {session.status === 'connected' ? 'Verbonden' : 'Meelezen in de zaal'}
          </button>
          <button type="button" className="button" onClick={onOpenTeam}>
            Ons team
          </button>
          <label className={`button filebutton ${reading ? 'button--busy' : ''}`}>
            {reading ? 'Bezig met inlezen…' : 'Wedstrijd inlezen'}
            <input
              type="file"
              accept=".json,application/json"
              multiple
              disabled={reading}
              onChange={(event) => void readFiles(event)}
            />
          </label>
          {/*
            Live invoeren gaat te snel — dat is de eerlijke conclusie na een paar
            wedstrijden. Dit is de uitweg: de opname erbij pakken en op je eigen
            tempo invoeren.
          */}
          <button type="button" className="button" onClick={() => onOpenVideo()}>
            Wedstrijd van beeld
          </button>
          <button type="button" className="button" onClick={onOpenSettings}>
            Instellingen
          </button>
          <button type="button" className="button button--primary" onClick={onNewMatch}>
            + Nieuwe wedstrijd
          </button>
        </div>
      </header>

      {justCoupled && (
        <p className="home__coupled">
          Dit apparaat hoort nu bij de ploeg. Wedstrijden lopen vanzelf mee zodra er internet is —
          je hoeft verder niets in te stellen.
          <button type="button" className="button button--ghost" onClick={onDismissCoupled}>
            Begrepen
          </button>
        </p>
      )}

      {readError && <p className="home__error">{readError}</p>}

      {readResult.length > 0 && (
        <ul className="findings">
          {readResult.map((summary) => (
            <li key={summary.matchId} className="findings__item">
              <span className="findings__text">
                {summary.ownTeam} – {summary.opponent} · {summary.date}
              </span>
              <span className="findings__sample">
                {summary.applied === 0
                  ? 'stond hier al, niets veranderd'
                  : `${summary.existed ? 'bijgewerkt' : 'toegevoegd'}: ${summary.sets} sets · ${summary.rallies} rally's · ${summary.actions} acties`}
              </span>
            </li>
          ))}
        </ul>
      )}

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
              {/*
                Van beeld invoeren hoort bij een wedstrijd, niet ernaast: pas
                als de app weet welke wedstrijd het is, kun je per rally iets
                vastleggen in plaats van alleen kijken.
              */}
              <button
                type="button"
                className="button button--ghost"
                onClick={() => onOpenVideo(match.id)}
              >
                Beeld
              </button>
              <button type="button" className="button button--ghost" onClick={() => void download(match.id, 'json')}>
                JSON
              </button>
              <button type="button" className="button button--ghost" onClick={() => void download(match.id, 'csv')}>
                CSV
              </button>
              {confirmDelete === match.id ? (
                <>
                  <span className="matchlist__confirm">Weggooien? Dit kan niet terug.</span>
                  <button
                    type="button"
                    className="button button--danger"
                    onClick={() => void remove(match.id)}
                  >
                    Ja, verwijderen
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => setConfirmDelete(null)}
                  >
                    Nee
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button button--ghost"
                  aria-label={`Wedstrijd tegen ${opponent} verwijderen`}
                  onClick={() => setConfirmDelete(match.id)}
                >
                  Verwijderen
                </button>
              )}
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
