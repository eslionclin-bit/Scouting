/**
 * Het scherm op de bank.
 *
 * Dit is geen spiegel van het invoerscherm en geen dashboard om in te zoeken.
 * Het beantwoordt één vraag: wat doe ik nu, en wat zeg ik straks. Daarom staat
 * bovenaan wat er aan de hand is en niet wat er allemaal geteld is — de cijfers
 * staan eronder, als onderbouwing.
 *
 * Er wordt hier niets geschreven aan de wedstrijd; alles komt binnen via de
 * koppeling met het invoerapparaat.
 */

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  buildCoachBriefing,
  compareMetrics,
  formatMetric,
  measureMetrics,
  type CoachCue,
  type MetricComparison,
} from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { ACTION_TYPE_LABELS, QUALITY_LABELS } from '../../domain/protocol';
import { PairingSheet } from '../components/PairingSheet';
import type { PeerSession } from '../hooks/usePeerSession';
import { useQuery, useStore } from '../StoreProvider';

/** Stand op het moment van de laatste time-out, om het effect ervan te zien. */
interface TimeoutMark {
  pointsUs: number;
  pointsThem: number;
}

export interface CoachScreenProps {
  matchId: string;
  session: PeerSession;
  onExit: () => void;
  onOpenDashboard: () => void;
  onOpenOpponent: (opponentId: string) => void;
  onSwitchToScoring: () => void;
}

