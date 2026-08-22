/**
 * Scherm C — opponent-dossier.
 *
 * Alles wat we van deze tegenstander weten, over alle wedstrijden heen. De
 * bevindingen komen uit tellingen en dragen het aantal waarnemingen bij zich;
 * is er te weinig gezien, dan staat er niets. Liever een leeg dossier dan een
 * patroon dat op vier ballen berust.
 */

import { useMemo, type ReactElement } from 'react';
import { buildOpponentDossier, MIN_SAMPLE } from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { ACTION_TYPE_LABELS } from '../../domain/protocol';
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
