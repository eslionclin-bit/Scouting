/**
 * Scherm C — opponent-dossier.
 *
 * Alles wat we van deze tegenstander weten, over alle wedstrijden heen. De
 * bevindingen komen uit tellingen en dragen het aantal waarnemingen bij zich;
 * is er te weinig gezien, dan staat er niets. Liever een leeg dossier dan een
 * patroon dat op vier ballen berust.
 */

import { useMemo, type ReactElement } from 'react';
import { buildOpponentDossier, MIN_RECEPTIONS_PER_PLAYER, MIN_SAMPLE } from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { ACTION_TYPE_LABELS } from '../../domain/protocol';
import { Squad } from '../components/Squad';
import { StatTile } from '../components/StatTile';
import { ZoneHeatmap } from '../components/ZoneHeatmap';
import { Placeholder } from '../components/Placeholder';
import { useQuery } from '../StoreProvider';

export interface OpponentScreenProps {
  opponentId: string;
  onExit: () => void;
  onOpenMatch: (matchId: string) => void;
}

export function OpponentScreen({ opponentId, onExit, onOpenMatch }: OpponentScreenProps): ReactElement {
  const { data, error } = useQuery(
    async (store) => {
      const opponent = await store.teams.get(opponentId);
      const matches = await store.matches.listByOpponent(opponentId);
      const bundles = await Promise.all(matches.map((match) => loadMatchBundle(store, match.id)));
      return { opponent, bundles };
    },
    [opponentId],
  );

  const dossier = useMemo(() => {
    if (!data?.opponent) return null;
    return buildOpponentDossier(data.bundles, opponentId, data.opponent.name);
  }, [data, opponentId]);

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
  if (!data) return <Placeholder title="Dossier samenstellen…" onExit={onExit} />;
  if (!dossier) {
    return (
      <Placeholder
        title="Nog geen dossier"
        hint="Zodra er een wedstrijd tegen deze ploeg is ingevoerd, staat hier wat we van ze weten."
        onExit={onExit}
        tone="empty"
      />
    );
  }

  const thin = dossier.totalActions < MIN_SAMPLE;

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Terug
        </button>
        <div>
          <h1>{dossier.opponentName}</h1>
          <p className="dashboard__sub">
            {dossier.matches.length} {dossier.matches.length === 1 ? 'wedstrijd' : 'wedstrijden'} gespeeld ·{' '}
            {dossier.totalActions} acties vastgelegd
          </p>
        </div>
      </header>

      <div className="tiles">
        <StatTile
          label="Onderling"
          value={`${dossier.wins}–${dossier.losses}`}
          hint="gewonnen–verloren wedstrijden"
        />
        <StatTile label="Sets" value={`${dossier.setsWon}–${dossier.setsLost}`} hint="voor–tegen" />
        <StatTile
          label="Aanvalsrendement"
          value={
            dossier.byType.attack.efficiency === null || dossier.byType.attack.total === 0
              ? '—'
              : formatSigned(dossier.byType.attack.efficiency)
          }
          hint={`${dossier.byType.attack.total} aanvallen gezien`}
        />
        <StatTile
          label="Fout bij service"
          value={dossier.byType.serve.total === 0 ? '—' : formatPct(dossier.byType.serve.errorPct)}
          hint={`${dossier.byType.serve.total} services gezien`}
        />
      </div>

      {/*
        Hun spelers waren tot nu toe alleen aan te maken door tijdens het
        invoeren een rugnummer in te tikken. Dat werkt tijdens een rally, maar
        het is de verkeerde plek om een ploeg voor te bereiden: je zit thuis met
        een wedstrijdformulier van vorige week en wilt er namen bij zetten. Dit
        is dezelfde lijst als bij ons team, want het is dezelfde vraag.
      */}
      <Squad
        teamId={opponentId}
        title="Hun selectie"
        hint="Rugnummers en, als je ze kent, namen en posities. Je hebt dit niet nodig om in te voeren — een nummer intikken tijdens de rally kan altijd — maar met de namen erbij leest het advies straks als 'serveer op #38' in plaats van 'serveer op positie 5'."
      />

      <section className="card">
        <h2>Belangrijkste patronen</h2>
        {thin ? (
          <p className="card__hint">
            Nog te weinig vastgelegd om iets te durven zeggen: {dossier.totalActions} acties, en er
            zijn er minstens {MIN_SAMPLE} per patroon nodig. Voer een wedstrijd tegen deze
            tegenstander in en het dossier vult zichzelf.
          </p>
        ) : dossier.findings.length === 0 ? (
          <p className="card__hint">
            Geen uitschieters gevonden. Deze tegenstander verdeelt zijn spel of we hebben nog niet
            genoeg van één soort actie gezien.
          </p>
        ) : (
          <ul className="findings">
            {dossier.findings.map((finding) => (
              <li key={`${finding.code}-${finding.text}`} className="findings__item">
                <span className="findings__text">{finding.text}</span>
                {/* Het aantal staat erbij, zodat een coach zelf kan wegen hoe hard dit is. */}
                <span className="findings__sample">op {finding.sample} waarnemingen</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {dossier.advice.length > 0 && (
        <section className="card">
          <h2>Tactisch advies</h2>
          <p className="card__hint">Elk advies hoort bij één telling hierboven — niets anders.</p>
          <ul className="advice">
            {dossier.advice.map((item) => (
              <li key={item.text + item.because} className="advice__item">
                <strong>{item.text}</strong>
                <span className="advice__because">{item.because}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2>Wie er slecht past</h2>
        {dossier.passers.length === 0 ? (
          <p className="card__hint">
            Nog te weinig ballen om iets over een speelster te zeggen. Dit vult zich vanzelf en het
            kost geen extra invoer: hoe je onze service kwalificeert zegt al wat zij ermee kon, en
            waar je naartoe serveerde komt uit één tik op hun helft. Wel is hun opstelling nodig,
            anders weet de app niet wie daar stond.
          </p>
        ) : (
          <>
            <p className="card__hint">
              Slechtste passer bovenaan. Haar cijfer zegt hoe zíj het doet; de laatste kolom zegt
              wat het óns oplevert — en dat tweede telt, want een matige passer achter een ploeg die
              er toch uitkomt is geen doelwit. Onder {MIN_RECEPTIONS_PER_PLAYER} passes zwijgt de
              tabel. Deze cijfers zijn afgeleid uit onze eigen servicekwalificaties, tenzij je hun
              pass zelf invoert: het is dus hoe wij haar zagen worstelen, niet een oordeel van een
              scout aan hun kant. En een pass komt alleen op naam als er bij de service ook echt
              een passer in dat vak stond — bij een korte bal loopt daar iemand anders naartoe, en
              dan telt hij wel voor de ploeg maar niet voor een speelster.
            </p>
            <div className="tablewrap">
              <table className="stats">
                <thead>
                  <tr>
                    <th scope="col">Speelster</th>
                    <th scope="col">Passes</th>
                    <th scope="col">Schoon</th>
                    <th scope="col">Fout</th>
                    <th scope="col">Wij serveerden op haar</th>
                  </tr>
                </thead>
                <tbody>
                  {dossier.passers.map((passer) => (
                    <tr key={passer.number}>
                      <th scope="row">
                        #{passer.number}
                        {passer.name ? ` ${passer.name}` : ''}
                      </th>
                      <td>{passer.receptions || '—'}</td>
                      <td>
                        {passer.positivePct === null
                          ? '—'
                          : `${Math.round(passer.positivePct * 100)}%`}
                      </td>
                      <td>{passer.receptions > 0 ? passer.errors : '—'}</td>
                      <td>
                        {passer.servedAt === 0
                          ? '—'
                          : `${passer.servedAt}× · ${Math.round((passer.wonPct ?? 0) * 100)}% gewonnen`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="card">
        <h2>Zones</h2>
        <p className="card__hint">Waar de tegenstander vandaan aanvalt en serveert, over alle wedstrijden.</p>
        <div className="heatmaps">
          <ZoneHeatmap title="Aanval" subtitle="vertrekzone" tally={dossier.attackZones} />
          <ZoneHeatmap title="Service" subtitle="vertrekzone" tally={dossier.serveZones} />
        </div>
      </section>

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
              {(Object.keys(dossier.byType) as (keyof typeof dossier.byType)[]).map((type) => {
                const stats = dossier.byType[type];
                return (
                  <tr key={type}>
                    <th scope="row">{ACTION_TYPE_LABELS[type]}</th>
                    <td>{stats.total}</td>
                    <td>{stats.total > 0 ? formatPct(stats.positivePct) : '—'}</td>
                    <td>{stats.total > 0 ? formatPct(stats.errorPct) : '—'}</td>
                    <td>{stats.pointPct === null || stats.total === 0 ? '—' : formatPct(stats.pointPct)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Wedstrijden</h2>
        <ul className="matchhistory">
          {dossier.matches.map((match) => (
            <li key={match.matchId}>
              <button type="button" className="matchhistory__item" onClick={() => onOpenMatch(match.matchId)}>
                <span className="matchhistory__date">{match.date}</span>
                <span className="matchhistory__meta">{match.homeAway === 'home' ? 'thuis' : 'uit'}</span>
                <span className={`matchhistory__result matchhistory__result--${resultTone(match.wonByUs)}`}>
                  {match.setsUs}–{match.setsThem}
                </span>
                <span className="matchhistory__meta">
                  {match.wonByUs === null ? 'geen uitslag' : match.wonByUs ? 'gewonnen' : 'verloren'}
                </span>
              </button>
            </li>
          ))}
          {dossier.matches.length === 0 && (
            <li className="card__hint">Nog geen wedstrijden tegen deze tegenstander.</li>
          )}
        </ul>
      </section>
    </div>
  );
}

function resultTone(wonByUs: boolean | null): string {
  if (wonByUs === null) return 'none';
  return wonByUs ? 'won' : 'lost';
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
