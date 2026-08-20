/** De rally-keten bovenin het invoerscherm: pilletjes met pijltjes ertussen. */

import type { ReactElement } from 'react';

import { ACTION_TYPE_LABELS, QUALITY_LABELS } from '../../domain/protocol';
import type { Action, Player } from '../../domain/types';

export interface RallyChainProps {
  actions: readonly Action[];
  playersById: ReadonlyMap<string, Player>;
  /** Weglaten voor een read-only weergave, zoals het meeleesscherm. */
  onUndoLast?: () => void;
}

export function RallyChain({ actions, playersById, onUndoLast }: RallyChainProps): ReactElement {
  return (
    <div className="chain" aria-label="Acties in deze rally">
      {actions.length === 0 && <span className="chain__empty">Nog geen acties in deze rally</span>}
      {actions.map((action, index) => (
        <span key={action.id} className="chain__item">
          {index > 0 && <span className="chain__arrow" aria-hidden="true">→</span>}
          <span className={`pill pill--${action.team} pill--${action.quality}`}>
            <span className="pill__player">{describePlayer(action, playersById)}</span>
            <span className="pill__type">{ACTION_TYPE_LABELS[action.type].toLowerCase()}</span>
            {action.zoneFrom != null && (
              <span className="pill__zone">
                z{action.zoneFrom}
                {action.zoneTo != null ? `→z${action.zoneTo}` : ''}
              </span>
            )}
            <span className="pill__quality">{QUALITY_LABELS[action.quality].toLowerCase()}</span>
          </span>
        </span>
      ))}
      {actions.length > 0 && onUndoLast && (
        <button type="button" className="chain__undo" onClick={onUndoLast}>
          ↩ Undo actie
        </button>
      )}
    </div>
  );
}

function describePlayer(action: Action, playersById: ReadonlyMap<string, Player>): string {
  if (action.playerNumber != null) return `#${action.playerNumber}`;
  const player = action.playerId ? playersById.get(action.playerId) : undefined;
  return player ? `#${player.number}` : action.team === 'us' ? 'wij' : 'zij';
}
