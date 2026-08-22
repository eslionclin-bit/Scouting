/**
 * Opstelling en wissels.
 *
 * Alleen de startopstelling van de set wordt vastgelegd; welke speler tijdens
 * rally 34 in zone 3 staat, rekent de app zelf uit. Een wissel geldt vanaf de
 * rally waarin hij wordt ingevoerd.
 */

import { useState, type ReactElement } from 'react';
import { courtPositions, positionsAt } from '../../domain/rotation';
import { playerLabel } from '../../domain/players';
import type { Lineup, Player, Substitution, Zone } from '../../domain/types';
import { ZONES } from '../../domain/types';
import { COURT_GRID, ZONE_LABELS } from '../../domain/zones';

export interface LineupSheetProps {
  players: readonly Player[];
  lineup: Lineup | undefined;
  substitutions: readonly Substitution[];
  rotation: number;
  onSaveLineup: (positions: Record<Zone, string | null>, liberoId: string | null) => void;
  onSubstitute: (playerOutId: string, playerInId: string) => void;
  onClose: () => void;
}

type Mode = 'lineup' | 'sub';

export function LineupSheet({
  players,
  lineup,
  substitutions,
  rotation,
  onSaveLineup,
  onSubstitute,
  onClose,
}: LineupSheetProps): ReactElement {
  const [mode, setMode] = useState<Mode>(lineup ? 'sub' : 'lineup');
  const [draft, setDraft] = useState<Record<Zone, string | null>>(
    () => lineup?.positions ?? { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
  );
  const [activeZone, setActiveZone] = useState<Zone>(1);
  const [playerOut, setPlayerOut] = useState<string | null>(null);
  const [liberoId, setLiberoId] = useState<string | null>(lineup?.liberoId ?? null);

  const byId = new Map(players.map((player) => [player.id, player]));
  const current = lineup ? positionsAt(lineup, rotation, substitutions) : draft;

  // De libero staat wél in het veld, maar hoort niet in de rotatie: wissels
  // gaan over de zes van de opstelling, de liberowissel is er geen. Daarom
  // wordt hij apart gemeld en niet in de wisseltegels gezet.
  const court = lineup
    ? courtPositions(lineup, rotation, substitutions, {
        roleOf: (playerId) => byId.get(playerId)?.role ?? null,
      })
    : null;
  const liberoZone = court?.replaced
    ? (ZONES.find((zone) => court.positions[zone] === lineup?.liberoId) ?? null)
    : null;
  const onCourt = ZONES.map((zone) => current[zone]).filter((id): id is string => id !== null);
  const bench = players.filter((player) => !onCourt.includes(player.id));

  function assign(playerId: string): void {
    setDraft((positions) => {
      const next = { ...positions };
      // Een speler kan maar op één plek staan: elders weghalen.
      for (const zone of ZONES) if (next[zone] === playerId) next[zone] = null;
      next[activeZone] = playerId;
      return next;
    });
    setActiveZone((zone) => (zone === 6 ? 1 : ((zone + 1) as Zone)));
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Opstelling en wissels">
      <div className="sheet__backdrop" onClick={onClose} />
      <div className="sheet__card sheet__card--wide">
        <div className="sheet__tabs">
          <button
            type="button"
            className={`chip ${mode === 'lineup' ? 'chip--active' : ''}`}
            onClick={() => setMode('lineup')}
          >
            Startopstelling
          </button>
          <button
            type="button"
            className={`chip ${mode === 'sub' ? 'chip--active' : ''}`}
            onClick={() => setMode('sub')}
            disabled={!lineup}
          >
            Wissel
          </button>
        </div>

        {mode === 'lineup' ? (
          <>
            <p className="sheet__principle">
              Zet de zes van het begin van deze set neer. Tik een zone en kies de speler; de
              rotatiestand daarna rekent de app zelf uit.
            </p>
            <div className="court court--lineup">
              <div className="court__net" aria-hidden="true">net</div>
              {COURT_GRID.map((row, index) => (
                <div className="court__row" key={index}>
                  {row.map((zone) => {
                    const player = draft[zone] ? byId.get(draft[zone]!) : undefined;
                    return (
                      <button
                        key={zone}
                        type="button"
                        className={`lineupcell ${activeZone === zone ? 'lineupcell--active' : ''}`}
                        onClick={() => setActiveZone(zone)}
                        aria-label={ZONE_LABELS[zone]}
                      >
                        <span className="lineupcell__zone">{zone}</span>
                        <span className="lineupcell__player">
                          {player ? playerLabel(player) : '—'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="grid grid--players sheet__players">
              {players.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className="tile tile--player"
                  aria-label={playerLabel(player)}
                  onClick={() => assign(player.id)}
                >
                  <span className="tile__number">{player.number}</span>
                  <span className="tile__name">{player.name}</span>
                </button>
              ))}
            </div>

            <h4 className="sheet__subtitle">Libero</h4>
            <p className="step__hint">
              Staat niet in de zes: hij komt in voor de middenspeler achterin, en gaat eruit als die
              moet serveren.
            </p>
            <div className="grid grid--players">
              <button
                type="button"
                className={`tile tile--unknown ${liberoId === null ? 'tile--selected' : ''}`}
                onClick={() => setLiberoId(null)}
              >
                Geen
              </button>
              {players.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={`tile tile--player ${liberoId === player.id ? 'tile--selected' : ''}`}
                  aria-label={`${playerLabel(player)} als libero`}
                  onClick={() => setLiberoId(player.id)}
                >
                  <span className="tile__number">{player.number}</span>
                  <span className="tile__name">
                    {player.role === 'libero' ? 'libero' : player.name || '\u00a0'}
                  </span>
                </button>
              ))}
            </div>

            <div className="sheet__actions">
              <button type="button" className="button button--ghost" onClick={onClose}>
                Annuleren
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => onSaveLineup(draft, liberoId)}
              >
                Opstelling bewaren
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="sheet__principle">
              Rotatie R{rotation}. Kies wie eruit gaat, daarna wie erin komt.
              {' '}
              {substitutions.length === 0
                ? 'Nog geen wissels deze set.'
                : `${substitutions.length} ${substitutions.length === 1 ? 'wissel' : 'wissels'} deze set.`}
            </p>

            <h4 className="sheet__subtitle">In het veld</h4>
            {court?.replaced && liberoZone && (
              <p className="step__hint">
                Libero {playerLabel(byId.get(lineup!.liberoId!)!)} staat nu in zone {liberoZone},
                voor {playerLabel(byId.get(court.replaced)!)}. Bij de volgende doordraai naar zone 1
                gaat die er weer in — een libero serveert niet.
              </p>
            )}
            <div className="grid grid--players">
              {ZONES.map((zone) => {
                const playerId = current[zone];
                const player = playerId ? byId.get(playerId) : undefined;
                if (!player) return null;
                return (
                  <button
                    key={zone}
                    type="button"
                    className={`tile tile--player ${playerOut === player.id ? 'tile--selected' : ''}`}
                    aria-label={`${playerLabel(player)} uit zone ${zone}`}
                    onClick={() => setPlayerOut(player.id)}
                  >
                    <span className="tile__number">{player.number}</span>
                    <span className="tile__name">
                      {player.name} · z{zone}
                    </span>
                  </button>
                );
              })}
            </div>

            <h4 className="sheet__subtitle">Op de bank</h4>
            <div className="grid grid--players">
              {bench.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className="tile tile--player"
                  disabled={playerOut === null}
                  aria-label={`${playerLabel(player)} erin`}
                  onClick={() => playerOut && onSubstitute(playerOut, player.id)}
                >
                  <span className="tile__number">{player.number}</span>
                  <span className="tile__name">{player.name}</span>
                </button>
              ))}
              {bench.length === 0 && <p className="panel__hint">Iedereen staat in het veld.</p>}
            </div>

            <div className="sheet__actions">
              <button type="button" className="button button--ghost" onClick={onClose}>
                Sluiten
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
