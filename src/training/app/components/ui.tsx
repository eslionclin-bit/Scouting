/** Kleine bouwstenen die overal terugkomen. */

import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
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

/**
 * Een tekstveld dat je eerst laat uittypen en pas daarna bewaart.
 *
 * Waarom dit nodig is: de velden in deze app schrijven naar IndexedDB, en het
 * scherm tekent zich opnieuw met wat er uit die opslag terugkomt. Bij elke
 * toetsaanslag meteen schrijven levert dan twee kwalen op. Snel typen raakt
 * letters kwijt, want de volgende aanslag rekent nog met de tekst van vóór de
 * vorige. En een veld met een terugvalwaarde ('Trainer' als de naam leeg is)
 * valt terug zodra je het leegmaakt om iets anders in te tikken — je bent
 * daarna aan het typen achter een woord dat vanzelf terugkwam.
 *
 * Dus: de tekst staat hier terwijl je typt, en gaat naar de opslag als je even
 * stopt of het veld verlaat. Zolang je bezig bent, overschrijft de opslag je
 * niet.
 */
export interface DraftInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onCommit: (value: string) => void;
  /** Hoeveel stilte er nodig is voordat er bewaard wordt. */
  delay?: number;
}

export function DraftInput({ value, onCommit, delay = 600, ...rest }: DraftInputProps) {
  const draft = useDraft(value, onCommit, delay);
  return (
    <input
      {...rest}
      value={draft.value}
      onChange={(event) => draft.change(event.target.value)}
      onBlur={draft.commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        rest.onKeyDown?.(event);
      }}
    />
  );
}

export interface DraftTextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> {
  value: string;
  onCommit: (value: string) => void;
  delay?: number;
}

export function DraftTextarea({ value, onCommit, delay = 600, ...rest }: DraftTextareaProps) {
  const draft = useDraft(value, onCommit, delay);
  return (
    <textarea
      {...rest}
      value={draft.value}
      onChange={(event) => draft.change(event.target.value)}
      onBlur={draft.commit}
    />
  );
}

function useDraft(value: string, onCommit: (value: string) => void, delay: number) {
  const [draft, setDraft] = useState(value);
  const typing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  // Wat er van buiten komt telt alleen als je zelf niet aan het typen bent.
  useEffect(() => {
    if (typing.current) return;
    draftRef.current = value;
    setDraft(value);
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  /**
   * De laatst getikte tekst, bijgehouden bij het tikken zelf en niet bij het
   * hertekenen. Dat verschil is niet theoretisch: wie een veld invult en meteen
   * daarna ergens anders klikt, laat het verlaten van het veld in dezelfde tel
   * gebeuren als de laatste aanslag. Stond de tekst dan alleen in een waarde die
   * pas bij het hertekenen wordt bijgewerkt, dan bewaarde hij wat er vóór die
   * aanslag stond — bij een leeg veld dus niets.
   */
  const draftRef = useRef(draft);

  function commit(): void {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!typing.current) return;
    typing.current = false;
    commitRef.current(draftRef.current);
  }

  function change(next: string): void {
    typing.current = true;
    draftRef.current = next;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      typing.current = false;
      commitRef.current(next);
    }, delay);
  }

  return { value: draft, change, commit };
}

/**
 * Een blok dat dichtgeklapt begint.
 *
 * Voor alles wat je zelden invult maar soms nodig hebt. Bewust het gewone
 * `details`-element: dat werkt zonder toestand, onthoudt zichzelf tijdens het
 * bewerken, en een schermlezer weet er raad mee.
 */
export function More({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="more">
      <summary className="more__head">{title}</summary>
      <div className="more__body">{children}</div>
    </details>
  );
}
