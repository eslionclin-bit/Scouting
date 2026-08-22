/**
 * Een scherm dat (nog) niets te tonen heeft.
 *
 * Met een terugknop, altijd. Een scherm zonder uitweg is hoe je uit de app
 * valt: de enige knop die dan nog werkt is die van de browser, en die brengt je
 * de website uit.
 */

import type { ReactElement } from 'react';

export interface PlaceholderProps {
  title: string;
  hint?: string;
  onExit: () => void;
  tone?: 'loading' | 'empty' | 'error';
}

export function Placeholder({ title, hint, onExit, tone = 'loading' }: PlaceholderProps): ReactElement {
  return (
    <div className={`placeholder placeholder--${tone}`}>
      <div className="placeholder__card">
        <h1>{title}</h1>
        {hint && <p>{hint}</p>}
        <button type="button" className="button button--primary" onClick={onExit}>
          ← Terug
        </button>
      </div>
    </div>
  );
}
