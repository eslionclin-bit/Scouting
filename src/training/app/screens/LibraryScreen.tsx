/** De oefeningenbank: alles bij elkaar, met de filters erboven. */

import { useMemo, useState } from 'react';
import { emptyFilter, filterExercises, isEmptyFilter, sortExercises } from '../../domain/library';
import { blankExercise } from '../../bank';
import { useStore } from '../StoreProvider';
import { href, useRoute } from '../router';
import { ExerciseCard } from '../components/ExerciseCard';
import { FilterBar } from '../components/FilterBar';
import { EmptyState } from '../components/ui';

export function LibraryScreen() {
  const { store, data } = useStore();
  const [, go] = useRoute();
  const [filter, setFilter] = useState(emptyFilter);

  const shown = useMemo(
    () => sortExercises(filterExercises(data.library, filter, data.profile.id), filter.participants),
    [data.library, data.profile.id, filter],
  );

  async function createExercise() {
    const { id, rev, updatedAt, deletedAt, ...input } = blankExercise(data.profile);
    const created = await store.exercises.create({ ...input, title: 'Nieuwe oefening' });
    go({ name: 'exercise-edit', id: created.id });
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <h1>Oefeningen</h1>
        <button type="button" className="button button--primary" onClick={createExercise}>
          Nieuwe oefening
        </button>
      </header>

      <FilterBar filter={filter} onChange={setFilter} groups={data.groups} />

      <p className="muted result-count">
        {shown.length} van {data.library.length} oefeningen
        {!isEmptyFilter(filter) && (
          <>
            {' · '}
            <button type="button" className="linkbutton" onClick={() => setFilter(emptyFilter())}>
              filters wissen
            </button>
          </>
        )}
      </p>

      {shown.length === 0 ? (
        <EmptyState title="Niets gevonden">
          <p>
            Geen oefening voldoet aan deze filters. Zet er een paar uit, of maak er zelf een — dan
            staat hij er de volgende keer wel.
          </p>
        </EmptyState>
      ) : (
        <div className="cards">
          {shown.map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              meId={data.profile.id}
              participants={filter.participants}
              onOpen={() => go({ name: 'exercise', id: exercise.id })}
            />
          ))}
        </div>
      )}

      <p className="muted">
        Wil je er een van iemand anders bij? Vul op{' '}
        <a href={href({ name: 'manage' })}>de beheerpagina</a> een deelserver in, of sluit je aan bij
        een groep.
      </p>
    </div>
  );
}
