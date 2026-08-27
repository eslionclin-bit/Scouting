import { describe, expect, it } from 'vitest';
import { newId } from '../../domain/ids';
import { TrainingStore } from '../db/store';
import { makeExercise, makeTraining } from '../test/factory';
import { ShareEngine } from './engine';
import { LoopbackTransport } from './loopback';
import { newGroupCode, normalizeGroupCode, scopesFor, subscribedScopes } from './scopes';
import type { Group } from '../domain/types';

async function openStore(deviceId: string): Promise<TrainingStore> {
  return TrainingStore.open({ name: `test-${newId()}`, deviceId });
}

function stripMeta<T extends { id: string; rev: string; updatedAt: string; deletedAt: string | null }>(
  record: T,
) {
  const { id, rev, updatedAt, deletedAt, ...rest } = record;
  return rest;
}

async function makeGroup(store: TrainingStore, code: string, name = 'Trainers D1'): Promise<Group> {
  return store.groups.create({
    name,
    code,
    members: [{ userId: 'trainer-1', name: 'Marit', joinedAt: '2026-08-01T18:00:00.000Z' }],
    notes: null,
    authorId: 'trainer-1',
    authorName: 'Marit',
  });
}

describe('scopes', () => {
  const group: Group = {
    id: 'groep-1', name: 'Trainers D1', code: 'abcde-fghjk-mnpqr-stuvw', members: [], notes: null,
    rev: 'r', updatedAt: '', deletedAt: null, authorId: 'trainer-1', authorName: 'Marit',
  };

  it('stuurt een privé-oefening nergens heen', () => {
    expect(scopesFor(makeExercise({ visibility: 'private' }), [group])).toEqual([]);
  });

  it('stuurt een openbare oefening naar de openbare bak', () => {
    const scopes = scopesFor(makeExercise({ visibility: 'public' }), [group]);
    expect(scopes.map((scope) => scope.kind)).toEqual(['public']);
  });

  it('stuurt een gedeelde oefening alleen naar de genoemde groepen', () => {
    const met = scopesFor(makeExercise({ visibility: 'group', groupIds: ['groep-1'] }), [group]);
    expect(met.map((scope) => scope.key)).toEqual(['group:groep-1']);
    const zonder = scopesFor(makeExercise({ visibility: 'group', groupIds: ['andere'] }), [group]);
    expect(zonder).toEqual([]);
  });

  it('laat openbaar weg als je die niet volgt', () => {
    expect(subscribedScopes([group], false).map((s) => s.key)).toEqual(['group:groep-1']);
    expect(subscribedScopes([group], true).map((s) => s.key)).toEqual(['public', 'group:groep-1']);
  });

  it('maakt een code die te dicteren is en niet te raden', () => {
    const code = newGroupCode();
    expect(code).toMatch(/^[a-z2-9]{5}(-[a-z2-9]{5}){3}$/);
    expect(newGroupCode()).not.toBe(code);
  });

  it('vergeeft hoofdletters en spaties bij het overtypen', () => {
    expect(normalizeGroupCode('  ABCDE-FGHJK ')).toBe('abcde-fghjk');
  });
});

