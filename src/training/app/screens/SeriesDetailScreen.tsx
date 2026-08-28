/** Eén reeks: de trainingen die erin zitten, en met wie hij gedeeld is. */

import { useMemo } from 'react';
import { formatDate } from '../../domain/series';
import { VISIBILITY_LABELS, type Visibility } from '../../domain/types';
import { useStore } from '../StoreProvider';
import { useRoute } from '../router';
import { TrainingList } from './TrainingsScreen';
import { EmptyState, Panel } from '../components/ui';

export function SeriesDetailScreen({ id }: { id: string }) {
  const { store, data } = useStore();
  const [, go] = useRoute();
  const series = data.series.find((item) => item.id === id);

  const trainings = useMemo(
    () =>
      data.trainings
        .filter((training) => training.seriesId === id)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [data.trainings, id],
  );

  if (!series) {
    return (
      <EmptyState title="Reeks niet gevonden">
        <button type="button" className="button" onClick={() => go({ name: 'series' })}>
          Naar de reeksen
        </button>
      </EmptyState>
    );
  }

  async function share(visibility: Visibility, groupIds: string[]) {
    await store.series.update(series!.id, { visibility, groupIds });
    // De trainingen gaan mee: een reeks delen zonder de trainingen erin is een
    // lege huls, en dat is niet wat iemand bedoelt als hij 'deel deze reeks' zegt.
    for (const training of trainings) {
      await store.trainings.update(training.id, { visibility, groupIds });
    }
  }

  return (
    <div className="screen">
      <header className="screen__head">
        <button type="button" className="linkbutton" onClick={() => go({ name: 'series' })}>
          ← Reeksen
        </button>
      </header>

      <h1>{series.name}</h1>
      <p className="muted">
        {formatDate(series.startDate)} – {formatDate(series.endDate, true)} · {trainings.length}{' '}
        trainingen · {series.minutes} min
      </p>

      <Panel title="Accenten">
        <ol className="accents">
          {series.accents.map((accent, index) => (
            <li key={index}>
              <strong>{accent.label}</strong> <span className="muted">{accent.weeks} weken</span>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Trainingen">
        <TrainingList trainings={trainings} />
      </Panel>

      <Panel title="Delen">
        <div className="chips">
          {(['private', 'public'] as Visibility[]).map((visibility) => (
            <button
              key={visibility}
              type="button"
              className={`chip ${series.visibility === visibility ? 'is-active' : ''}`}
              onClick={() => void share(visibility, [])}
            >
              {VISIBILITY_LABELS[visibility]}
            </button>
          ))}
          {data.groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`chip ${
                series.visibility === 'group' && series.groupIds.includes(group.id) ? 'is-active' : ''
              }`}
              onClick={() => {
                const has = series.groupIds.includes(group.id);
                const groupIds = has
                  ? series.groupIds.filter((item) => item !== group.id)
                  : [...series.groupIds, group.id];
                void share(groupIds.length > 0 ? 'group' : 'private', groupIds);
              }}
            >
              {group.name}
            </button>
          ))}
        </div>
        <p className="muted">Delen neemt de trainingen uit deze reeks mee.</p>

        <button
          type="button"
          className="button button--danger"
          onClick={async () => {
            if (!confirm(`${series.name} en de ${trainings.length} trainingen weggooien?`)) return;
            for (const training of trainings) await store.trainings.remove(training.id);
            await store.series.remove(series.id);
            go({ name: 'series' });
          }}
        >
          Reeks weggooien
        </button>
      </Panel>
    </div>
  );
}
