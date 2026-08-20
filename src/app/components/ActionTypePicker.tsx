/** Keuze van het actietype: opslag, receptie, toets, aanval, block, verdediging. */

import type { ReactElement } from 'react';

import { ACTION_TYPE_LABELS } from '../../domain/protocol';
import { ACTION_TYPES, type ActionType } from '../../domain/types';

export interface ActionTypePickerProps {
  value: ActionType | null;
  onChange: (type: ActionType) => void;
  active: boolean;
}

export function ActionTypePicker({ value, onChange, active }: ActionTypePickerProps): ReactElement {
  return (
    <section className={`panel ${active ? 'panel--active' : ''}`}>
      <h2 className="panel__title">1. Actie</h2>
      <div className="grid grid--types">
        {ACTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`tile ${value === type ? 'tile--selected' : ''}`}
            onClick={() => onChange(type)}
            aria-pressed={value === type}
          >
            {ACTION_TYPE_LABELS[type]}
          </button>
        ))}
      </div>
    </section>
  );
}
