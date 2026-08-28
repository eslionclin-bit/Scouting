// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '../../../domain/ids';
import { TrainingStore } from '../../db/store';
import { AuthProvider } from '../../auth/AuthProvider';
import { StoreProvider } from '../StoreProvider';
import { ExerciseEditScreen } from './ExerciseEditScreen';
import { LibraryScreen } from './LibraryScreen';
import { SheetScreen } from './SheetScreen';
import { TrainingScreen } from './TrainingScreen';

afterEach(cleanup);

/**
 * De schermen draaien op een echte store met een echte (nagebootste) IndexedDB.
 * Dat is expres: wat hier misgaat is meestal het samenspel tussen opslag,
 * verdeling en scherm, en dat vind je niet met een verzonnen store.
 */
async function seed(): Promise<{ store: TrainingStore; trainingId: string }> {
  const store = await TrainingStore.open({ name: `test-${newId()}`, deviceId: 'apparaat-a' });
  const author = { authorId: 'trainer-1', authorName: 'Marit' };
  const team = await store.teams.create({ name: 'Dames 1', season: null, notes: null, ...author });
  for (let index = 1; index <= 8; index++) {
    await store.players.create({
      teamId: team.id,
      name: `Speler ${index}`,
      number: index,
      positions: index === 1 ? ['setter'] : [],
      active: true,
      notes: null,
      ...author,
    });
  }
  const training = await store.trainings.create({
    teamId: team.id,
    title: 'Dinsdagtraining',
    date: '2026-09-08',
    time: '20:00',
    location: 'De Trits',
    focus: null,
    blocks: [],
    attendance: [],
    absent: [],
    seriesId: null,
    visibility: 'private',
    groupIds: [],
    done: false,
    evaluation: null,
    ...author,
  });
  return { store, trainingId: training.id };
}

function renderWith(store: TrainingStore, ui: React.ReactElement) {
  return render(
    <AuthProvider>
      <StoreProvider store={store}>{ui}</StoreProvider>
    </AuthProvider>,
  );
}

describe('de oefeningenbank', () => {
  it('toont de ingebouwde oefeningen en filtert op doel', async () => {
    const { store } = await seed();
    renderWith(store, <LibraryScreen />);

    await screen.findByText('Pepperen');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Blok' }));

    await waitFor(() => expect(screen.queryByText('Pepperen')).toBeNull());
    expect(screen.getByText('Blokvoetenwerk langs het net')).toBeTruthy();
  });

  it('filtert op het aantal spelers', async () => {
    const { store } = await seed();
    renderWith(store, <LibraryScreen />);
    await screen.findByText('Pepperen');

    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Aantal spelers/i), '8');

    // Zes tegen zes vraagt om twaalf spelers en valt dus af.
    await waitFor(() =>
      expect(screen.queryByText('Zes tegen zes met wisselende opdracht')).toBeNull(),
    );
    expect(screen.getByText('Vier tegen vier met opdracht')).toBeTruthy();
  });
});

