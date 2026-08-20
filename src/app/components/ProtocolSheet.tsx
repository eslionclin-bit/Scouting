/** Uitleg uit het scoutingprotocol, opgeroepen door lang indrukken. */

import type { ReactElement } from 'react';

import { PROTOCOL_RULES, tooltipFor } from '../../domain/protocol';
import type { ActionType, Quality } from '../../domain/types';

export interface ProtocolSheetProps {
  actionType: ActionType;
  quality: Quality;
  onClose: () => void;
}

export function ProtocolSheet({ actionType, quality, onClose }: ProtocolSheetProps): ReactElement {
  const tooltip = tooltipFor(actionType, quality);
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={tooltip.title}>
      <div className="sheet__backdrop" onClick={onClose} />
      <div className={`sheet__card sheet__card--${quality}`}>
        <h3>{tooltip.title}</h3>
        <p className="sheet__principle">{tooltip.principle}</p>
        <dl>
          <dt>Criterium</dt>
          <dd>{tooltip.criterion}</dd>
          <dt>Voorbeeld</dt>
          <dd>{tooltip.example}</dd>
        </dl>
        <p className="sheet__rule">{PROTOCOL_RULES.doubt}</p>
        <button type="button" className="button" onClick={onClose}>
          Sluiten
        </button>
      </div>
    </div>
  );
}
