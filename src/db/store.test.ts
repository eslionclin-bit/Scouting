import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScoutingStore } from './store';
import { ValidationError } from './repositories/base';
import { openTestStore, seedMatch, type TestMatchFixture } from '../test/factory';
import { pendingCount } from '../sync/outbox';

describe('ScoutingStore', () => {
  let store: ScoutingStore;
  let fixture: TestMatchFixture;

  beforeEach(async () => {
    store = await openTestStore();
    fixture = await seedMatch(store);
  });

  afterEach(() => store.close());

  it('legt een rally actie voor actie vast in de juiste volgorde', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    const server = fixture.players[0]!;
    const attacker = fixture.players[2]!;

    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: server.id,
      zoneFrom: 1,
    });
    await store.actions.append({ rallyId: rally.id, team: 'them', type: 'reception', quality: 'poor' });
    await store.actions.append({ rallyId: rally.id, team: 'them', type: 'set', quality: 'good' });
    const { action } = await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'block',
      quality: 'perfect',
      playerId: attacker.id,
    });

    const chain = await store.actions.listByRally(rally.id);
    expect(chain.map((item) => item.type)).toStrictEqual(['serve', 'reception', 'set', 'block']);
    expect(chain.map((item) => item.sequence)).toStrictEqual([1, 2, 3, 4]);
    // Rugnummer wordt meegeschreven, zodat een export leesbaar blijft.
    expect(chain[0]!.playerNumber).toBe(server.number);
    expect(action.matchId).toBe(fixture.match.id);
  });

  it('leidt de uitslag van de rally af uit de laatste actie en werkt de setstand bij', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: 'perfect',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });

    const { rally: completed } = await store.rallies.complete(rally.id);
    expect(completed.wonBy).toBe('us');
    expect(completed.pointsUsAfter).toBe(1);
    expect(completed.pointsThemAfter).toBe(0);

    const set = await store.sets.require(fixture.set.id);
    expect(set.pointsUs).toBe(1);
    expect(set.pointsThem).toBe(0);
  });

  it('vraagt om een expliciete uitslag als de laatste actie de rally niet beëindigt', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({ rallyId: rally.id, team: 'them', type: 'set', quality: 'good' });

    await expect(store.rallies.complete(rally.id)).rejects.toBeInstanceOf(ValidationError);

    const { rally: completed } = await store.rallies.complete(rally.id, 'them');
    expect(completed.wonBy).toBe('them');
    expect((await store.sets.require(fixture.set.id)).pointsThem).toBe(1);
  });

  it('laat de winnaar van de vorige rally serveren', async () => {
    const first = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: first.id,
      team: 'us',
      type: 'serve',
      quality: 'error',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });
    await store.rallies.complete(first.id);

    const second = await store.rallies.start({ setId: fixture.set.id });
    expect(first.servingTeam).toBe('us');
    expect(second.servingTeam).toBe('them');
    expect(second.sequence).toBe(2);
  });

  it('geeft bij een dubbele start dezelfde openstaande rally terug', async () => {
    const first = await store.rallies.start({ setId: fixture.set.id });
    const again = await store.rallies.start({ setId: fixture.set.id });
    expect(again.id).toBe(first.id);
    expect(await store.rallies.listBySet(fixture.set.id)).toHaveLength(1);
  });

  it('maakt undo van de laatste actie ongedaan zonder de rest te raken', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });
    const { action: second } = await store.actions.append({
      rallyId: rally.id,
      team: 'them',
      type: 'reception',
      quality: 'good',
    });

    const undone = await store.actions.undoLast(rally.id);
    expect(undone?.id).toBe(second.id);

    const chain = await store.actions.listByRally(rally.id);
    expect(chain).toHaveLength(1);
    // Undo is een tombstone, geen verwijdering: anders zou een ander apparaat de
    // actie bij de volgende sync gewoon weer terugsturen.
    const raw = await store.db.get('actions', second.id);
    expect(raw?.deletedAt).not.toBeNull();

    // Na undo volgt de nieuwe actie netjes op de eerste.
    const { action: replacement } = await store.actions.append({
      rallyId: rally.id,
      team: 'them',
      type: 'reception',
      quality: 'poor',
    });
    expect(replacement.sequence).toBe(2);
  });

  it('maakt undo van een hele rally ongedaan inclusief acties en setstand', async () => {
    const first = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: first.id,
      team: 'us',
      type: 'attack',
      quality: 'perfect',
      playerId: fixture.players[1]!.id,
      zoneFrom: 4,
    });
    await store.rallies.complete(first.id);
    expect((await store.sets.require(fixture.set.id)).pointsUs).toBe(1);

    await store.rallies.remove(first.id);

    expect(await store.rallies.listBySet(fixture.set.id)).toHaveLength(0);
    expect(await store.actions.listByRally(first.id)).toHaveLength(0);
    expect((await store.sets.require(fixture.set.id)).pointsUs).toBe(0);
  });

  it('weigert een actie in een afgeronde rally', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'attack',
      quality: 'error',
      playerId: fixture.players[1]!.id,
      zoneFrom: 4,
    });
    await store.rallies.complete(rally.id);

    await expect(
      store.actions.append({ rallyId: rally.id, team: 'them', type: 'dig', quality: 'good' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('weigert een aanval zonder vertrekzone', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await expect(
      store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'attack',
        quality: 'good',
        playerId: fixture.players[1]!.id,
      }),
    ).rejects.toThrow(/Vertrekzone/);
  });

  it('houdt rugnummers uniek binnen een team', async () => {
    await expect(
      store.players.create({ teamId: fixture.ownTeam.id, number: 4, name: 'Dubbel' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('koppelt dezelfde tegenstander aan meerdere wedstrijden (opponent-dossier)', async () => {
    const opponent = await store.teams.findOrCreateOpponent('vc tegenpartij');
    expect(opponent.id).toBe(fixture.opponent.id);

    await store.matches.create({
      date: '2026-11-01',
      ownTeamId: fixture.ownTeam.id,
      opponentTeamId: opponent.id,
      homeAway: 'away',
    });
    expect(await store.matches.listByOpponent(opponent.id)).toHaveLength(2);
  });

  it('verwijdert een wedstrijd cascaderend', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({ rallyId: rally.id, team: 'them', type: 'set', quality: 'good' });

    await store.matches.remove(fixture.match.id);

    expect(await store.matches.get(fixture.match.id)).toBeUndefined();
    expect(await store.sets.listByMatch(fixture.match.id)).toHaveLength(0);
    expect(await store.rallies.listByMatch(fixture.match.id)).toHaveLength(0);
    expect(await store.actions.listByMatch(fixture.match.id)).toHaveLength(0);
  });

  it('zet elke schrijfactie in de outbox', async () => {
    const before = await pendingCount(store.db);
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({ rallyId: rally.id, team: 'them', type: 'serve', quality: 'good', zoneFrom: 1 });
    expect(await pendingCount(store.db)).toBe(before + 2);
  });

  it('onthoudt rol en actieve wedstrijd van dit apparaat', async () => {
    expect(await store.getDeviceRole()).toBe('scorer');
    await store.setDeviceRole('viewer');
    await store.setActiveMatchId(fixture.match.id);
    expect(await store.getDeviceRole()).toBe('viewer');
    expect(await store.getActiveMatchId()).toBe(fixture.match.id);
  });
});
