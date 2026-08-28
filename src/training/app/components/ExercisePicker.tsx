/**
 * Oefening kiezen bij een training.
 *
 * Het aantal aanwezigen staat hier al ingevuld, en de lijst begint bij wat
 * daarbij past. Dat is het verschil met bladeren in de bank: hier zoek je niet
 * een leuke oefening, maar een oefening voor vanavond.
 */

import { useMemo, useState } from 'react';
import { emptyFilter, filterExercises, sortExercises } from '../../domain/library';
import { BLOCK_LABELS, type BlockKind, type Exercise } from '../../domain/types';
import { ExerciseCard } from './ExerciseCard';
import { FilterBar } from './FilterBar';

export function ExercisePicker({
  library,
  meId,
  groups,
  participants,
  kind,
  onPick,
  onClose,
}: {
  library: readonly Exercise[];
  meId: string;
  groups: readonly { id: string; name: string }[];
  participants: number | null;
  kind: BlockKind;
  onPick: (exercise: Exercise) => void;
  onClose: () => void;
}) {
  const [filter, setFilter] = useState(() => ({ ...emptyFilter(), participants }));
  const [onlyThisKind, setOnlyThisKind] = useState(true);

  const shown = useMemo(() => {
    const filtered = filterExercises(library, filter, meId).filter(
      (exercise) => !onlyThisKind || exercise.slots.includes(kind),
    );
    return sortExercises(filtered, filter.participants);
  }, [filter, kind, library, meId, onlyThisKind]);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Oefening kiezen">
      <div className="sheet__panel">
        <header className="sheet__head">
          <h2>Oefening kiezen</h2>
          <button type="button" className="button button--ghost" onClick={onClose}>
            Sluiten
          </button>
        </header>

        <label className="checkline">
          <input
            type="checkbox"
            checked={onlyThisKind}
            onChange={(event) => setOnlyThisKind(event.target.checked)}
          />
          Alleen oefeningen die in een {BLOCK_LABELS[kind].toLowerCase()} passen
        </label>

        <FilterBar filter={filter} onChange={setFilter} groups={groups} />

        <div className="cards cards--picker">
          {shown.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              meId={meId}
              participants={filter.participants}
              onOpen={() => onPick(exercise)}
            />
          ))}
          {shown.length === 0 && (
            <p className="muted">
              Geen oefening die hierbij past. Zet het vinkje hierboven uit, of laat het aantal
              spelers los.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
