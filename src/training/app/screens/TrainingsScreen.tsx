/** Alle trainingen: wat eraan komt, en wat er geweest is. */

import { useMemo } from 'react';
import { formatDate } from '../../domain/series';
import { presentPlayers } from '../../domain/plan';
import { useStore } from '../StoreProvider';
import { href, useRoute } from '../router';
import { EmptyState, Panel } from '../components/ui';
import type { Training } from '../../domain/types';

export function TrainingsScreen() {
  const { store, data } = useStore();
  const [, go] = useRoute();
  const today = new Date().toISOString().slice(0, 10);

  const { upcoming, past } = useMemo(() => {
    const sorted = [...data.trainings].sort((a, b) => a.date.localeCompare(b.date));
    return {
      upcoming: sorted.filter((training) => training.date >= today),
      past: sorted.filter((training) => training.date < today).reverse(),
    };
  }, [data.trainings, today]);

  async function create() {
    const created = await store.trainings.create({
      teamId: data.settings.activeTeamId ?? data.teams[0]?.id ?? null,
      title: 'Training',
      date: today,
      time: '20:00',
      location: null,
      focus: null,
      blocks: [],
      attendance: [],
      absent: [],
      seriesId: null,
      visibility: 'private',
      groupIds: [],
      done: false,
      evaluation: null,
      authorId: data.profile.id,
      authorName: data.profile.name,
    });
    go({ name: 'training', id: created.id });
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <h1>Trainingen</h1>
        <button type="button" className="button button--primary" onClick={create}>
          Nieuwe training
        </button>
      </header>

      {data.trainings.length === 0 ? (
        <EmptyState title="Nog geen trainingen">
          <p>
            Maak er een, of laat de app een hele reeks klaarzetten voor een periode — dat scheelt in
            de voorbereiding het meeste tijd.
          </p>
          <div className="row">
            <button type="button" className="button button--primary" onClick={create}>
              Nieuwe training
            </button>
            <button type="button" className="button" onClick={() => go({ name: 'series' })}>
              Reeks maken
            </button>
          </div>
        </EmptyState>
      ) : (
        <>
          <Panel title={`Komt eraan · ${upcoming.length}`}>
            <TrainingList trainings={upcoming} />
          </Panel>
          {past.length > 0 && (
            <Panel title={`Geweest · ${past.length}`}>
              <TrainingList trainings={past} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

export function TrainingList({ trainings }: { trainings: readonly Training[] }) {
  const { data } = useStore();
  if (trainings.length === 0) return <p className="muted">Niets.</p>;

  return (
    <ul className="list">
      {trainings.map((training) => {
        const present = presentPlayers(training, data.players).length;
        const minutes = training.blocks.reduce((sum, block) => sum + block.minutes, 0);
        return (
          <li key={training.id} className="list__item">
            <a className="list__link" href={href({ name: 'training', id: training.id })}>
              <span className="list__date">{formatDate(training.date)}</span>
              <span className="list__title">
                {training.title}
                {training.done && <span className="tag">gegeven</span>}
              </span>
              <span className="list__meta">
                {training.blocks.length} blokken · {minutes} min · {present} speelsters
              </span>
            </a>
            <a className="button button--ghost" href={href({ name: 'sheet', id: training.id })}>
              Blad
            </a>
          </li>
        );
      })}
    </ul>
  );
}
