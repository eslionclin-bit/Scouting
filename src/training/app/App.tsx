/** De schil: navigatie en het scherm dat bij het adres hoort. */

import { href, useRoute } from './router';
import { useStore } from './StoreProvider';
import { ExerciseEditScreen } from './screens/ExerciseEditScreen';
import { ExerciseScreen } from './screens/ExerciseScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { ManageScreen } from './screens/ManageScreen';
import { SeriesDetailScreen } from './screens/SeriesDetailScreen';
import { SeriesScreen } from './screens/SeriesScreen';
import { SheetScreen } from './screens/SheetScreen';
import { TodayScreen } from './screens/TodayScreen';
import { TrainingScreen } from './screens/TrainingScreen';
import { TrainingsScreen } from './screens/TrainingsScreen';

const TABS = [
  { route: { name: 'today' } as const, label: 'Vandaag' },
  { route: { name: 'trainings' } as const, label: 'Trainingen' },
  { route: { name: 'library' } as const, label: 'Oefeningen' },
  { route: { name: 'series' } as const, label: 'Reeksen' },
  { route: { name: 'manage' } as const, label: 'Beheer' },
];

export function App() {
  const [route] = useRoute();
  const { sync } = useStore();

  // Het trainingsblad staat er zonder navigatie omheen: in de zaal en op papier
  // is elke knop die je niet nodig hebt er een te veel.
  if (route.name === 'sheet') return <SheetScreen id={route.id} />;

  const active = tabFor(route.name);

  return (
    <div className="app">
      <main className="app__main">{screenFor(route)}</main>

      <nav className="tabs noprint" aria-label="Hoofdmenu">
        {TABS.map((tab) => (
          <a
            key={tab.label}
            className={`tabs__tab ${active === tab.route.name ? 'is-active' : ''}`}
            href={href(tab.route)}
          >
            {tab.label}
            {tab.route.name === 'manage' && sync.pending > 0 && (
              <span className="tabs__badge" aria-label={`${sync.pending} nog te delen`}>
                {sync.pending}
              </span>
            )}
          </a>
        ))}
      </nav>
    </div>
  );
}

function screenFor(route: ReturnType<typeof useRoute>[0]) {
  switch (route.name) {
    case 'today':
      return <TodayScreen />;
    case 'trainings':
      return <TrainingsScreen />;
    case 'training':
      return <TrainingScreen id={route.id} />;
    case 'library':
      return <LibraryScreen />;
    case 'exercise':
      return <ExerciseScreen id={route.id} />;
    case 'exercise-edit':
      return <ExerciseEditScreen id={route.id} />;
    case 'series':
      return <SeriesScreen />;
    case 'series-detail':
      return <SeriesDetailScreen id={route.id} />;
    case 'manage':
      return <ManageScreen />;
    case 'sheet':
      return <SheetScreen id={route.id} />;
  }
}

/** Onder welk tabblad een scherm hoort; anders licht er niets op. */
function tabFor(name: string): string {
  if (name === 'training') return 'trainings';
  if (name === 'exercise' || name === 'exercise-edit') return 'library';
  if (name === 'series-detail') return 'series';
  return name;
}
