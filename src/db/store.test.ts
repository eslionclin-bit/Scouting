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

  it('accepteert rugnummers van drie cijfers', async () => {
    // Niet elke ploeg houdt zich aan 1 t/m 99: geboortejaren en clubnummers
    // staan gewoon op shirts. Wie #321 in het veld ziet moet die kunnen intikken.
    const player = await store.players.create({
      teamId: fixture.ownTeam.id,
      number: 321,
      name: 'Drie cijfers',
    });
    expect(player.number).toBe(321);

    await expect(
      store.players.create({ teamId: fixture.ownTeam.id, number: 1000, name: 'Te lang' }),
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

  it('maakt bij twee gelijktijdige starts één rally aan', async () => {
    // Snel tikken, of de UI die tegelijk opnieuw laadt: beide kwamen vroeger
    // uit op twee openstaande rally's in dezelfde set.
    const [first, second] = await Promise.all([
      store.rallies.start({ setId: fixture.set.id }),
      store.rallies.start({ setId: fixture.set.id }),
    ]);

    expect(first.id).toBe(second.id);
    expect(await store.rallies.listBySet(fixture.set.id)).toHaveLength(1);
  });

  it('geeft gelijktijdig ingevoerde acties oplopende volgnummers', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    await Promise.all([
      store.actions.append({ rallyId: rally.id, team: 'them', type: 'reception', quality: 'good' }),
      store.actions.append({ rallyId: rally.id, team: 'them', type: 'set', quality: 'good' }),
      store.actions.append({ rallyId: rally.id, team: 'them', type: 'attack', quality: 'poor', zoneFrom: 4 }),
    ]);

    const chain = await store.actions.listByRally(rally.id);
    expect(chain.map((action) => action.sequence)).toStrictEqual([1, 2, 3]);
  });

  it('telt een gemist punt mee voor stand en rotatie, herkenbaar als niet ingevoerd', async () => {
    // Wij serveren; de tegenstander wint een rally die de invoerder miste.
    await store.rallies.addMissedPoint({ setId: fixture.set.id, wonBy: 'them' });

    const set = await store.sets.require(fixture.set.id);
    expect(set.pointsThem).toBe(1);

    const rallies = await store.rallies.listBySet(fixture.set.id);
    expect(rallies).toHaveLength(1);
    expect(rallies[0]).toMatchObject({ wonBy: 'them', scouted: false, rotationUs: 1 });
    expect(await store.actions.listByRally(rallies[0]!.id)).toHaveLength(0);

    // De volgende rally begint bij de tegenstander aan service, precies zoals in
    // het veld — anders zou de rotatie gaan afwijken van de werkelijkheid.
    const next = await store.rallies.start({ setId: fixture.set.id });
    expect(next.servingTeam).toBe('them');
  });

  it('laat een gemist punt de rotatie doordraaien bij een sideout', async () => {
    await store.rallies.addMissedPoint({ setId: fixture.set.id, wonBy: 'them' });
    await store.rallies.addMissedPoint({ setId: fixture.set.id, wonBy: 'us' });

    // Zij serveerden, wij wonnen: doordraaien.
    const next = await store.rallies.start({ setId: fixture.set.id });
    expect(next.rotationUs).toBe(2);
    expect(next.servingTeam).toBe('us');
  });

  it('gebruikt een lege openstaande rally voor een gemist punt', async () => {
    const open = await store.rallies.start({ setId: fixture.set.id });

    const missed = await store.rallies.addMissedPoint({ setId: fixture.set.id, wonBy: 'us' });

    expect(missed.id).toBe(open.id);
    expect(await store.rallies.listBySet(fixture.set.id)).toHaveLength(1);
  });

  it('laat een rally met acties met rust bij een gemist punt', async () => {
    const open = await store.rallies.start({ setId: fixture.set.id });
    await store.actions.append({
      rallyId: open.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
    });

    await store.rallies.addMissedPoint({ setId: fixture.set.id, wonBy: 'them' });

    const rallies = await store.rallies.listBySet(fixture.set.id);
    expect(rallies).toHaveLength(2);
    // De lopende rally blijft open; het gemiste punt staat ernaast.
    expect(rallies[0]?.wonBy).toBeNull();
    expect(rallies[1]).toMatchObject({ wonBy: 'them', scouted: false });
  });

  it('staat zes wissels per set toe en de zevende niet', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id });
    const bank = await store.players.createMany(
      Array.from({ length: 7 }, (_, index) => ({
        teamId: fixture.ownTeam.id,
        number: 20 + index,
        name: `Invaller ${index + 1}`,
      })),
    );

    for (let i = 0; i < 6; i++) {
      await store.substitutions.add({
        rallyId: rally.id,
        playerOutId: fixture.players[0]!.id,
        playerInId: bank[i]!.id,
      });
    }
    expect(await store.substitutions.listBySet(fixture.set.id)).toHaveLength(6);

    await expect(
      store.substitutions.add({
        rallyId: rally.id,
        playerOutId: fixture.players[0]!.id,
        playerInId: bank[6]!.id,
      }),
    ).rejects.toThrow(/maximum van 6 wissels/);
  });

  it('zet een actie recht die verder terugligt, zonder de stand te verschuiven', async () => {
    const first = await store.rallies.start({ setId: fixture.set.id });
    const { action } = await store.actions.append({
      rallyId: first.id,
      team: 'us',
      type: 'reception',
      quality: 'good',
      playerId: fixture.players[0]!.id,
    });
    await store.rallies.complete(first.id, 'us');

    // Twee rally's verder blijkt die pass matig te zijn geweest.
    const second = await store.rallies.start({ setId: fixture.set.id });
    await store.rallies.complete(second.id, 'them');

    const revised = await store.actions.revise(action.id, {
      quality: 'poor',
      playerId: fixture.players[1]!.id,
    });

    expect(revised.quality).toBe('poor');
    expect(revised.playerId).toBe(fixture.players[1]!.id);
    // Het rugnummer hoort mee te verhuizen, anders klopt de export niet meer.
    expect(revised.playerNumber).toBe(fixture.players[1]!.number);

    // De stand blijft ongemoeid: die corrigeert de invoerder zelf.
    const set = await store.sets.get(fixture.set.id);
    expect(set).toMatchObject({ pointsUs: 1, pointsThem: 1 });
  });

  it('onthoudt rol en actieve wedstrijd van dit apparaat', async () => {
    expect(await store.getDeviceRole()).toBe('scorer');
    await store.setDeviceRole('viewer');
    await store.setActiveMatchId(fixture.match.id);
    expect(await store.getDeviceRole()).toBe('viewer');
    expect(await store.getActiveMatchId()).toBe(fixture.match.id);
  });
});

