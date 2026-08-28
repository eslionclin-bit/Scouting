/** Eén oefening in een lijst: genoeg om te kiezen, niet meer. */

import { distribute } from '../../domain/grouping';
import { describeGroupSpec, originOf } from '../../domain/library';
import type { Exercise } from '../../domain/types';
import { VISIBILITY_LABELS } from '../../domain/types';
import { GoalChips } from './ui';

export function ExerciseCard({
  exercise,
  meId,
  participants,
  onOpen,
  action,
}: {
  exercise: Exercise;
  meId: string;
  /** Aantal aanwezigen, om te laten zien hoe hij bij díé groep uitpakt. */
  participants?: number | null;
  onOpen?: () => void;
  action?: React.ReactNode;
}) {
  const origin = originOf(exercise, meId);
  const fit = participants ? distribute(participants, exercise.group) : null;

  return (
    <article className="card">
      <button type="button" className="card__body" onClick={onOpen}>
        <h3 className="card__title">{exercise.title}</h3>
        <p className="card__summary">{exercise.summary}</p>
        <GoalChips goals={exercise.goals} />
        <p className="card__meta">
          {describeGroupSpec(exercise)} · {exercise.minutes} min
          {exercise.animation ? ' · animatie' : ''}
        </p>
        <p className="card__meta card__meta--muted">
          {origin === 'builtin' ? 'Uit de bank' : exercise.authorName}
          {origin !== 'builtin' && ` · ${VISIBILITY_LABELS[exercise.visibility]}`}
        </p>
        {fit && (
          <p className={`card__fit ${fit.possible ? '' : 'card__fit--no'}`}>
            {fitLabel(fit)}
          </p>
        )}
      </button>
      {action && <div className="card__action">{action}</div>}
    </article>
  );
}

function fitLabel(fit: ReturnType<typeof distribute>): string {
  if (!fit.possible) return 'Past niet bij dit aantal';
  const groups = fit.groups.length === 1 ? '1 groep' : `${fit.groups.length} groepen`;
  const sizes = fit.groups.join(' + ');
  if (fit.waiting === 0) return `${groups} van ${sizes}`;
  return `${groups} van ${sizes}, ${fit.waiting} wisselen in`;
}