export function CoachScreen({
  matchId,
  session,
  onExit,
  onOpenDashboard,
  onOpenOpponent,
  onSwitchToScoring,
}: CoachScreenProps): ReactElement {
  const store = useStore();
  const [showPairing, setShowPairing] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);
  const [timeoutMark, setTimeoutMark] = useState<TimeoutMark | null>(null);

  const { data } = useQuery(
    async (instance) => {
      const bundle = await loadMatchBundle(instance, matchId);

      // Wat we eerder zagen telt mee, maar het hoeft niet compleet te zijn: de
      // laatste paar wedstrijden zeggen genoeg en houden dit scherm snel.
      const againstOpponent = (await instance.matches.listByOpponent(bundle.match.opponentTeamId))
        .filter((match) => match.id !== matchId)
        .slice(0, 5);
      const ownRecent = (await instance.matches.list())
        .filter((match) => match.id !== matchId && match.ownTeamId === bundle.match.ownTeamId)
        .slice(0, 8);

      const [opponentHistory, ownHistory] = await Promise.all([
        Promise.all(againstOpponent.map((match) => loadMatchBundle(instance, match.id))),
        Promise.all(ownRecent.map((match) => loadMatchBundle(instance, match.id))),
      ]);

      return { bundle, opponentHistory, ownHistory };
    },
    [matchId],
  );

  const briefing = useMemo(
    () =>
      data
        ? buildCoachBriefing(data.bundle, {
            opponentHistory: data.opponentHistory,
            ownHistory: data.ownHistory,
          })
        : null,
    [data],
  );

  const recent = useMemo(() => {
    if (!data) return [];
    const sets = data.bundle.sets;
    const current = sets.filter((set) => set.set.status === 'live').at(-1) ?? sets.at(-1);
    return (current?.rallies ?? [])
      .filter((entry) => entry.rally.wonBy !== null)
      .slice(-4)
      .reverse();
  }, [data]);

  const setId = data?.bundle.sets.filter((set) => set.set.status === 'live').at(-1)?.set.id ?? null;

  /**
   * Deze set naast ons eigen gemiddelde. Niet als tabel — daar is dit scherm niet
   * voor — maar als tweede getal onder de cijfers die er nu toe doen: 50% sideout
   * betekent iets anders als we normaal op 53% zitten dan als we normaal op 40%
   * zitten.
   */
  const metrics = useMemo(
    () =>
      data
        ? compareMetrics(
            measureMetrics([data.bundle], setId ? { setId } : {}),
            measureMetrics(data.ownHistory),
          )
        : null,
    [data, setId],
  );
  const markKey = setId ? `coach.timeout.${setId}` : null;

  // De markering staat lokaal: hij hoort bij deze bank, niet bij de wedstrijd.
  useEffect(() => {
    if (!markKey) return;
    let cancelled = false;
    void store.getMeta<TimeoutMark>(markKey).then((mark) => {
      if (!cancelled) setTimeoutMark(mark ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [store, markKey]);

  async function markTimeout(): Promise<void> {
    if (!markKey || !briefing) return;
    const mark = { pointsUs: briefing.pointsUs, pointsThem: briefing.pointsThem };
    setTimeoutMark(mark);
    await store.setMeta(markKey, mark);
  }

  if (!data || !briefing) return <div className="boot">Wedstrijd laden…</div>;

  const live = briefing.cues.filter((cue) => cue.source === 'live');
  const urgent = live.filter((cue) => cue.tone === 'urgent');
  const watch = live.filter((cue) => cue.tone === 'watch');
  const good = live.filter((cue) => cue.tone === 'good');
  const history = briefing.cues.filter((cue) => cue.source === 'history');

  return (
    <div className="coach">
      <header className="coach__top">
        <div className="coach__score">
          <span className="coach__sets">
            sets {briefing.setsUs}–{briefing.setsThem}
          </span>
          <strong className="coach__points">
            {briefing.pointsUs}
            <span>–</span>
            {briefing.pointsThem}
          </strong>
          <span className="coach__meta">
            set {briefing.setNumber ?? 1} · tegen {data.bundle.opponent?.name ?? 'onbekend'}
            {briefing.serving ? ` · service ${briefing.serving === 'us' ? 'wij' : 'zij'}` : ''}
            {briefing.rotation ? ` · rotatie R${briefing.rotation}` : ''}
          </span>
        </div>

        <div className="coach__controls">
          <span className={`badge badge--${session.status}`}>
            {session.status === 'connected' ? 'live' : 'niet gekoppeld'}
          </span>
          <button
            type="button"
            className="button button--primary button--timeout"
            onClick={() => {
              setShowTimeout(true);
              void markTimeout();
            }}
          >
            Time-out
          </button>
        </div>
      </header>

      <section className="run">
        <div className="run__strip" aria-hidden="true">
          {briefing.results.slice(-28).map((wonBy, index) => (
            <span key={index} className={`run__tick run__tick--${wonBy}`} />
          ))}
          {briefing.results.length === 0 && <span className="run__empty">nog geen rally's</span>}
        </div>
        <p className="run__legend">
          verloop van deze set · elk blokje is een rally
          {timeoutMark
            ? ` · sinds je time-out ${briefing.pointsUs - timeoutMark.pointsUs}–${
                briefing.pointsThem - timeoutMark.pointsThem
              }`
            : ''}
        </p>
      </section>

      {/* Wat er nu aan de hand is. Dit is de reden dat dit scherm bestaat. */}
      <section className="cues">
        {live.length === 0 ? (
          <p className="cues__empty">
            Nog te weinig gespeeld in deze wedstrijd om iets te durven zeggen. Zodra er genoeg
            rally's in staan, verschijnt hier wat opvalt.
          </p>
        ) : (
          <>
            {[...urgent, ...watch].slice(0, 3).map((cue) => (
              <CueCard key={cue.code + cue.title} cue={cue} />
            ))}
            {good.slice(0, 1).map((cue) => (
              <CueCard key={cue.code + cue.title} cue={cue} />
            ))}
          </>
        )}
      </section>

      {history.length > 0 && (
        <section className="cues cues--history">
          <h2 className="cues__heading">Uit eerdere wedstrijden</h2>
          {history.slice(0, 3).map((cue) => (
            <CueCard key={cue.code + cue.title} cue={cue} />
          ))}
        </section>
      )}

      <section className="coach__numbers">
        <Figure
          label="Sideout"
          value={briefing.sideoutPct === null ? '—' : pct(briefing.sideoutPct)}
          hint={withOwn('op hun service', metrics, 'sideout')}
        />
        <Figure
          label="Op eigen service"
          value={briefing.servePointPct === null ? '—' : pct(briefing.servePointPct)}
          hint={withOwn("rally's gewonnen", metrics, 'breakPoint')}
        />
        <Figure
          label="Aanval"
          value={briefing.attackEfficiency === null ? '—' : signed(briefing.attackEfficiency)}
          hint={withOwn(`${briefing.attackTotal} pogingen`, metrics, 'attackEfficiency')}
        />
        <Figure label="Eigen fouten" value={String(briefing.errorsUs)} hint="deze set" />
      </section>

      <section className="card">
        <h2>Sideout per rotatie</h2>
        <div className="rotbars">
          {[1, 2, 3, 4, 5, 6].map((rotation) => {
            const stats = briefing.rotations.find((entry) => entry.rotation === rotation);
            const value = stats?.sideoutPct ?? null;
            return (
              <div
                key={rotation}
                className={`rotbar ${briefing.rotation === rotation ? 'rotbar--current' : ''}`}
              >
                <span className="rotbar__value">{value === null ? '—' : pct(value)}</span>
                <div className="rotbar__track" aria-hidden="true">
                  {/* Zonder waarnemingen geen staafje: een streepje op nul zou
                      lezen als 'nul procent' in plaats van 'nog niet gezien'. */}
                  {value !== null && (
                    <div className="rotbar__fill" style={{ height: `${Math.max(value * 100, 4)}%` }} />
                  )}
                </div>
                <span className="rotbar__label">R{rotation}</span>
                <span className="rotbar__sample">{stats ? `${stats.receiveRallies}×` : ''}</span>
              </div>
            );
          })}
        </div>
        {briefing.nextRotation && (
          <p className="card__hint rotbars__next">
            Na de volgende sideout kom je in R{briefing.nextRotation.rotation} —{' '}
            {briefing.nextRotation.stats?.sideoutPct == null
              ? 'daar heb je deze set nog niet in gestaan'
              : `${pct(briefing.nextRotation.stats.sideoutPct)} sideout op ${briefing.nextRotation.stats.receiveRallies} rally's`}
            .
          </p>
        )}
      </section>

      <section className="card">
        <h2>Laatste rally's</h2>
        {recent.length === 0 ? (
          <p className="card__hint">Nog geen afgeronde rally's.</p>
        ) : (
          <ul className="rallylog">
            {recent.map((entry) => (
              <li key={entry.rally.id} className={`rallylog__item rallylog__item--${entry.rally.wonBy}`}>
                <span className="rallylog__score">
                  {entry.rally.pointsUsAfter ?? '–'}–{entry.rally.pointsThemAfter ?? '–'}
                </span>
                <span className="rallylog__outcome">
                  punt {entry.rally.wonBy === 'us' ? 'wij' : 'zij'}
                </span>
                <span className="rallylog__actions">
                  {entry.actions
                    .map(
                      (action) =>
                        `${action.playerNumber != null ? `#${action.playerNumber} ` : ''}${ACTION_TYPE_LABELS[
                          action.type
                        ].toLowerCase()} ${QUALITY_LABELS[action.quality].toLowerCase()}`,
                    )
                    .join(' → ') || 'geen acties'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="coach__footer">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Wedstrijden
        </button>
        <button type="button" className="button button--ghost" onClick={() => setShowPairing(true)}>
          Koppelen
        </button>
        <button type="button" className="button button--ghost" onClick={onOpenDashboard}>
          Alle cijfers
        </button>
        {data.bundle.opponent && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => onOpenOpponent(data.bundle.opponent!.id)}
          >
            Dossier
          </button>
        )}
        <button type="button" className="button button--ghost" onClick={onSwitchToScoring}>
          Zelf invoeren
        </button>
      </footer>

      {showTimeout && (
        <TimeoutOverlay points={briefing.talkingPoints} onClose={() => setShowTimeout(false)} />
      )}

      {showPairing && (
        <PairingSheet role="viewer" session={session} onClose={() => setShowPairing(false)} />
      )}
    </div>
  );
}

function CueCard({ cue }: { cue: CoachCue }): ReactElement {
  return (
    <article className={`cue cue--${cue.tone} ${cue.source === 'history' ? 'cue--history' : ''}`}>
      {cue.source === 'history' && <span className="cue__source">eerder gezien</span>}
      <h3 className="cue__title">{cue.title}</h3>
      <p className="cue__detail">{cue.detail}</p>
    </article>
  );
}

/**
 * Wat je in de time-out zegt, groot genoeg om vanaf een tafel te lezen terwijl
 * je staat. Hoogstens drie punten: meer onthoudt niemand, en meer zeggen kost
 * de tijd die je niet hebt.
 */
function TimeoutOverlay({
  points,
  onClose,
}: {
  points: readonly string[];
  onClose: () => void;
}): ReactElement {
  return (
    <div className="timeout" role="dialog" aria-modal="true" aria-label="Time-out">
      <div className="timeout__inner">
        <h2>Time-out</h2>
        {points.length === 0 ? (
          <p className="timeout__empty">
            Geen bijzonderheden uit de cijfers. Ga af op wat je ziet.
          </p>
        ) : (
          <ol className="timeout__points">
            {points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ol>
        )}
        <button type="button" className="button button--primary button--wide" onClick={onClose}>
          Sluiten
        </button>
      </div>
    </div>
  );
}

function Figure({ label, value, hint }: { label: string; value: string; hint: string }): ReactElement {
  return (
    <div className="figure">
      <span className="figure__label">{label}</span>
      <strong className="figure__value">{value}</strong>
      <span className="figure__hint">{hint}</span>
    </div>
  );
}

/**
 * Zet ons eigen gemiddelde achter de toelichting, maar alleen als er genoeg
 * wedstrijden achter liggen — anders vergelijk je met ruis.
 */
function withOwn(
  hint: string,
  metrics: MetricComparison[] | null,
  key: 'sideout' | 'breakPoint' | 'attackEfficiency',
): string {
  const row = metrics?.find((entry) => entry.metric.key === key);
  if (!row || row.own.value === null || row.vsOwn === null) return hint;
  return `${hint} · wij ${formatMetric(key, row.own.value)}`;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