describe('een wedstrijd verwijderen', () => {
  it('laat niets achter — ook geen opstellingen en wissels', async () => {
    const store = await openTestStore();
    try {
      const fixture = await seedMatch(store);
      const [sanne, noor, fem] = fixture.players;
      await store.lineups.set({
        setId: fixture.set.id,
        positions: { 1: fem!.id, 2: noor!.id, 3: sanne!.id, 4: null, 5: null, 6: null },
      });
      const rally = await store.rallies.start({ setId: fixture.set.id });
      await store.substitutions.add({
        rallyId: rally.id,
        playerOutId: sanne!.id,
        playerInId: fem!.id,
      });

      await store.matches.remove(fixture.match.id);

      expect(await store.matches.get(fixture.match.id)).toBeUndefined();
      expect(await store.sets.listByMatch(fixture.match.id)).toStrictEqual([]);
      expect(await store.actions.listByMatch(fixture.match.id)).toStrictEqual([]);
      // Deze twee bleven eerst staan: onzichtbaar, maar ze reisden wel mee naar
      // elk gekoppeld apparaat.
      expect(await store.lineups.listByMatch(fixture.match.id)).toStrictEqual([]);
      expect(await store.substitutions.listBySet(fixture.set.id)).toStrictEqual([]);
    } finally {
      store.close();
    }
  });
});