describe('de trainingsbouwer', () => {
  it('verdeelt de aanwezigen over groepen zodra er een oefening in staat', async () => {
    const { store, trainingId } = await seed();
    const exercise = await store.exercises.create({
      title: 'Vier tegen vier',
      summary: 'Klein veld',
      description: '',
      goals: ['tactics'],
      level: 2,
      minutes: 20,
      material: [],
      group: { min: 4, max: 4, step: 1, maxGroups: 2, roles: [] },
      slots: ['game'],
      coachingPoints: [],
      variants: [],
      animation: null,
      visibility: 'private',
      groupIds: [],
      builtIn: false,
      copiedFromId: null,
      authorId: 'trainer-1',
      authorName: 'Marit',
    });
    await store.trainings.update(trainingId, {
      blocks: [
        {
          id: newId(),
          kind: 'game',
          exerciseId: exercise.id,
          title: null,
          minutes: 20,
          variantId: null,
          note: null,
        },
      ],
    });

    renderWith(store, <TrainingScreen id={trainingId} />);

    await screen.findByText('Vier tegen vier');
    expect(await screen.findByText('Groep 1')).toBeTruthy();
    expect(screen.getByText('Groep 2')).toBeTruthy();
  });

  it('meldt het als een oefening niet past bij wie er zijn, met een alternatief', async () => {
    const { store, trainingId } = await seed();
    const groot = await store.exercises.create(exerciseInput('Zes tegen zes', 12));
    await store.exercises.create(exerciseInput('Vier tegen vier', 8));
    await store.trainings.update(trainingId, {
      blocks: [
        {
          id: newId(),
          kind: 'game',
          exerciseId: groot.id,
          title: null,
          minutes: 20,
          variantId: null,
          note: null,
        },
      ],
    });

    renderWith(store, <TrainingScreen id={trainingId} />);

    expect(await screen.findByText(/4 te weinig/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Vier tegen vier' })).toBeTruthy();
  });

  it('rekent opnieuw zodra iemand wordt afgevinkt', async () => {
    const { store, trainingId } = await seed();
    const exercise = await store.exercises.create(exerciseInput('Vier tegen vier', 4, 2));
    await store.trainings.update(trainingId, {
      blocks: [
        {
          id: newId(),
          kind: 'game',
          exerciseId: exercise.id,
          title: null,
          minutes: 20,
          variantId: null,
          note: null,
        },
      ],
    });

    renderWith(store, <TrainingScreen id={trainingId} />);
    await screen.findByText('Groep 2');

    const user = userEvent.setup();
    // Twee afmelden: dan blijven er zes over, en past er nog maar één groep van vier.
    await user.click(screen.getByLabelText(/Speler 7/i, { selector: 'input' }));
    await user.click(screen.getByLabelText(/Speler 8/i, { selector: 'input' }));

    await waitFor(() => expect(screen.queryByText('Groep 2')).toBeNull());
    expect(screen.getByText(/wisselt in/i)).toBeTruthy();
  });
});

describe('het trainingsblad', () => {
  it('zet de begintijden en de aanwezigen op een rij', async () => {
    const { store, trainingId } = await seed();
    const exercise = await store.exercises.create(exerciseInput('Vier tegen vier', 4, 2));
    await store.trainings.update(trainingId, {
      attendance: ['x'],
      blocks: [
        { id: newId(), kind: 'warmup', exerciseId: null, title: 'Inlopen', minutes: 15, variantId: null, note: null },
        { id: newId(), kind: 'game', exerciseId: exercise.id, title: null, minutes: 30, variantId: null, note: null },
      ],
    });
    // De volgorde waarin de opslag ze teruggeeft ligt niet vast (het zijn
    // UUID's), dus de test kiest er vier en kijkt naar díé namen.
    const players = await store.players.all();
    const aanwezig = players.slice(0, 4);
    await store.trainings.update(trainingId, {
      attendance: aanwezig.map((player) => player.id),
      absent: players.slice(4).map((player) => player.id),
    });

    renderWith(store, <SheetScreen id={trainingId} />);

    await screen.findByText('Dinsdagtraining');
    expect(screen.getByText('20:00')).toBeTruthy();
    expect(screen.getByText('20:15')).toBeTruthy();
    const head = screen.getByText(/4 speelsters/).parentElement as HTMLElement;
    for (const player of aanwezig) {
      expect(within(head).getByText(new RegExp(player.name))).toBeTruthy();
    }
  });
});

function exerciseInput(title: string, size: number, maxGroups = 1) {
  return {
    title,
    summary: '',
    description: '',
    goals: ['tactics' as const],
    level: 2 as const,
    minutes: 20,
    material: [],
    group: { min: size, max: size, step: 1, maxGroups, roles: [] },
    slots: ['game' as const],
    coachingPoints: [],
    variants: [],
    animation: null,
    visibility: 'private' as const,
    groupIds: [],
    builtIn: false,
    copiedFromId: null,
    authorId: 'trainer-1',
    authorName: 'Marit',
  };
}

describe('de animatiebewerker', () => {
  async function seedExercise(store: TrainingStore) {
    return store.exercises.create({
      title: 'Eigen oefening',
      summary: '',
      description: '',
      goals: ['pass'],
      level: 2,
      minutes: 15,
      material: [],
      group: { min: 4, max: 8, step: 1, maxGroups: 1, roles: [] },
      slots: ['core'],
      coachingPoints: [],
      variants: [],
      animation: null,
      visibility: 'private',
      groupIds: [],
      builtIn: false,
      copiedFromId: null,
      authorId: 'trainer-1',
      authorName: 'Marit',
    });
  }

  it('begint een animatie en zet elke speler op een eigen plek', async () => {
    const { store } = await seed();
    const exercise = await seedExercise(store);
    renderWith(store, <ExerciseEditScreen id={exercise.id} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Animatie beginnen' }));
    await user.click(await screen.findByRole('button', { name: '+ Speler' }));
    await user.click(screen.getByRole('button', { name: '+ Bal' }));

    await waitFor(async () => {
      const saved = await store.exercises.get(exercise.id);
      expect(saved?.animation?.markers).toHaveLength(2);
    });
    const saved = await store.exercises.get(exercise.id);
    const spots = Object.values(saved?.animation?.phases[0]?.positions ?? {});
    expect(spots).toHaveLength(2);
    expect(spots[0]).not.toEqual(spots[1]);
  });

  it('maakt van een speler een bewegende speler', async () => {
    const { store } = await seed();
    const exercise = await seedExercise(store);
    renderWith(store, <ExerciseEditScreen id={exercise.id} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Animatie beginnen' }));
    await user.click(await screen.findByRole('button', { name: '+ Speler' }));
    await user.click(await screen.findByRole('button', { name: 'Laat bewegen' }));

    await waitFor(async () => {
      const saved = await store.exercises.get(exercise.id);
      expect(saved?.animation?.phases[0]?.paths).toHaveLength(1);
    });
    // De schakelaar staat daarna op bewegen, zodat de volgende sleep hetzelfde doet.
    expect(screen.getByRole('button', { name: 'Laten bewegen' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('combobox', { name: 'Soort beweging' })).toBeTruthy();
  });

  it('kopieert een fase met beweging en al', async () => {
    const { store } = await seed();
    const exercise = await seedExercise(store);
    renderWith(store, <ExerciseEditScreen id={exercise.id} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Animatie beginnen' }));
    await user.click(await screen.findByRole('button', { name: '+ Speler' }));
    await user.click(await screen.findByRole('button', { name: 'Laat bewegen' }));
    await user.click(await screen.findByRole('button', { name: 'Fase kopiëren' }));

    await waitFor(async () => {
      const saved = await store.exercises.get(exercise.id);
      expect(saved?.animation?.phases).toHaveLength(2);
      expect(saved?.animation?.phases[1]?.paths).toHaveLength(1);
    });
  });

  it('vraagt de duur van een fase in seconden', async () => {
    const { store } = await seed();
    const exercise = await seedExercise(store);
    renderWith(store, <ExerciseEditScreen id={exercise.id} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Animatie beginnen' }));
    const duur = await screen.findByLabelText('Duur van fase 1 in seconden');
    expect((duur as HTMLInputElement).value).toBe('1.2');

    await user.clear(duur);
    await user.type(duur, '2');
    await waitFor(async () => {
      const saved = await store.exercises.get(exercise.id);
      expect(saved?.animation?.phases[0]?.durationMs).toBe(2000);
    });
  });

  it('speelt af in de bewerker zelf, en legt het gereedschap dan weg', async () => {
    const { store } = await seed();
    const exercise = await seedExercise(store);
    renderWith(store, <ExerciseEditScreen id={exercise.id} />);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Animatie beginnen' }));
    await user.click(await screen.findByRole('button', { name: '+ Speler' }));
    await user.click(await screen.findByRole('button', { name: 'Afspelen' }));

    expect(await screen.findByRole('button', { name: 'Pauze' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ Speler' })).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Pauze' }));
    expect(await screen.findByRole('button', { name: '+ Speler' })).toBeTruthy();
  });
});
