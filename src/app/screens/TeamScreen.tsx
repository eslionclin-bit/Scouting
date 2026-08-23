/**
 * Ons eigen dossier.
 *
 * De spiegel van het opponent-dossier: waar zitten wíj structureel vast? Eén
 * slechte set zegt niets, hetzelfde patroon over vijf wedstrijden wel — en dat
 * is precies wat je op een training kunt aanpakken.
 */

import { useMemo, type ReactElement } from 'react';
import {
  attackDistribution,
  buildTeamProfile,
  compareMetrics,
  emptyMetrics,
  MIN_ROTATION_RALLIES,
  sideoutByPass,
  toActionRows,
} from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { ACTION_TYPE_LABELS } from '../../domain/protocol';
import { MetricTable } from '../components/MetricTable';
import { PassValue } from '../components/PassValue';
import { useReference } from '../hooks/useReference';
import { Placeholder } from '../components/Placeholder';
import { Squad } from '../components/Squad';
import { StatTile } from '../components/StatTile';
import { useQuery } from '../StoreProvider';

export interface TeamScreenProps {
  onExit: () => void;
  onOpenMatch: (matchId: string) => void;
  onOpenPlayer?: (playerId: string) => void;
}

export function TeamScreen({ onExit, onOpenMatch, onOpenPlayer }: TeamScreenProps): ReactElement {
  const { data, error, loading } = useQuery(async (store) => {
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

  // Twee ketenanalyses over het hele seizoen: wat een pass oplevert, en wie de
  // bal krijgt per rotatie. Allebei uit data die er al ligt.
  const chains = useMemo(() => {
    if (!data?.ownTeam) return null;
    const rows = data.bundles.flatMap((bundle) => toActionRows(bundle));
    const players = data.bundles
      .flatMap((bundle) => bundle.players)
      .filter((player) => player.teamId === data.ownTeam?.id);
    const unique = [...new Map(players.map((player) => [player.id, player])).values()];
    return {
      passes: sideoutByPass(data.bundles),
      distribution: attackDistribution(rows, unique),
    };
  }, [data]);
  const metrics = useMemo(
    () => compareMetrics(profile?.metrics ?? emptyMetrics(), emptyMetrics(), reference.level),
    [profile, reference.level],
  );

  if (error) return <Placeholder title="Er ging iets mis" hint={error.message} onExit={onExit} tone="error" />;
  if (loading || !data) return <Placeholder title="Profiel samenstellen…" onExit={onExit} />;

  // Zonder eigen team valt er niets samen te stellen. Dat is geen fout en ook
  // geen laadtoestand: het betekent dat er nog geen wedstrijd is geweest.
  if (!data.ownTeam || !profile) {
    return (
      <Placeholder
        title="Nog geen eigen team"
        hint="Het teamdossier vult zich zodra je een wedstrijd hebt opgezet: dan weet de app wie jullie zijn en welke wedstrijden van jullie zijn."
        onExit={onExit}
        tone="empty"
      />
    );
  }

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

      {/*
        De selectie staat bovenaan, vóór de cijfers. Wie hier komt om iemand toe
        te voegen, hoort niet eerst langs zeven blokken statistiek te scrollen —
        en bij een nieuw team zijn die blokken toch leeg.
      */}
      <Squad teamId={data.ownTeam.id} />

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
        <h2>Wat een pass oplevert</h2>
        <p className="card__hint">
          Over alle wedstrijden. Per ontvangen rally telt de eerste pass.
        </p>
        {chains ? <PassValue data={chains.passes} /> : null}
      </section>

      <section className="card">
        <h2>Wie krijgt de bal, per rotatie</h2>
        <p className="card__hint">
          De verdeling van onze aanvallen, met het rendement erachter. Eén speler die alles krijgt
          is prima — zolang het rendement er is.
        </p>
        {chains && chains.distribution.length > 0 ? (
          <div className="tablewrap">
            <table className="stats">
              <thead>
                <tr>
                  <th scope="col">Rotatie</th>
                  <th scope="col">Speler</th>
                  <th scope="col">Aanvallen</th>
                  <th scope="col">Aandeel</th>
                  <th scope="col">Rendement</th>
                </tr>
              </thead>
              <tbody>
                {chains.distribution.flatMap((rotation) =>
                  rotation.attackers.map((attacker, index) => (
                    <tr key={`${rotation.rotation}-${attacker.playerId ?? index}`}>
                      <th scope="row">{index === 0 ? `R${rotation.rotation}` : ''}</th>
                      <td>
                        {attacker.number === null ? 'onbekend' : `#${attacker.number}`}{' '}
                        {attacker.name}
                      </td>
                      <td>{attacker.attacks}</td>
                      <td>
                        <span className="share">
                          <span className="share__track" aria-hidden="true">
                            <span
                              className="share__bar"
                              style={{ width: `${Math.round(attacker.share * 100)}%` }}
                            />
                          </span>
                          <span className="share__value">
                            {Math.round(attacker.share * 100)}%
                          </span>
                        </span>
                      </td>
                      <td
                        className={
                          (attacker.stats.efficiency ?? 0) >= 0 ? 'stats__good' : 'stats__bad'
                        }
                      >
                        {signed(attacker.stats.efficiency ?? 0)}
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="card__hint">
            Nog geen aanvallen met een rotatiestand. Zet de opstelling per set neer, dan komt dit
            vanzelf.
          </p>
        )}
      </section>

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
