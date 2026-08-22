/**
 * Het invoerscherm voor een tablet: het hele veld in beeld, tikken waar het
 * gebeurde.
 *
 * Onze helft toont de zes op hun rotatiepositie, met de libero erin. De andere
 * helft toont zes zones; staan er rugnummers van de tegenstander in de app, dan
 * staan die erbij. Eén tik op een vak legt wie, welke kant en welke zone vast;
 * de tweede tik is de kwalificatie en daarmee staat de actie erin.
 *
 * De actiesoort wordt voorspeld en staat zichtbaar naast het veld: je leest wat
 * je vastlegt in plaats van het in te vullen, en overrulen kost één tik.
 */

import type { ReactElement } from 'react';
import { playerLabel } from '../../domain/players';
import { ACTION_TYPE_LABELS, QUALITY_LABELS, tooltipFor } from '../../domain/protocol';
import type { AppSettings } from '../../domain/settings';
import {
  ACTION_TYPES,
  QUALITIES,
  type ActionType,
  type Player,
  type Quality,
  type Zone,
} from '../../domain/types';
import { isFrontZone, OPPONENT_GRID, ZONE_LABELS } from '../../domain/zones';
import { useLongPress } from '../hooks/useLongPress';
import {
  SERVE_SPOTS,
  type CourtEntryEvent,
  type CourtEntryState,
  type CourtSelection,
} from '../entry/courtEntry';

export interface CourtEntryProps {
  state: CourtEntryState;
  dispatch: (event: CourtEntryEvent) => void;
  /** Speler-id per zone (1-6) van ons team, libero inbegrepen. */
  positions: Record<Zone, string | null>;
  ownPlayers: readonly Player[];
  opponentPlayers: readonly Player[];
  settings: AppSettings;
  onCommit: (quality: Quality) => void;
  onExplain: (quality: Quality) => void;
  /** Speler die volgens de opstelling moet serveren, als wij aan service zijn. */
  expectedServerId: string | null;
}

/** Het veld van boven: voorste rij bij het net, achterste rij bij de achterlijn. */
const FRONT: readonly Zone[] = [4, 3, 2] as const;
const BACK: readonly Zone[] = [5, 6, 1] as const;

/**
 * Hun helft staat boven het net en wordt van de andere kant bekeken: hun
 * voorlijn hoort dus onderaan die helft (tegen het net) en hun zone 4 staat
 * voor ons rechts. Zie `OPPONENT_GRID`.
 */
const THEM_ORDER: readonly Zone[] = OPPONENT_GRID.flat();

