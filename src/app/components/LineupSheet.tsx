/**
 * Opstelling en wissels.
 *
 * Alleen de startopstelling van de set wordt vastgelegd; welke speler tijdens
 * rally 34 in zone 3 staat, rekent de app zelf uit. Een wissel geldt vanaf de
 * rally waarin hij wordt ingevoerd.
 */

import { useState, type ReactElement } from 'react';
import { courtPositions, positionsAt } from '../../domain/rotation';
import { canPlay, playerLabel, rolesOf } from '../../domain/players';
import type { Lineup, Player, Substitution, Zone } from '../../domain/types';
import { ZONES } from '../../domain/types';
import { COURT_GRID, ZONE_LABELS } from '../../domain/zones';

export interface LineupSheetProps {
  players: readonly Player[];
  lineup: Lineup | undefined;
  substitutions: readonly Substitution[];
  rotation: number;
  /** De afspraken van deze wedstrijd: wie passen er, en voor wie komt de libero erin. */
  receiverIds: readonly string[];
  liberoForIds: readonly string[];
  onSaveLineup: (
    positions: Record<Zone, string | null>,
    liberoId: string | null,
    liberoForId: string | null,
  ) => void;
  onSaveAgreement: (receiverIds: string[], liberoForIds: string[]) => void;
  onSubstitute: (playerOutId: string, playerInId: string) => void;
  onClose: () => void;
}

type Mode = 'lineup' | 'sub' | 'system';

/** Aantikken zet iemand erbij of haalt haar eraf; de volgorde blijft. */
function toggle(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id];
}

