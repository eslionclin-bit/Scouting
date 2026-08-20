/** Korte meldingen: geweigerde invoer, of een waarschuwing uit het protocol. */

import type { ReactElement } from 'react';

export interface ToastMessage {
  id: string;
  tone: 'error' | 'warning' | 'info';
  text: string;
}

export function Toasts({
  messages,
  onDismiss,
}: {
  messages: readonly ToastMessage[];
  onDismiss: (id: string) => void;
}): ReactElement {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {messages.map((message) => (
        <button
          key={message.id}
          type="button"
          className={`toast toast--${message.tone}`}
          onClick={() => onDismiss(message.id)}
        >
          {message.text}
        </button>
      ))}
    </div>
  );
}