export function CourtEntry({
  state,
  dispatch,
  positions,
  ownPlayers,
  opponentPlayers,
  settings,
  onCommit,
  onExplain,
  expectedServerId,
}: CourtEntryProps): ReactElement {
  const byId = new Map(ownPlayers.map((player) => [player.id, player]));
  const selection = state.selection;
  const servingSelf = state.type === 'serve' && state.selection?.team === 'us';

  function selectOwn(zone: Zone): void {
    const playerId = positions[zone];
    const player = playerId ? byId.get(playerId) : undefined;
    dispatch({
      kind: 'select',
      selection: {
        team: 'us',
        playerId: playerId ?? null,
        playerNumber: player?.number ?? null,
        // Bij een service staat de speler achter de lijn, niet in zijn zone;
        // dan kiest de serveerstrook de plek.
        zone: state.type === 'serve' ? 6 : zone,
      },
    });
  }

  function selectOpponent(zone: Zone, player?: Player): void {
    dispatch({
      kind: 'select',
      selection: {
        team: 'them',
        playerId: player?.id ?? null,
        playerNumber: player?.number ?? null,
        zone,
      },
    });
  }

  return (
    <div className={`courtentry ${settings.mirrored ? 'courtentry--mirrored' : ''}`}>
      <div className="courtentry__court">
        <p className="courtentry__side courtentry__side--them">
          Tegenstander
          {selection?.team === 'them' ? ' · gekozen' : ''}
        </p>

        <div className="courtplan">
          <div className="courtplan__half courtplan__half--them">
            {THEM_ORDER.map((zone) => {
              const picked = selection?.team === 'them' && selection.zone === zone;
              return (
                <button
                  key={`them-${zone}`}
                  type="button"
                  className={`courtcell courtcell--them ${picked ? 'courtcell--picked' : ''}`}
                  aria-label={`Tegenstander ${ZONE_LABELS[zone]}`}
                  aria-pressed={picked}
                  onClick={() => selectOpponent(zone)}
                >
                  <span className="courtcell__zone">{zone}</span>
                  <span className="courtcell__name">{shortZone(zone)}</span>
                </button>
              );
            })}
          </div>

          <div className="courtplan__net" aria-hidden="true">
            <span>net</span>
          </div>

          <div className="courtplan__half courtplan__half--us">
            {[...FRONT, ...BACK].map((zone) => {
              const playerId = positions[zone];
              const player = playerId ? byId.get(playerId) : undefined;
              const picked = selection?.team === 'us' && selection.playerId === (playerId ?? null);
              const serves = playerId !== null && playerId === expectedServerId;
              // Blokken doet de voorlijn. Een blokpunt moet aan een speelster
              // hangen, dus staan bij een blok alleen die drie vakken aan.
              const blocks = state.type === 'block' && isFrontZone(zone);
              return (
                <button
                  key={`us-${zone}`}
                  type="button"
                  className={[
                    'courtcell',
                    'courtcell--us',
                    picked ? 'courtcell--picked' : '',
                    serves ? 'courtcell--server' : '',
                    blocks ? 'courtcell--blocks' : '',
                  ].join(' ')}
                  aria-label={player ? playerLabel(player) : `Onze ${ZONE_LABELS[zone]}`}
                  aria-pressed={picked}
                  onClick={() => selectOwn(zone)}
                >
                  <span className="courtcell__zone">{zone}</span>
                  <span className="courtcell__number">{player ? player.number : '—'}</span>
                  <span className="courtcell__name">
                    {player?.name || (player ? '' : shortZone(zone))}
                  </span>
                  {serves && <span className="courtcell__badge">serveert</span>}
                  {blocks && !serves && <span className="courtcell__badge">blokt</span>}
                </button>
              );
            })}
          </div>
        </div>

        {servingSelf ? (
          <div className="servestrip" role="group" aria-label="Plek achter de achterlijn">
            <span className="servestrip__label">vanaf</span>
            {SERVE_SPOTS.map((spot) => (
              <button
                key={spot.zone}
                type="button"
                className={`servestrip__button ${
                  selection?.zone === spot.zone ? 'servestrip__button--on' : ''
                }`}
                onClick={() => dispatch({ kind: 'serveSpot', zone: spot.zone })}
              >
                {spot.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="courtentry__side courtentry__side--us">Wij</p>
        )}
      </div>

      <div className="courtentry__panel">
        <div className="panelcard">
          <span className="panelcard__label">wie</span>
          <p className="panelcard__who">
            {describeSelection(selection, byId, opponentPlayers, settings)}
          </p>
        </div>

        <div className="panelcard">
          <span className="panelcard__label">wat — de app verwacht dit</span>
          <div className="typegrid">
            {ACTION_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                className={`typebutton ${state.type === type ? 'typebutton--on' : ''}`}
                aria-pressed={state.type === type}
                onClick={() => dispatch({ kind: 'type', type })}
              >
                {ACTION_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        </div>

        <div className="panelcard panelcard--grow">
          <span className="panelcard__label">
            {selection ? 'hoe ging het — tik en de actie staat vast' : 'tik eerst op het veld'}
          </span>
          <div className="qualitygrid">
            {QUALITIES.map((quality) => (
              <QualityButton
                key={quality}
                quality={quality}
                type={state.type}
                disabled={!selection}
                onCommit={onCommit}
                onExplain={onExplain}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QualityButton({
  quality,
  type,
  disabled,
  onCommit,
  onExplain,
}: {
  quality: Quality;
  type: ActionType;
  disabled: boolean;
  onCommit: (quality: Quality) => void;
  onExplain: (quality: Quality) => void;
}): ReactElement {
  const longPress = useLongPress(() => onExplain(quality));
  const criterion = tooltipFor(type, quality).criterion;

  return (
    <button
      type="button"
      className={`qualitybutton quality--${quality}`}
      disabled={disabled}
      aria-label={QUALITY_LABELS[quality]}
      onClick={() => onCommit(quality)}
      {...longPress}
    >
      <span className="qualitybutton__label">{QUALITY_LABELS[quality]}</span>
      <span className="qualitybutton__hint">{criterion}</span>
    </button>
  );
}

/** 'Zone 4 (linksvoor)' is te lang voor een vak; daar past alleen 'linksvoor'. */
function shortZone(zone: Zone): string {
  return /\(([^)]+)\)/.exec(ZONE_LABELS[zone])?.[1] ?? ZONE_LABELS[zone];
}

function describeSelection(
  selection: CourtSelection | null,
  byId: ReadonlyMap<string, Player>,
  opponentPlayers: readonly Player[],
  settings: AppSettings,
): string {
  if (!selection) return 'Nog niets gekozen';

  if (selection.team === 'us') {
    const player = selection.playerId ? byId.get(selection.playerId) : undefined;
    if (!player) return 'Wij · lege plek in de opstelling';
    return `${playerLabel(player)} · zone ${selection.zone ?? '?'}`;
  }

  const known = opponentPlayers.length > 0 && settings.showOpponentNumbers;
  const player = selection.playerNumber;
  return [
    'Tegenstander',
    selection.zone ? `zone ${selection.zone}` : null,
    player !== null ? `#${player}` : known ? 'nummer erbij na de tik' : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/** Zones in de volgorde waarin ze op het scherm staan; handig voor tests. */
export const COURT_ORDER: readonly Zone[] = [...FRONT, ...BACK] as const;

/** Idem, voor de helft van de tegenstander. */
export const OPPONENT_ORDER: readonly Zone[] = THEM_ORDER;
