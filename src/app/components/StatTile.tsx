/** Eén kerngetal met een korte toelichting eronder. */

import type { ReactElement } from 'react';

export interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'us' | 'them';
}

export function StatTile({ label, value, hint, tone = 'neutral' }: StatTileProps): ReactElement {
  return (
    <div className={`tile-stat tile-stat--${tone}`}>
      <span className="tile-stat__label">{label}</span>
      <strong className="tile-stat__value">{value}</strong>
      {hint && <span className="tile-stat__hint">{hint}</span>}
    </div>
  );
}
