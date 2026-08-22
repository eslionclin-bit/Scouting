/**
 * Ons eigen dossier.
 *
 * De spiegel van het opponent-dossier: waar zitten wíj structureel vast? Eén
 * slechte set zegt niets, hetzelfde patroon over vijf wedstrijden wel — en dat
 * is precies wat je op een training kunt aanpakken.
 */

import { useMemo, type ReactElement } from 'react';
import {
  buildTeamProfile,
  compareMetrics,
  emptyMetrics,
  MIN_ROTATION_RALLIES,
} from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { ACTION_TYPE_LABELS } from '../../domain/protocol';
import { MetricTable } from '../components/MetricTable';
import { useReference } from '../hooks/useReference';
import { StatTile } from '../components/StatTile';
import { useQuery } from '../StoreProvider';

export interface TeamScreenProps {
  onExit: () => void;
  onOpenMatch: (matchId: string) => void;
  onOpenPlayer?: (playerId: string) => void;
}

export function TeamScreen({ onExit, onOpenMatch, onOpenPlayer }: TeamScreenProps): ReactElement {
  const { data, error } = useQuery(async (store) => {
    const ownTeam = await store.teams.ownTeam();
    if (!ownTeam) return { ownTeam: undefined, bundles: [] };

    const matches = (await store.matches.list()).filter(
      (match) => match.ownTeamId === ownTeam.id,
    );
    const bundles = await Promise.all(matches.map((match) => loadMatchBundle(store, match.id)));
    return { ownTeam, bundles };
  }, []);

  const profile = useMemo(
    () => (data?.ownTeam ? buildTeamProfile(data.bundles, data.ownTeam.id) : null),
    [data],
  );

  // Hier is er geen 'nu': dit scherm gaat over het hele seizoen. De vergelijking
  // is dus tussen ons niveau en topniveau, zonder tussenkolom.
  const reference = useReference();
  const metrics = useMemo(
    () => compareMetrics(profile?.metrics ?? emptyMetrics(), emptyMetrics(), reference.level),
    [profile, reference.level],
  );

  if (error) {
    return (
      <div className="boot boot--error">
        <p>{error.message}</p>
        <button type="button" className="button" onClick={onExit}>
          Terug
        </button>
      </div>
    );
  }
  if (!data || !profile) return <div className="boot">Profiel samenstellen…</div>;

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Terug
        </button>
        <div>
          <h1>{data.ownTeam?.name ?? 'Ons team'}</h1>
          <p className="dashboard__sub">
            {profile.matches} {profile.matches === 1 ? 'wedstrijd' : 'wedstrijden'} ·{' '}
            {profile.totalActions} eigen acties vastgelegd
          </p>
        </div>
      </header>

      <div className="tiles">
        <StatTile label="Gespeeld" value={`${profile.wins}–${profile.losses}`} hint="gewonnen–verloren" />
        <StatTile
          label="Aanvalsrendement"
          value={
            profile.byType.attack.total === 0 ? '—' : signed(profile.byType.attack.efficiency ?? 0)
          }
          hint={`${profile.byType.attack.total} aanvallen`}
        />
        <StatTile
          label="Servicefouten"
          value={profile.byType.serve.total === 0 ? '—' : pct(profile.byType.serve.errorPct)}
          hint={`${profile.byType.serve.total} services`}
        />
        <StatTile
          label="Pass positief"
          value={profile.byType.reception.total === 0 ? '—' : pct(profile.byType.reception.positivePct)}
          hint={`${profile.byType.reception.total} passes`}
        />
      </div>

      <section className="card">
        <h2>Ons niveau</h2>
        <p className="card__hint">
          Onze cijfers over alle wedstrijden, naast de referentie.{' '}
          {reference.computed
            ? `Die is geteld uit ${reference.computed.source.matches} ingelezen wedstrijden.`
            : 'Die is nog een ordegrootte uit de literatuur; lees scoutbestanden in om er tellingen van te maken.'}{' '}
          Tik op een referentiegetal om te zien waar het vandaan komt — het is een richting, geen
          norm voor volgende week.
        </p>
        <MetricTable rows={metrics} nowLabel="Wij dit seizoen" referenceLabel={reference.level.label} />
      </section>

      <section className="card">
        <h2>Waar we vastlopen</h2>
        {profile.findings.length === 0 ? (
          <p className="card__hint">
            Nog geen patroon dat over meerdere wedstrijden standhoudt. Er zijn minstens{' '}
            {MIN_ROTATION_RALLIES} rally's per rotatie nodig voordat hier iets verschijnt — anders
            zou één slechte set al als patroon tellen.
          </p>
        ) : (
          <ul className="findings">
            {profile.findings.map((finding) => (
              <li key={finding.code + finding.text} className="findings__item">
                <span className="findings__text">{finding.text}</span>
                <span className="findings__sample">op {finding.sample} waarnemingen</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {profile.advice.length > 0 && (
        <section className="card">
          <h2>Waar je op kunt trainen</h2>
          <p className="card__hint">Elk advies hoort bij één telling hierboven — niets anders.</p>
          <ul className="advice">
            {profile.advice.map((item) => (
              <li key={item.text + item.because} className="advice__item">
                <strong>{item.text}</strong>
                <span className="advice__because">{item.because}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Per rotatie</h2>
        <p className="card__hint">Over alle wedstrijden bij elkaar.</p>
        <div className="tablewrap">
          <table className="stats">
            <thead>
              <tr>
                <th scope="col">Rotatie</th>
                <th scope="col">Sideout</th>
                <th scope="col">Punt op eigen service</th>
                <th scope="col">Voor</th>
                <th scope="col">Tegen</th>
              </tr>
            </thead>
            <tbody>
              {profile.rotations.map((rotation) => (
                <tr key={rotation.rotation}>
                  <th scope="row">R{rotation.rotation}</th>
                  <td>
                    {rotation.sideoutPct === null
                      ? '—'
                      : `${pct(rotation.sideoutPct)} (${rotation.receiveRallies})`}
                  </td>
                  <td>
                    {rotation.servePointPct === null
                      ? '—'
                      : `${pct(rotation.servePointPct)} (${rotation.serveRallies})`}
                  </td>
                  <td>{rotation.pointsFor}</td>
                  <td>{rotation.pointsAgainst}</td>
                </tr>
              ))}
              {profile.rotations.length === 0 && (
                <tr>
                  <td colSpan={5}>Nog geen rally's met een rotatiestand.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Opstellingen</h2>
        <p className="card__hint">
          Sets met dezelfde zes spelers, vergeleken op puntverschil per set.
        </p>
        <div className="tablewrap">
          <table className="stats">
            <thead>
              <tr>
                <th scope="col">Zes</th>
                <th scope="col">Sets</th>
                <th scope="col">Voor</th>
                <th scope="col">Tegen</th>
                <th scope="col">Verschil per set</th>
              </tr>
            </thead>
            <tbody>
              {profile.lineups.map((lineup) => (
                <tr key={lineup.key}>
                  <th scope="row">
                    {lineup.players.map((player) => `#${player.number}`).join(' ')}
                  </th>
                  <td>{lineup.sets}</td>
                  <td>{lineup.pointsFor}</td>
                  <td>{lineup.pointsAgainst}</td>
                  <td className={lineup.diffPerSet >= 0 ? 'stats__good' : 'stats__bad'}>
                    {format(lineup.diffPerSet)}
                  </td>
                </tr>
              ))}
              {profile.lineups.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    Nog geen opstellingen vastgelegd. Zet ze per set neer via 'Opstelling' in het
                    invoerscherm.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Per speler</h2>
        {onOpenPlayer && (
          <p className="card__hint">Tik op een naam voor het verloop over het seizoen.</p>
        )}
        <div className="tablewrap">
          <table className="stats">
            <thead>
              <tr>
                <th scope="col">Speler</th>
                <th scope="col">Acties</th>
                <th scope="col">{ACTION_TYPE_LABELS.serve}</th>
                <th scope="col">{ACTION_TYPE_LABELS.reception}</th>
                <th scope="col">{ACTION_TYPE_LABELS.attack}</th>
                <th scope="col">Fout%</th>
              </tr>
            </thead>
            <tbody>
              {profile.players.map((player) => (
                <tr key={player.playerId}>
                  <th scope="row">
                    {onOpenPlayer ? (
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => onOpenPlayer(player.playerId)}
                      >
                        <span className="stats__number">#{player.number}</span> {player.name}
                      </button>
                    ) : (
                      <>
                        <span className="stats__number">#{player.number}</span> {player.name}
                      </>
                    )}
                  </th>
                  <td>{player.overall.total}</td>
                  <td>{describe(player.byType.serve)}</td>
                  <td>{describePassing(player.byType.reception)}</td>
                  <td>{describe(player.byType.attack)}</td>
                  <td>{player.overall.total > 0 ? pct(player.overall.errorPct) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Wedstrijden</h2>
        <ul className="matchhistory">
          {data.bundles.map((bundle) => {
            const setsUs = bundle.sets.filter((set) => set.set.pointsUs > set.set.pointsThem).length;
            const setsThem = bundle.sets.filter((set) => set.set.pointsThem > set.set.pointsUs).length;
            return (
              <li key={bundle.match.id}>
                <button
                  type="button"
                  className="matchhistory__item"
                  onClick={() => onOpenMatch(bundle.match.id)}
                >
                  <span className="matchhistory__date">{bundle.match.date}</span>
                  <span className="matchhistory__meta">{bundle.opponent?.name ?? 'onbekend'}</span>
                  <span
                    className={`matchhistory__result matchhistory__result--${
                      setsUs === setsThem ? 'none' : setsUs > setsThem ? 'won' : 'lost'
                    }`}
                  >
                    {setsUs}–{setsThem}
                  </span>
                  <span className="matchhistory__meta">
                    {bundle.match.homeAway === 'home' ? 'thuis' : 'uit'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

type Stats = ReturnType<typeof buildTeamProfile>['byType']['serve'];

function describe(stats: Stats): string {
  if (stats.total === 0) return '—';
  return `${stats.total} · ${pct(stats.pointPct ?? 0)} pt · ${pct(stats.errorPct)} fout`;
}

function describePassing(stats: Stats): string {
  if (stats.total === 0) return '—';
  return `${stats.total} · ${pct(stats.positivePct)} positief`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function format(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}
