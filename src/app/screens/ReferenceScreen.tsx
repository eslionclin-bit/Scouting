/**
 * Referentiemateriaal: wedstrijden van andere ploegen, ingelezen uit
 * scoutbestanden.
 *
 * Waarom dit scherm bestaat: zonder vergelijkingsmateriaal is een percentage
 * niet te lezen, en zonder ingelezen wedstrijden is de derde kolom in de
 * cijfertabellen niet meer dan een ordegrootte uit de literatuur. Elk bestand
 * dat hier bij komt maakt die kolom harder — en het staat er altijd bij waar
 * hij op berust.
 */

import { useState, type ChangeEvent, type ReactElement } from 'react';
import { depthOf, formatMetric, METRIC_KEYS, METRICS } from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import type { ImportSummary } from '../../db/repositories/imports';
import { decodeDvw, DvwParseError, interpretDvw, parseDvw } from '../../import/dvw';
import { MetricTable } from '../components/MetricTable';
import { useReference } from '../hooks/useReference';
import { useQuery, useStore } from '../StoreProvider';

export interface ReferenceScreenProps {
  onExit: () => void;
}

/** Coderingen die in scoutbestanden voorkomen. UTF-8 wordt vanzelf herkend. */
const ENCODINGS = [
  { id: 'windows-1252', label: 'West-Europa (windows-1252)' },
  { id: 'windows-1250', label: 'Midden-Europa (windows-1250)' },
];

export function ReferenceScreen({ onExit }: ReferenceScreenProps): ReactElement {
  const store = useStore();
  const { level, computed } = useReference();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<ImportSummary[]>([]);
  const [encoding, setEncoding] = useState(ENCODINGS[0]!.id);

  const { data: matches } = useQuery(async (instance) => {
    const list = await instance.matches.listReference();
    return Promise.all(
      list.map(async (match) => {
        const bundle = await loadMatchBundle(instance, match.id);
        return {
          match,
          home: bundle.ownTeam?.name ?? 'onbekend',
          visiting: bundle.opponent?.name ?? 'onbekend',
          rallies: bundle.sets.reduce((sum, set) => sum + set.rallies.length, 0),
          depth: depthOf(bundle),
        };
      }),
    );
  }, []);

  async function handleFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = [...(event.target.files ?? [])];
    event.target.value = '';
    if (files.length === 0) return;

    setBusy(true);
    setError(null);
    const summaries: ImportSummary[] = [];

    try {
      for (const file of files) {
        const text = decodeDvw(await file.arrayBuffer(), encoding);
        const imported = interpretDvw(parseDvw(text));
        summaries.push(await store.imports.importScoutedMatch(imported, { fileName: file.name }));
      }
      setAdded(summaries);
    } catch (cause) {
      setError(
        cause instanceof DvwParseError
          ? cause.message
          : `Inlezen mislukt: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(matchId: string): Promise<void> {
    await store.matches.remove(matchId);
    setAdded((current) => current.filter((entry) => entry.matchId !== matchId));
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Terug
        </button>
        <div>
          <h1>Referentiemateriaal</h1>
          <p className="dashboard__sub">
            {computed
              ? computed.level.description
              : 'Nog niets ingelezen — de referentiekolom is nu een ordegrootte uit de literatuur.'}
          </p>
        </div>
      </header>

      <section className="card">
        <h2>Scoutbestand inlezen</h2>
        <p className="card__hint">
          DataVolley-bestanden (.dvw). Elke ingelezen wedstrijd telt mee voor de referentiekolom,
          met beide ploegen. Ze komen niet in jullie eigen wedstrijdlijst en tellen niet mee in ons
          eigen gemiddelde.
        </p>

        <label className="field">
          <span>Tekstcodering als namen er vreemd uitzien</span>
          <select value={encoding} onChange={(event) => setEncoding(event.target.value)}>
            {ENCODINGS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="button button--primary filebutton">
          {busy ? 'Bezig met inlezen…' : 'Bestand kiezen'}
          <input
            type="file"
            accept=".dvw,.txt"
            multiple
            disabled={busy}
            onChange={(event) => void handleFiles(event)}
          />
        </label>

        {error && <p className="setup__error">{error}</p>}

        {added.length > 0 && (
          <ul className="findings">
            {added.map((summary) => (
              <li key={summary.matchId} className="findings__item">
                <span className="findings__text">
                  {summary.homeTeam} – {summary.visitingTeam}
                </span>
                <span className="findings__sample">
                  {summary.sets} sets · {summary.rallies} rally's · {summary.actions} acties ·{' '}
                  {summary.actionsPerRally.toFixed(1)} per rally
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2>Wat het nu oplevert</h2>
        <p className="card__hint">
          De referentiekolom zoals hij op het dashboard en in het teamdossier staat. Tik op een
          getal voor de herkomst.
        </p>
        <MetricTable
          rows={METRIC_KEYS.map((key) => ({
            metric: METRICS[key],
            now: { value: null, sample: 0 },
            own: { value: null, sample: 0 },
            reference: level.values[key],
            vsOwn: null,
          }))}
          nowLabel=""
          referenceLabel={level.label}
          hideNow
        />
      </section>

      <section className="card">
        <h2>Ingelezen wedstrijden</h2>
        {matches === undefined ? (
          <p className="card__hint">Laden…</p>
        ) : matches.length === 0 ? (
          <p className="card__hint">
            Nog geen bestanden ingelezen. Openbare voorbeeldbestanden staan bij het
            openvolley-project; verder komen ze van clubs die met DataVolley of VolleyStation
            scouten.
          </p>
        ) : (
          <div className="tablewrap">
            <table className="stats">
              <thead>
                <tr>
                  <th scope="col">Wedstrijd</th>
                  <th scope="col">Datum</th>
                  <th scope="col">Competitie</th>
                  <th scope="col">Rally's</th>
                  <th scope="col">Diepte</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {matches.map((entry) => (
                  <tr key={entry.match.id}>
                    <th scope="row">
                      {entry.home} – {entry.visiting}
                    </th>
                    <td>{entry.match.date}</td>
                    <td>{entry.match.competition ?? '—'}</td>
                    <td>{entry.rallies}</td>
                    <td>
                      {entry.depth.toFixed(1)}
                      <span className="metrics__sample">
                        {entry.depth >= 4 ? 'volledig' : 'alleen rally-cijfers'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => void remove(entry.match.id)}
                      >
                        Verwijderen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Wat je uit deze cijfers wel en niet mag lezen</h2>
        <ul className="advice">
          <li className="advice__item">
            <strong>Sideout en punt op eigen service zijn hard te vergelijken.</strong>
            <span className="advice__because">
              Die volgen uit de uitslag van een rally, en die betekent overal hetzelfde.
            </span>
          </li>
          <li className="advice__item">
            <strong>De vier actiecijfers zijn een richting.</strong>
            <span className="advice__because">
              DataVolley waardeert een bal op zes niveaus, wij op vier. Die vertaling staat in de
              code beschreven, maar hij blijft een vertaling.
            </span>
          </li>
          <li className="advice__item">
            <strong>Vergelijk met een niveau dat iets zegt.</strong>
            <span className="advice__because">
              Een Bundesliga-play-off is geen maatstaf voor volgende zaterdag. Hij laat zien waar de
              bovengrens ligt, niet wat het doel voor dit seizoen is.
            </span>
          </li>
        </ul>
      </section>
    </div>
  );
}
