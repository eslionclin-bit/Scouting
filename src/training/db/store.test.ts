import { beforeEach, describe, expect, it } from 'vitest';
import { newId } from '../../domain/ids';
import { TrainingStore } from './store';
import { makeExercise } from '../test/factory';

async function openStore(deviceId = 'apparaat-a'): Promise<TrainingStore> {
  return TrainingStore.open({ name: `test-${newId()}`, deviceId });
}

describe('opslag', () => {
  let store: TrainingStore;

  beforeEach(async () => {
    store = await openStore();
  });

  it('bewaart een oefening en geeft hem terug', async () => {
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise({ title: 'Pepperen' });
    const created = await store.exercises.create(input);
    expect(created.id).toBeTruthy();
    expect(created.rev).toBeTruthy();
    expect(await store.exercises.get(created.id)).toEqual(created);
  });

  it('geeft bij wijzigen een nieuwere revisie', async () => {
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise();
    const created = await store.exercises.create(input);
    const updated = await store.exercises.update(created.id, { title: 'Anders' });
    expect(updated.title).toBe('Anders');
    expect(updated.rev > created.rev).toBe(true);
  });

  it('verwijdert met een tombstone, niet door de rij weg te gooien', async () => {
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise();
    const created = await store.exercises.create(input);
    await store.exercises.remove(created.id);
    expect(await store.exercises.get(created.id)).toBeNull();
    expect(await store.exercises.all()).toEqual([]);
    const withDeleted = await store.exercises.all(true);
    expect(withDeleted[0]?.deletedAt).not.toBeNull();
  });

  it('zet elke schrijfactie in de outbox', async () => {
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise();
    const created = await store.exercises.create(input);
    await store.exercises.update(created.id, { title: 'Twee' });
    expect(await store.pendingCount()).toBe(2);
  });

  it('meldt wijzigingen aan wie meeleest', async () => {
    const events: string[] = [];
    store.subscribe((batch) => events.push(...batch.map((event) => `${event.entity}:${event.kind}`)));
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise();
    const created = await store.exercises.create(input);
    await store.exercises.remove(created.id);
    expect(events).toEqual(['exercises:put', 'exercises:delete']);
  });

  it('maakt één keer een profiel aan en houdt dat vast', async () => {
    const first = await store.profile();
    const second = await store.profile();
    expect(second.id).toBe(first.id);
    const renamed = await store.setProfileName('Marit');
    expect((await store.profile()).name).toBe('Marit');
    expect(renamed.id).toBe(first.id);
  });

  it('bewaart instellingen met standaardwaarden erin', async () => {
    expect((await store.settings()).followPublic).toBe(true);
    await store.saveSettings({ syncUrl: 'https://voorbeeld.nl' });
    const settings = await store.settings();
    expect(settings.syncUrl).toBe('https://voorbeeld.nl');
    expect(settings.followPublic).toBe(true);
  });
});

describe('binnengekomen wijzigingen', () => {
  it('neemt een nieuwere revisie over en laat een oudere staan', async () => {
    const store = await openStore();
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise({ title: 'Van mij' });
    const mine = await store.exercises.create(input);

    const ouder = { ...mine, title: 'Oud', rev: '000000000000001-00000-apparaat-b' };
    await store.applyRemote([{ entity: 'exercises', record: ouder }]);
    expect((await store.exercises.get(mine.id))?.title).toBe('Van mij');

    const nieuwer = { ...mine, title: 'Nieuw', rev: '999999999999999-00000-apparaat-b' };
    const result = await store.applyRemote([{ entity: 'exercises', record: nieuwer }]);
    expect(result.applied).toBe(1);
    expect((await store.exercises.get(mine.id))?.title).toBe('Nieuw');
  });

  it('zet binnengekomen wijzigingen niet terug in de outbox', async () => {
    const store = await openStore();
    const record = makeExercise({ rev: '999999999999999-00000-apparaat-b' });
    await store.applyRemote([{ entity: 'exercises', record }]);
    expect(await store.pendingCount()).toBe(0);
  });
});
