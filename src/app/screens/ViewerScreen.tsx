/**
 * Meeleesscherm — de coach op de bank.
 *
 * Een spiegel van scherm A, zonder invoer: dezelfde rally-keten, dezelfde
 * stand, live bijgewerkt zodra de invoerder iets vastlegt. Plus de cijfers die
 * tijdens een time-out tellen, zodat de coach niet eerst het dashboard hoeft te
 * openen.
 *
 * Dit scherm schrijft niets aan de wedstrijddata; alles wat hier staat komt
 * binnen via de koppeling.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { filterActions, statsByRotation, statsByType, toActionRows, toRallyRows } from '../../analysis';
import { loadMatchBundle } from '../../db/bundle';
import { ACTION_TYPE_LABELS, QUALITY_LABELS } from '../../domain/protocol';
import type { Player } from '../../domain/types';
import { PairingSheet } from '../components/PairingSheet';
import { RallyChain } from '../components/RallyChain';
import { StatTile } from '../components/StatTile';
import type { PeerSession } from '../hooks/usePeerSession';
import { useQuery } from '../StoreProvider';

export interface ViewerScreenProps {
  matchId: string;
  session: PeerSession;
  onExit: () => void;
  onOpenDashboard: () => void;
  onSwitchToScoring: () => void;
}

export function ViewerScreen({
  matchId,
  session,
  onExit,
  onOpenDashboard,
  onSwitchToScoring,
}: ViewerScreenProps): ReactElement {
  const [showPairing, setShowPairing] = useState(false);

  const { data } = useQuery(async (store) => loadMatchBundle(store, matchId), [matchId]);

  const view = useMemo(() => {
    if (!data) return null;

    const sets = data.sets;
    const currentSet = sets.filter((set) => set.set.status === 'live').at(-1) ?? sets.at(-1);
    const rallies = currentSet?.rallies ?? [];
    const openRally = rallies.find((entry) => entry.rally.wonBy === null);
    const recent = rallies.filter((entry) => entry.rally.wonBy !== null).slice(-6).reverse();

    const actionRows = toActionRows(data);
    const ourTypes = statsByType(filterActions(actionRows, { team: 'us' }));
    const rotations = statsByRotation(toRallyRows(data));
    const receiveRallies = rotations.reduce((sum, entry) => sum + entry.receiveRallies, 0);
    const sideouts = rotations.reduce(
      (sum, entry) => sum + Math.round((entry.sideoutPct ?? 0) * entry.receiveRallies),
      0,
    );

    const playersById = new Map<string, Player>(data.players.map((player) => [player.id, player]));

    return {
      currentSet,
      openRally,
      recent,
      playersById,
      attack: ourTypes.attack,
      serve: ourTypes.serve,
      sideoutPct: receiveRallies > 0 ? sideouts / receiveRallies : null,
    };
  }, [data]);

  if (!data || !view) return <div className="boot">Wedstrijd laden…</div>;

  const { currentSet, openRally, recent } = view;

  return (
    <div className="viewer">
      <header className="topbar">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Wedstrijden
        </button>

        <div className="topbar__score">
          <span className="topbar__set">Set {currentSet?.set.setNumber ?? 1} · meelezen</span>
          <strong className="topbar__points">
            {currentSet?.set.pointsUs ?? 0} <span>–</span> {currentSet?.set.pointsThem ?? 0}
          </strong>
          <span className="topbar__meta">
            {data.match.homeAway === 'home' ? 'thuis' : 'uit'} tegen {data.opponent?.name ?? 'onbekend'}
            {openRally ? ` · rally ${openRally.rally.sequence} · rotatie R${openRally.rally.rotationUs ?? 1}` : ''}
          </span>
        </div>

        <div className="topbar__sets">
          <ConnectionBadge session={session} />
          <button type="button" className="button button--ghost" onClick={() => setShowPairing(true)}>
            Koppelen
          </button>
          <button type="button" className="button button--ghost" onClick={onOpenDashboard}>
            Cijfers
          </button>
          <button type="button" className="button button--ghost" onClick={onSwitchToScoring}>
            Zelf invoeren
          </button>
        </div>
      </header>

      <RallyChain actions={openRally?.actions ?? []} playersById={view.playersById} />

      <div className="tiles">
        <StatTile
          label="Sideout"
          value={view.sideoutPct === null ? '—' : formatPct(view.sideoutPct)}
          hint="rally's gewonnen op opslag tegenstander"
        />
        <StatTile
          label="Rendement aanval"
          value={view.attack.efficiency === null ? '—' : formatSigned(view.attack.efficiency)}
          hint={`${view.attack.counts.perfect} punt · ${view.attack.counts.error} fout`}
        />
        <StatTile
          label="Opslag"
          value={view.serve.total === 0 ? '—' : formatPct(view.serve.pointPct ?? 0)}
          hint={`${view.serve.counts.error} fout van ${view.serve.total}`}
        />
      </div>

      <section className="card">
        <h2>Laatste rally's</h2>
        {recent.length === 0 && <p className="card__hint">Nog geen afgeronde rally's.</p>}
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
      </section>

      {showPairing && (
        <PairingSheet role="viewer" session={session} onClose={() => setShowPairing(false)} />
      )}
    </div>
  );
}

export function ConnectionBadge({ session }: { session: PeerSession }): ReactElement {
  const label =
    session.status === 'connected'
      ? 'verbonden'
      : session.status === 'waiting'
        ? 'koppelen…'
        : session.status === 'error'
          ? 'geen verbinding'
          : 'niet gekoppeld';

  return (
    <span className={`badge badge--${session.status}`} title={session.error ?? undefined}>
      {label}
      {session.lastUpdateAt && session.status === 'connected'
        ? ` · ${new Date(session.lastUpdateAt).toLocaleTimeString('nl-NL', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}`
        : ''}
    </span>
  );
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSigned(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
