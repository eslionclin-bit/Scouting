/** Kleine bouwstenen die overal terugkomen. */

import type { ReactNode } from 'react';
import { GOAL_LABELS, type Goal } from '../../domain/types';

export function Chip({
  children,
  active = false,
  onClick,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  if (!onClick) {
    return (
      <span className={`chip ${active ? 'is-active' : ''}`} title={title}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={`chip ${active ? 'is-active' : ''}`}
      onClick={onClick}
      title={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

export function GoalChips({ goals }: { goals: readonly Goal[] }) {
  return (
    <span className="chips chips--inline">
      {goals.map((goal) => (
        <span key={goal} className={`chip chip--goal chip--${goal}`}>
          {GOAL_LABELS[goal]}
        </span>
      ))}
    </span>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  // De toelichting staat buiten het label. Anders wordt de naam van het veld
  // 'Eerste wachtwoordMinstens tien tekens', en dat is precies wat een
  // schermlezer voorleest.
  return (
    <div className="field">
      <label>
        <span className="field__label">{label}</span>
        {children}
      </label>
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function Warning({ severity, children }: { severity: 'blocking' | 'notice'; children: ReactNode }) {
  return <p className={`warning warning--${severity}`}>{children}</p>;
}

export function Panel({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      {(title || action) && (
        <header className="panel__head">
          {title && <h2>{title}</h2>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