export function LineupSheet({
  players,
  lineup,
  substitutions,
  rotation,
  receiverIds,
  liberoForIds,
  onSaveLineup,
  onSaveAgreement,
  onSubstitute,
  onClose,
}: LineupSheetProps): ReactElement {
  // Zonder afspraken begint het daar: wie passen er, en voor wie komt de libero
  // erin. Die vraag hoort vóór het eerste punt gesteld te worden, want daarna
  // gaat de app raden en staat de diagonaal ineens als passer in beeld.
  const [mode, setMode] = useState<Mode>(
    receiverIds.length === 0 && liberoForIds.length === 0 ? 'system' : lineup ? 'sub' : 'lineup',
  );
  const [draft, setDraft] = useState<Record<Zone, string | null>>(
    () => lineup?.positions ?? { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null },
  );
  const [activeZone, setActiveZone] = useState<Zone>(1);
  const [playerOut, setPlayerOut] = useState<string | null>(null);
  const [liberoId, setLiberoId] = useState<string | null>(lineup?.liberoId ?? null);
  const [liberoForId, setLiberoForId] = useState<string | null>(lineup?.liberoForId ?? null);
  const [receivers, setReceivers] = useState<string[]>(() => [...receiverIds]);
  const [liberoFor, setLiberoFor] = useState<string[]>(() => [...liberoForIds]);

  const byId = new Map(players.map((player) => [player.id, player]));

  // Alleen wie als libero is opgegeven. De hele selectie hier nog eens tonen
  // helpt niemand: je zoekt één speelster, en die staat in de ploeglijst al
  // aangemerkt. Heeft niemand de positie, dan is de lijst leeg en zegt het
  // scherm waar je dat invult.
  const liberos = players.filter((player) => canPlay(player, 'libero'));
  const current = lineup ? positionsAt(lineup, rotation, substitutions) : draft;

  // De libero staat wél in het veld, maar hoort niet in de rotatie: wissels
  // gaan over de zes van de opstelling, de liberowissel is er geen. Daarom
  // wordt hij apart gemeld en niet in de wisseltegels gezet.
  const court = lineup
    ? courtPositions(lineup, rotation, substitutions, {
        rolesOf: (playerId) => {
          const player = byId.get(playerId);
          return player ? rolesOf(player) : [];
        },
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
          <button
            type="button"
            className={`chip ${mode === 'system' ? 'chip--active' : ''}`}
            onClick={() => setMode('system')}
          >
            Ons systeem
          </button>
        </div>

        {mode === 'system' ? (
          <>
            <p className="sheet__principle">
              Twee afspraken die de hele wedstrijd gelden. Zonder deze raadt de app het uit de
              posities, en dat gaat mis: staat er niets ingevuld, dan valt hij terug op de
              achterlijn en komt de diagonaal als passer in beeld terwijl ze dat niet is.
            </p>

            <h4 className="sheet__subtitle">Wie passen er</h4>
            <p className="step__hint">
              De vaste passers. De libero telt altijd mee, ook als je haar hier niet aantikt.
            </p>
            <div className="grid grid--players">
              {players.map((player) => (
                <button
                  key={player.id}
                  type="button"
                  className={`tile tile--player ${
                    receivers.includes(player.id) ? 'tile--selected' : ''
                  }`}
                  aria-pressed={receivers.includes(player.id)}
                  aria-label={`${playerLabel(player)} passt`}
                  onClick={() => setReceivers((current) => toggle(current, player.id))}
                >
                  <span className="tile__number">{player.number}</span>
                  <span className="tile__name">{player.name || '\u00a0'}</span>
                </button>
              ))}
            </div>

            <h4 className="sheet__subtitle">Voor wie komt de libero erin</h4>
            <p className="step__hint">
              Meestal de twee middenspeelsters. Staat er van deze lijst precies één achterin, dan
              wisselt de app haar er zelf in. Staan er twee tegelijk achterin, dan vraagt hij tijdens
              de set wie het is — gokken zou betekenen dat er iemand in het veld staat die er niet
              staat.
            </p>
            <div className="grid grid--players">
              {players
                // Een libero komt niet voor zichzelf in, en ook niet voor een
                // andere libero: die staan allebei niet in de zes.
                .filter(
                  (player) =>
                    player.id !== liberoId &&
                    !(canPlay(player, 'libero') && rolesOf(player).length === 1),
                )
                .map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={`tile tile--player ${
                      liberoFor.includes(player.id) ? 'tile--selected' : ''
                    }`}
                    aria-pressed={liberoFor.includes(player.id)}
                    aria-label={`Libero komt in voor ${playerLabel(player)}`}
                    onClick={() => setLiberoFor((current) => toggle(current, player.id))}
                  >
                    <span className="tile__number">{player.number}</span>
                    <span className="tile__name">{player.name || '\u00a0'}</span>
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
                onClick={() => {
                  onSaveAgreement(receivers, liberoFor);
                  setMode('lineup');
                }}
              >
                Afspraken bewaren
              </button>
            </div>
          </>
        ) : mode === 'lineup' ? (
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
              Staat niet in de zes. De regel laat haar voor elke achterspeelster invallen; in de
              praktijk is dat de middenspeelster, en pas ná haar serviceserie — vandaar dat ze in
              zone 1 nooit staat: daar wordt geserveerd.
            </p>
            {liberos.length === 0 ? (
              <p className="step__hint">
                Niemand heeft libero als positie. Dat vul je in bij de ploeg — onder 'Ons team' of
                bij het opzetten van een wedstrijd.
              </p>
            ) : (
              <div className="grid grid--players">
                <button
                  type="button"
                  className={`tile tile--unknown ${liberoId === null ? 'tile--selected' : ''}`}
                  onClick={() => setLiberoId(null)}
                >
                  Geen
                </button>
                {liberos.map((player) => (
                  <button
                    key={player.id}
                    type="button"
                    className={`tile tile--player ${liberoId === player.id ? 'tile--selected' : ''}`}
                    aria-label={`${playerLabel(player)} als libero`}
                    onClick={() => setLiberoId(player.id)}
                  >
                    <span className="tile__number">{player.number}</span>
                    <span className="tile__name">{player.name || '\u00a0'}</span>
                  </button>
                ))}
              </div>
            )}

            {liberoId !== null && (
              <>
                <h4 className="sheet__subtitle">Komt in voor</h4>
                <p className="step__hint">
                  Meestal rekent de app dit zelf uit: er staat één middenspeelster achterin. Speelt
                  iemand meerdere posities, of staan er twee middens achterin, dan is het raden — en
                  dan wint wat je hier kiest.
                </p>
                <div className="grid grid--players">
                  <button
                    type="button"
                    className={`tile tile--unknown ${liberoForId === null ? 'tile--selected' : ''}`}
                    onClick={() => setLiberoForId(null)}
                  >
                    Zelf uitrekenen
                  </button>
                  {players
                    .filter((player) => player.id !== liberoId)
                    .map((player) => (
                      <button
                        key={player.id}
                        type="button"
                        className={`tile tile--player ${
                          liberoForId === player.id ? 'tile--selected' : ''
                        }`}
                        aria-label={`Libero komt in voor ${playerLabel(player)}`}
                        onClick={() => setLiberoForId(player.id)}
                      >
                        <span className="tile__number">{player.number}</span>
                        <span className="tile__name">{player.name || '\u00a0'}</span>
                      </button>
                    ))}
                </div>
              </>
            )}

            <div className="sheet__actions">
              <button type="button" className="button button--ghost" onClick={onClose}>
                Annuleren
              </button>
              <button
                type="button"
                className="button button--primary"
                onClick={() => onSaveLineup(draft, liberoId, liberoForId)}
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