describe('delen tussen twee trainers', () => {
  it('brengt een openbare oefening bij de ander en laat de privé-oefening staan', async () => {
    const transport = new LoopbackTransport();
    const marit = await openStore('apparaat-a');
    const joost = await openStore('apparaat-b');

    await marit.exercises.create(stripMeta(makeExercise({ title: 'Servicedruk', visibility: 'public' })));
    await marit.exercises.create(stripMeta(makeExercise({ title: 'Eigen aantekening', visibility: 'private' })));

    const verstuurd = await new ShareEngine(marit, transport).syncOnce();
    expect(verstuurd.pushed).toBe(1);
    expect(await marit.pendingCount()).toBe(0);

    const ontvangen = await new ShareEngine(joost, transport).syncOnce();
    expect(ontvangen.received).toBe(1);
    const bij_joost = await joost.exercises.all();
    expect(bij_joost.map((e) => e.title)).toEqual(['Servicedruk']);
    expect(bij_joost[0]?.authorName).toBe('Marit');
  });

  it('deelt een reeks alleen met wie dezelfde groepscode heeft', async () => {
    const transport = new LoopbackTransport();
    const code = newGroupCode();
    const marit = await openStore('apparaat-a');
    const joost = await openStore('apparaat-b');
    const vreemde = await openStore('apparaat-c');

    const groep = await makeGroup(marit, code);
    await makeGroup(joost, code);
    await makeGroup(vreemde, newGroupCode());

    await marit.trainings.create(
      stripMeta(makeTraining({ title: 'Kern: aanval', visibility: 'group', groupIds: [groep.id] })),
    );
    await new ShareEngine(marit, transport).syncOnce();

    await new ShareEngine(joost, transport).syncOnce();
    expect((await joost.trainings.all()).map((t) => t.title)).toEqual(['Kern: aanval']);

    await new ShareEngine(vreemde, transport).syncOnce();
    expect(await vreemde.trainings.all()).toEqual([]);
  });

  it('haalt bij een tweede ronde alleen op wat er bij kwam', async () => {
    const transport = new LoopbackTransport();
    const marit = await openStore('apparaat-a');
    const joost = await openStore('apparaat-b');
    const engine = new ShareEngine(joost, transport);

    await marit.exercises.create(stripMeta(makeExercise({ title: 'Een', visibility: 'public' })));
    await new ShareEngine(marit, transport).syncOnce();
    expect((await engine.syncOnce()).received).toBe(1);
    expect((await engine.syncOnce()).received).toBe(0);

    await marit.exercises.create(stripMeta(makeExercise({ title: 'Twee', visibility: 'public' })));
    await new ShareEngine(marit, transport).syncOnce();
    expect((await engine.syncOnce()).received).toBe(1);
  });

  it('deelt een wijziging van een gedeelde oefening opnieuw', async () => {
    const transport = new LoopbackTransport();
    const marit = await openStore('apparaat-a');
    const joost = await openStore('apparaat-b');

    const oefening = await marit.exercises.create(
      stripMeta(makeExercise({ title: 'Eerste naam', visibility: 'public' })),
    );
    await new ShareEngine(marit, transport).syncOnce();
    await new ShareEngine(joost, transport).syncOnce();

    await marit.exercises.update(oefening.id, { title: 'Betere naam' });
    await new ShareEngine(marit, transport).syncOnce();
    await new ShareEngine(joost, transport).syncOnce();

    expect((await joost.exercises.all()).map((e) => e.title)).toEqual(['Betere naam']);
  });

  it('deelt een verwijdering, zodat een oefening ook bij de ander weggaat', async () => {
    const transport = new LoopbackTransport();
    const marit = await openStore('apparaat-a');
    const joost = await openStore('apparaat-b');

    const oefening = await marit.exercises.create(
      stripMeta(makeExercise({ title: 'Weghalen', visibility: 'public' })),
    );
    await new ShareEngine(marit, transport).syncOnce();
    await new ShareEngine(joost, transport).syncOnce();

    await marit.exercises.remove(oefening.id);
    await new ShareEngine(marit, transport).syncOnce();
    await new ShareEngine(joost, transport).syncOnce();

    expect(await joost.exercises.all()).toEqual([]);
  });

  it('ruimt de outbox op voor wat nergens heen hoeft', async () => {
    const transport = new LoopbackTransport();
    const marit = await openStore('apparaat-a');
    await marit.exercises.create(stripMeta(makeExercise({ visibility: 'private' })));
    const report = await new ShareEngine(marit, transport).syncOnce();
    expect(report.local).toBe(1);
    expect(await marit.pendingCount()).toBe(0);
  });

  it('houdt een wijziging vast als het versturen mislukt', async () => {
    const kapot = {
      name: 'kapot',
      push: async () => { throw new Error('server onbereikbaar'); },
      pull: async () => ({ changes: [], cursor: null, hasMore: false }),
    };
    const marit = await openStore('apparaat-a');
    await marit.exercises.create(stripMeta(makeExercise({ visibility: 'public' })));
    const report = await new ShareEngine(marit, kapot).syncOnce();
    expect(report.errors[0]).toContain('server onbereikbaar');
    expect(await marit.pendingCount()).toBe(1);
    const pending = await marit.pending();
    expect(pending[0]?.attempts).toBe(1);
  });
});
