/**
 * De vraag 'waarom ging die bal verloren', gesteld nádat de fout al is
 * opgeslagen.
 *
 * Dat is het hele idee: de invoer wacht er nooit op. De rally loopt door, het
 * punt staat op het bord, en ondertussen staat hier een rijtje knoppen. Tik je
 * er een aan, dan weet de app straks dat negen van de twaalf servicefouten in
 * het net gingen. Tik je niets, dan verdwijnt de balk vanzelf bij de volgende
 * actie en is er niets aan de hand.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { errorReasonsFor, ERROR_REASON_LABELS, type ErrorReason } from '../../domain/errors';
import { ACTION_TYPE_LABELS } from '../../domain/protocol';
import type { Action } from '../../domain/types';

export interface ErrorReasonBarProps {
  action: Action;
  onChoose: (reason: ErrorReason) => void;
  onDismiss: () => void;
}

/** Zolang blijft de vraag staan; daarna is het moment voorbij. */
const VISIBLE_MS = 12000;

export function ErrorReasonBar({ action, onChoose, onDismiss }: ErrorReasonBarProps): ReactElement {
  const [chosen, setChosen] = useState<ErrorReason | null>(action.errorReason ?? null);

  useEffect(() => {
    const timer = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className="reasonbar" role="group" aria-label="Reden van de fout">
      <span className="reasonbar__label">
        {ACTION_TYPE_LABELS[action.type].toLowerCase()} fout — waardoor?
      </span>
      {errorReasonsFor(action.type).map((reason) => (
        <button
          key={reason}
          type="button"
          className={`reasonbar__button ${chosen === reason ? 'reasonbar__button--chosen' : ''}`}
          onClick={() => {
            setChosen(reason);
            onChoose(reason);
          }}
        >
          {ERROR_REASON_LABELS[reason]}
        </button>
      ))}
      <button type="button" className="reasonbar__close" onClick={onDismiss} aria-label="Sluiten">
        ×
      </button>
    </div>
  );
}
