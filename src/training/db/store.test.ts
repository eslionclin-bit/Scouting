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

describe('een account overnemen', () => {
  it('zet het profiel en alles wat op naam van het oude profiel stond om', async () => {
    const store = await openStore();
    const profile = await store.profile();
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise({
      title: 'Van mij',
      authorId: profile.id,
      authorName: 'Trainer',
    });
    const eigen = await store.exercises.create(input);
    const { id: id2, rev: rev2, updatedAt: u2, deletedAt: d2, ...vanAnder } = makeExercise({
      title: 'Van een ander',
      authorId: 'iemand-anders',
      authorName: 'Joost',
    });
    const ander = await store.exercises.create(vanAnder);

    const changed = await store.adoptAccount({ id: 'account-1', name: 'Marit' });

    expect(changed).toBe(1);
    expect(await store.profile()).toEqual({ id: 'account-1', name: 'Marit' });
    expect((await store.exercises.get(eigen.id))?.authorId).toBe('account-1');
    expect((await store.exercises.get(eigen.id))?.authorName).toBe('Marit');
    // Wat van iemand anders is, blijft van iemand anders.
    expect((await store.exercises.get(ander.id))?.authorId).toBe('iemand-anders');
  });

  it('doet niets als het al hetzelfde account is', async () => {
    const store = await openStore();
    await store.adoptAccount({ id: 'account-1', name: 'Marit' });
    expect(await store.adoptAccount({ id: 'account-1', name: 'Marit' })).toBe(0);
  });
});

describe('twee wijzigingen vlak na elkaar', () => {
  /**
   * Dit ging in de app echt mis: de uitleg van een oefening intikken en meteen
   * daarna een doel aantikken, en de uitleg was weg. Beide wijzigingen lazen
   * dezelfde oude versie en de laatste schreef de eerste weg.
   */
  it('overschrijven elkaar niet', async () => {
    const store = await openStore();
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise({
      title: 'Nieuwe oefening',
      description: '',
      goals: [],
    });
    const oefening = await store.exercises.create(input);

    await Promise.all([
      store.exercises.update(oefening.id, { description: 'Zo gaat de oefening.' }),
      store.exercises.update(oefening.id, { goals: ['attack'] }),
    ]);

    const bewaard = await store.exercises.get(oefening.id);
    expect(bewaard?.description).toBe('Zo gaat de oefening.');
    expect(bewaard?.goals).toEqual(['attack']);
  });

  it('houden bij tien wijzigingen tegelijk alles vast', async () => {
    const store = await openStore();
    const { id, rev, updatedAt, deletedAt, ...input } = makeExercise({ coachingPoints: [] });
    const oefening = await store.exercises.create(input);

    await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        store.exercises.update(oefening.id, { minutes: index + 1 }),
      ),
    );

    const bewaard = await store.exercises.get(oefening.id);
    expect(bewaard?.minutes).toBeGreaterThan(0);
    // Elke wijziging heeft een eigen regel in de outbox: er is er geen verdwenen.
    expect(await store.pendingCount()).toBe(11);
  });
});
