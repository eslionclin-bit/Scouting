/**
 * Scherm B — analysedashboard.
 *
 * Na de wedstrijd of tussen twee sets door: wat deden we, en waar zit het lek.
 * Alles is een telling uit de ingevoerde acties, met de filters van de
 * projectbrief erboven: set, rotatie en speler. De filters gelden voor het hele
 * scherm, zodat elk getal bij dezelfde selectie hoort.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { loadMatchBundle } from '../../db/bundle';
import {
  attackByPhase,
  compareMetrics,
  filterActions,
  filterRallies,
  measureMetrics,
  sideoutByPass,
  statsByPlayer,
  statsByRotation,
  statsByType,
  summarize,
  toActionRows,
  toRallyRows,
  zoneTally,
} from '../../analysis';
import { ACTION_TYPE_LABELS } from '../../domain/protocol';
import { ACTION_TYPES, type ActionType } from '../../domain/types';
import { QualityBar, QualityLegend } from '../components/QualityBar';
import { MetricTable } from '../components/MetricTable';
import { PassValue } from '../components/PassValue';
import { useReference } from '../hooks/useReference';
import { StatTile } from '../components/StatTile';
import { ZoneHeatmap } from '../components/ZoneHeatmap';
import { useQuery } from '../StoreProvider';

export interface DashboardScreenProps {
  matchId: string;
  onExit: () => void;
  onOpenOpponent?: (opponentId: string) => void;
  onOpenPlayer?: (playerId: string) => void;
}

export function DashboardScreen({
  matchId,
  onExit,
  onOpenOpponent,
  onOpenPlayer,
}: DashboardScreenProps): ReactElement {
  const [setId, setSetId] = useState<string | null>(null);
  const [rotation, setRotation] = useState<number | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [zoneType, setZoneType] = useState<ActionType>('attack');
  const [zoneSide, setZoneSide] = useState<'from' | 'to'>('from');

  const { data, error } = useQuery(
    async (store) => {
      const bundle = await loadMatchBundle(store, matchId);
      // De andere wedstrijden van dit team vormen het eigen gemiddelde: zonder
      // dat referentiepunt is een percentage niet te lezen.
      const others = (await store.matches.list()).filter(
        (match) => match.id !== matchId && match.ownTeamId === bundle.match.ownTeamId,
      );
      const history = await Promise.all(
        others.map((match) => loadMatchBundle(store, match.id)),
      );
      return { bundle, history };
    },
    [matchId],
  );

  const bundle = data?.bundle ?? null;
  const reference = useReference();

  const passValue = useMemo(
    () => (data ? sideoutByPass([data.bundle], setId ? { setId } : {}) : null),
    [data, setId],
  );

  const metrics = useMemo(() => {
    if (!data) return null;
    return compareMetrics(
      measureMetrics([data.bundle], setId ? { setId } : {}),
      measureMetrics(data.history),
      reference.level,
    );
  }, [data, setId, reference.level]);

  const view = useMemo(() => {
    if (!bundle) return null;
    const filter = { setId, rotation };
    const actionRows = filterActions(toActionRows(bundle), filter);
    const rallyRows = filterRallies(toRallyRows(bundle), filter);

    const ours = filterActions(actionRows, { team: 'us' });
    const theirs = filterActions(actionRows, { team: 'them' });
    const selected = playerId ? filterActions(ours, { playerId }) : ours;

    const rotations = statsByRotation(rallyRows);
    const receiveRallies = rotations.reduce((sum, entry) => sum + entry.receiveRallies, 0);
    const sideouts = rotations.reduce(
      (sum, entry) => sum + Math.round((entry.sideoutPct ?? 0) * entry.receiveRallies),
      0,
    );

    return {
      actionRows,
      rallyRows,
      ours,
      theirs,
      selected,
      ourTypes: statsByType(selected),
      theirTypes: statsByType(theirs),
      players: statsByPlayer(
        ours,
        bundle.players.filter((player) => player.teamId === bundle.match.ownTeamId),
      ),
      rotations,
      phases: attackByPhase(actionRows),
      pointsUs: rallyRows.filter((row) => row.rally.wonBy === 'us').length,
      pointsThem: rallyRows.filter((row) => row.rally.wonBy === 'them').length,
      sideoutPct: receiveRallies > 0 ? sideouts / receiveRallies : null,
    };
  }, [bundle, setId, rotation, playerId]);

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
  if (!data || !view || !metrics || !passValue)
    return <div className="boot">Cijfers berekenen…</div>;

  const match = data.bundle;
  const ownPlayers = match.players.filter((player) => player.teamId === match.match.ownTeamId);
  const attackStats = view.ourTypes.attack;

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Terug
        </button>
        <div>
          <h1>{match.opponent?.name ?? 'Wedstrijd'}</h1>
          <p className="dashboard__sub">
            {match.match.date} · {match.match.homeAway === 'home' ? 'thuis' : 'uit'} ·{' '}
            {match.sets.map((set) => `${set.set.pointsUs}-${set.set.pointsThem}`).join(' · ') ||
              'nog geen sets'}
          </p>
        </div>
        {onOpenOpponent && match.opponent && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => onOpenOpponent(match.opponent!.id)}
          >
            Dossier tegenstander
          </button>
        )}
      </header>

      <div className="filters" role="group" aria-label="Filters">
        <FilterGroup label="Set">
          <FilterChip active={setId === null} onClick={() => setSetId(null)}>
            Alles
          </FilterChip>
          {match.sets.map((set) => (
            <FilterChip
              key={set.set.id}
              active={setId === set.set.id}
              onClick={() => setSetId(set.set.id)}
            >
              {set.set.setNumber}
            </FilterChip>
          ))}
        </FilterGroup>

        <FilterGroup label="Rotatie">
          <FilterChip active={rotation === null} onClick={() => setRotation(null)}>
            Alles
          </FilterChip>
          {[1, 2, 3, 4, 5, 6].map((value) => (
            <FilterChip key={value} active={rotation === value} onClick={() => setRotation(value)}>
              R{value}
            </FilterChip>
          ))}
        </FilterGroup>

        <FilterGroup label="Speler">
          <FilterChip active={playerId === null} onClick={() => setPlayerId(null)}>
            Alles
          </FilterChip>
          {ownPlayers.map((player) => (
            <FilterChip
              key={player.id}
              active={playerId === player.id}
              onClick={() => setPlayerId(player.id)}
            >
              #{player.number}
            </FilterChip>
          ))}
        </FilterGroup>
      </div>

      <div className="tiles">
        <StatTile label="Punten wij" value={String(view.pointsUs)} tone="us" />
        <StatTile label="Punten zij" value={String(view.pointsThem)} tone="them" />
        <StatTile
          label="Rendement aanval"
          value={attackStats.efficiency === null ? '—' : formatSigned(attackStats.efficiency)}
          hint={`${attackStats.counts.perfect} punt · ${attackStats.counts.error} fout · ${attackStats.total} totaal`}
        />
        <StatTile
          label="Sideout"
          value={view.sideoutPct === null ? '—' : formatPct(view.sideoutPct)}
          hint="rally's gewonnen op service tegenstander"
        />
      </div>

      <section className="card">
        <h2>Hoe verhoudt dit zich?</h2>
        <p className="card__hint">
          {data.history.length > 0
            ? `Een percentage is pas te lezen naast iets anders: ons eigen gemiddelde over de andere wedstrijden, en ${referenceHint(reference)}. Tik op een referentiegetal om te zien waar het vandaan komt.`
            : `Dit is de eerste wedstrijd van dit team, dus er is nog geen eigen gemiddelde om naast te leggen. Wat er wel naast staat is ${referenceHint(reference)} — tik erop om te zien waar dat getal vandaan komt.`}
        </p>
        <MetricTable
          rows={metrics}
          nowLabel={setId ? 'Deze set' : 'Deze wedstrijd'}
          {...(data.history.length > 0 ? { ownLabel: 'Ons gemiddelde' } : {})}
          referenceLabel={reference.level.label}
        />
      </section>

      <section className="card">
        <h2>Wat een pass oplevert</h2>
        <p className="card__hint">
          Per ontvangen rally telt de eerste pass. Rally's zonder ingevoerde pass staan er niet
          tussen.
        </p>
        <PassValue data={passValue} />
      </section>

      <section className="card">
        <h2>Eerste bal of transitie</h2>
        <p className="card__hint">
          Een aanval na onze eigen pass is een opgezette aanval; alles daarna komt uit een
          verdediging. Dat zijn twee verschillende dingen om op te trainen.
        </p>
        <div className="tablewrap">
          <table className="stats">
            <thead>
              <tr>
                <th scope="col">Fase</th>
                <th scope="col">Aanvallen</th>
                <th scope="col">Punt</th>
                <th scope="col">Fout</th>
                <th scope="col">Rendement</th>
                <th scope="col">Verdeling</th>
              </tr>
            </thead>
            <tbody>
              {view.phases.map((entry) => (
                <tr key={entry.phase}>
                  <th scope="row">
                    {entry.phase === 'reception' ? 'Eerste bal (na pass)' : 'Transitie'}
                  </th>
                  <td>{entry.stats.total}</td>
                  <td>{entry.stats.total > 0 ? formatPct(entry.stats.pointPct ?? 0) : '—'}</td>
                  <td>{entry.stats.total > 0 ? formatPct(entry.stats.errorPct) : '—'}</td>
                  <td
                    className={
                      (entry.stats.efficiency ?? 0) >= 0 ? 'stats__good' : 'stats__bad'
                    }
                  >
                    {entry.stats.total > 0 ? formatSigned(entry.stats.efficiency ?? 0) : '—'}
                  </td>
                  <td>
                    <QualityBar counts={entry.stats.counts} total={entry.stats.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Per speler</h2>
        <QualityLegend />
        <div className="tablewrap">
          <table className="stats">
            <thead>
              <tr>
                <th scope="col">Speler</th>
                <th scope="col">Acties</th>
                <th scope="col">Service</th>
                <th scope="col">Pass</th>
                <th scope="col">Aanval</th>
                <th scope="col">Fout%</th>
                <th scope="col">Verdeling</th>
              </tr>
            </thead>
            <tbody>
              {view.players.map((player) => (
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
                  <td>{describeScoring(player.byType.serve)}</td>
                  <td>{describePassing(player.byType.reception)}</td>
                  <td>{describeScoring(player.byType.attack)}</td>
                  <td>{player.overall.total > 0 ? formatPct(player.overall.errorPct) : '—'}</td>
                  <td>
                    <QualityBar counts={player.overall.counts} total={player.overall.total} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Per actietype</h2>
        <div className="tablewrap">
          <table className="stats">
            <thead>
              <tr>
                <th scope="col">Actie</th>
                <th scope="col">Wij</th>
                <th scope="col">Verdeling wij</th>
                <th scope="col">Zij</th>
                <th scope="col">Verdeling zij</th>
              </tr>
            </thead>
            <tbody>
              {ACTION_TYPES.map((type) => (
                <tr key={type}>
                  <th scope="row">{ACTION_TYPE_LABELS[type]}</th>
                  <td>{describeAny(view.ourTypes[type])}</td>
                  <td>
                    <QualityBar
                      counts={view.ourTypes[type].counts}
                      total={view.ourTypes[type].total}
                    />
                  </td>
                  <td>{describeAny(view.theirTypes[type])}</td>
                  <td>
                    <QualityBar
                      counts={view.theirTypes[type].counts}
                      total={view.theirTypes[type].total}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h2>Zones</h2>
          <div className="choices">
            {(['attack', 'serve'] as const).map((type) => (
              <FilterChip key={type} active={zoneType === type} onClick={() => setZoneType(type)}>
                {ACTION_TYPE_LABELS[type]}
              </FilterChip>
            ))}
            <FilterChip active={zoneSide === 'from'} onClick={() => setZoneSide('from')}>
              Vanaf
            </FilterChip>
            <FilterChip active={zoneSide === 'to'} onClick={() => setZoneSide('to')}>
              Waarheen
            </FilterChip>
          </div>
        </div>
        <p className="card__hint">
          {zoneSide === 'from'
            ? `Vertrekzone: van waaruit wordt ${zoneType === 'attack' ? 'aangevallen' : 'geserveerd'}.`
            : 'Landingszone: waar de bal terechtkwam. Alleen ingevuld als de invoerder er tijd voor had.'}
        </p>
        <div className="heatmaps">
          <ZoneHeatmap
            title="Wij"
            subtitle={ACTION_TYPE_LABELS[zoneType].toLowerCase()}
            tally={zoneTally(filterActions(view.ours, { type: zoneType }), zoneSide)}
          />
          <ZoneHeatmap
            title="Tegenstander"
            subtitle={ACTION_TYPE_LABELS[zoneType].toLowerCase()}
            tally={zoneTally(filterActions(view.theirs, { type: zoneType }), zoneSide)}
          />
        </div>
      </section>

      <section className="card">
        <h2>Per rotatie</h2>
        <p className="card__hint">
          R1 is de startopstelling van de set; daarna draait het team door na elke gewonnen rally op
          de service van de tegenstander.
        </p>
        <div className="tablewrap">
          <table className="stats">
            <thead>
              <tr>
                <th scope="col">Rotatie</th>
                <th scope="col">Rally's</th>
                <th scope="col">Voor</th>
                <th scope="col">Tegen</th>
                <th scope="col">Sideout</th>
                <th scope="col">Punt op eigen service</th>
              </tr>
            </thead>
            <tbody>
              {view.rotations.map((entry) => (
                <tr key={entry.rotation}>
                  <th scope="row">R{entry.rotation}</th>
                  <td>{entry.rallies}</td>
                  <td>{entry.pointsFor}</td>
                  <td>{entry.pointsAgainst}</td>
                  <td>
                    {entry.sideoutPct === null
                      ? '—'
                      : `${formatPct(entry.sideoutPct)} (${entry.receiveRallies})`}
                  </td>
                  <td>
                    {entry.serveRallies === 0
                      ? '—'
                      : `${formatPct(entry.servePoints / entry.serveRallies)} (${entry.serveRallies})`}
                  </td>
                </tr>
              ))}
              {view.rotations.length === 0 && (
                <tr>
                  <td colSpan={6}>Nog geen afgeronde rally's in deze selectie.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }): ReactElement {
  return (
    <div className="filters__group">
      <span className="filters__label">{label}</span>
      <div className="filters__chips">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): ReactElement {
  return (
    <button
      type="button"
      className={`chip chip--small ${active ? 'chip--active' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

type Stats = ReturnType<typeof summarize>;

/** Service, aanval, blok: puntpercentage en rendement zeggen het meest. */
function describeScoring(stats: Stats): string {
  if (stats.total === 0) return '—';
  return `${stats.total} · ${formatPct(stats.pointPct ?? 0)} pt · ${formatPct(stats.errorPct)} fout`;
}

/** Pass, set-up, verdediging: hoe vaak bleef de bal goed bruikbaar. */
function describePassing(stats: Stats): string {
  if (stats.total === 0) return '—';
  return `${stats.total} · ${formatPct(stats.positivePct)} positief`;
}

function describeAny(stats: Stats): string {
  return stats.pointPct === null ? describePassing(stats) : describeScoring(stats);
}

/** Zegt waar de referentiekolom vandaan komt: geteld of geschat. */
function referenceHint(reference: ReturnType<typeof useReference>): string {
  return reference.computed
    ? `wat het is in de ${reference.computed.source.matches} ingelezen referentiewedstrijden`
    : 'waar het op topniveau ligt';
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
