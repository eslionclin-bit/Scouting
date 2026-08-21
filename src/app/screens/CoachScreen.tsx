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

import { useMemo, useState, type ReactElement } from 'react';
import { buildCoachBriefing, type CoachCue } from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { ACTION_TYPE_LABELS, QUALITY_LABELS } from '../../domain/protocol';
import { PairingSheet } from '../components/PairingSheet';
import type { PeerSession } from '../hooks/usePeerSession';
import { useQuery } from '../StoreProvider';

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
  const [showPairing, setShowPairing] = useState(false);
  const [showTimeout, setShowTimeout] = useState(false);

  const { data } = useQuery(async (store) => loadMatchBundle(store, matchId), [matchId]);
  const briefing = useMemo(() => (data ? buildCoachBriefing(data) : null), [data]);

  const recent = useMemo(() => {
    if (!data) return [];
    const sets = data.sets;
    const current = sets.filter((set) => set.set.status === 'live').at(-1) ?? sets.at(-1);
    return (current?.rallies ?? [])
      .filter((entry) => entry.rally.wonBy !== null)
      .slice(-4)
      .reverse();
  }, [data]);

  if (!data || !briefing) return <div className="boot">Wedstrijd laden…</div>;

  const urgent = briefing.cues.filter((cue) => cue.tone === 'urgent');
  const watch = briefing.cues.filter((cue) => cue.tone === 'watch');
  const good = briefing.cues.filter((cue) => cue.tone === 'good');

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
            set {briefing.setNumber ?? 1} · tegen {data.opponent?.name ?? 'onbekend'}
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
            onClick={() => setShowTimeout(true)}
          >
            Time-out
          </button>
        </div>
      </header>

      {/* Wat er nu aan de hand is. Dit is de reden dat dit scherm bestaat. */}
      <section className="cues">
        {briefing.cues.length === 0 ? (
          <p className="cues__empty">
            Nog te weinig gespeeld om iets te durven zeggen. Zodra er genoeg rally's in staan,
            verschijnt hier wat opvalt.
          </p>
        ) : (
          <>
            {[...urgent, ...watch].map((cue) => (
              <CueCard key={cue.code + cue.title} cue={cue} />
            ))}
            {good.map((cue) => (
              <CueCard key={cue.code + cue.title} cue={cue} />
            ))}
          </>
        )}
      </section>

      <section className="coach__numbers">
        <Figure
          label="Sideout"
          value={briefing.sideoutPct === null ? '—' : pct(briefing.sideoutPct)}
          hint="op hun service"
        />
        <Figure
          label="Op eigen service"
          value={briefing.servePointPct === null ? '—' : pct(briefing.servePointPct)}
          hint="rally's gewonnen"
        />
        <Figure
          label="Aanval"
          value={briefing.attackEfficiency === null ? '—' : signed(briefing.attackEfficiency)}
          hint={`${briefing.attackTotal} pogingen`}
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
        {data.opponent && (
          <button
            type="button"
            className="button button--ghost"
            onClick={() => onOpenOpponent(data.opponent!.id)}
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
    <article className={`cue cue--${cue.tone}`}>
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

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function signed(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
