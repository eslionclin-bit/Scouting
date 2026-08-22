import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  attackByBlock,
  errorsByReason,
  attackByPhase,
  attackByTempo,
  attackDistribution,
  serveTargets,
  sideoutByPass,
} from './chains';
import { toActionRows } from './rows';
import { loadMatchBundle, type MatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore, seedMatch, type TestMatchFixture } from '../test/factory';
import { interpretDvw } from '../import/dvw/interpret';
import { decodeDvw, parseDvw } from '../import/dvw/parse';
import type { Quality, TeamSide, Zone } from '../domain/types';

describe('ketens binnen een rally', () => {
  let store: ScoutingStore;
  let fixture: TestMatchFixture;

  beforeEach(async () => {
    store = await openTestStore();
    fixture = await seedMatch(store);
  });

  afterEach(() => store.close());

  /** Eén ontvangen rally: hun service, onze pass, en een uitslag. */
  async function receiveRally(pass: Quality, wonBy: TeamSide, attack?: Quality): Promise<void> {
    const rally = await store.rallies.start({ setId: fixture.set.id, servingTeam: 'them' });
    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'reception',
      quality: pass,
      playerId: fixture.players[0]!.id,
    });
    if (attack) {
      await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'attack',
        quality: attack,
        playerId: fixture.players[2]!.id,
        zoneFrom: 4 as Zone,
      });
    }
    const open = await store.rallies.get(rally.id);
    if (open?.wonBy === null) await store.rallies.complete(rally.id, wonBy);
  }

  async function bundle(): Promise<MatchBundle> {
    return loadMatchBundle(store, fixture.match.id);
  }

  it('laat zien wat een goede pass oplevert', async () => {
    for (let i = 0; i < 10; i++) await receiveRally('perfect', i < 8 ? 'us' : 'them');
    for (let i = 0; i < 10; i++) await receiveRally('poor', i < 3 ? 'us' : 'them');

    const result = sideoutByPass([await bundle()]);
    const perfect = result.rows.find((row) => row.quality === 'perfect');
    const poor = result.rows.find((row) => row.quality === 'poor');

    expect(perfect).toMatchObject({ receptions: 10, sideouts: 8 });
    expect(perfect?.sideoutPct).toBeCloseTo(0.8);
    expect(poor?.sideoutPct).toBeCloseTo(0.3);
    expect(result.total).toBe(20);
    // Het verschil tussen een perfecte en een matige pass: vijftig punten per
    // honderd ontvangen ballen.
    expect(result.gain).toBeCloseTo(0.5);
  });

  it('zwijgt over het verschil zolang er te weinig passes van een soort zijn', async () => {
    for (let i = 0; i < 10; i++) await receiveRally('perfect', 'us');
    await receiveRally('poor', 'them');

    expect(sideoutByPass([await bundle()]).gain).toBeNull();
  });

  it('houdt de eerste bal en de transitiebal uit elkaar', async () => {
    // Eén ontvangen rally met een aanval na de pass: dat is een eerste bal.
    await receiveRally('good', 'us', 'perfect');

    // En een rally op onze eigen service: alles daarin is transitie.
    const own = await store.rallies.start({ setId: fixture.set.id, servingTeam: 'us' });
    await store.actions.append({
      rallyId: own.id,
      team: 'us',
      type: 'serve',
      quality: 'good',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1 as Zone,
    });
    await store.actions.append({
      rallyId: own.id,
      team: 'us',
      type: 'attack',
      quality: 'error',
      playerId: fixture.players[2]!.id,
      zoneFrom: 4 as Zone,
    });
    const open = await store.rallies.get(own.id);
    if (open?.wonBy === null) await store.rallies.complete(own.id, 'them');

    const phases = attackByPhase(toActionRows(await bundle()));
    expect(phases.find((entry) => entry.phase === 'reception')?.stats).toMatchObject({
      total: 1,
      counts: { perfect: 1, good: 0, poor: 0, error: 0 },
    });
    expect(phases.find((entry) => entry.phase === 'transition')?.stats).toMatchObject({
      total: 1,
      counts: { perfect: 0, good: 0, poor: 0, error: 1 },
    });
  });

  it('telt de tweede aanval in dezelfde rally als transitie', async () => {
    const rally = await store.rallies.start({ setId: fixture.set.id, servingTeam: 'them' });
    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'reception',
      quality: 'good',
      playerId: fixture.players[0]!.id,
    });
    for (const quality of ['poor', 'perfect'] as Quality[]) {
      await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'attack',
        quality,
        playerId: fixture.players[2]!.id,
        zoneFrom: 4 as Zone,
      });
    }

    const phases = attackByPhase(toActionRows(await bundle()));
    expect(phases.find((entry) => entry.phase === 'reception')?.stats.total).toBe(1);
    expect(phases.find((entry) => entry.phase === 'transition')?.stats.total).toBe(1);
  });

  it('verdeelt de aanvallen per rotatie over de spelers', async () => {
    await receiveRally('good', 'us', 'perfect');
    await receiveRally('good', 'them', 'error');

    const loaded = await bundle();
    const distribution = attackDistribution(toActionRows(loaded), loaded.players);

    expect(distribution).toHaveLength(1);
    const rotation = distribution[0]!;
    expect(rotation.attacks).toBe(2);
    expect(rotation.attackers[0]).toMatchObject({ number: 9, attacks: 2, share: 1 });
    expect(rotation.attackers[0]?.stats.efficiency).toBe(0);
  });
});

describe('tempo en blok', () => {
  it('splitst de aanvallen uit en laat het aantal zonder tempo apart zien', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);

    /** Eén aanval met de opgegeven kenmerken. */
    async function attack(
      quality: Quality,
      extra: { tempo?: 'high' | 'quick' | 'back' | 'other'; blockers?: 0 | 1 | 2 | 3 } = {},
    ): Promise<void> {
      const rally = await store.rallies.start({ setId: fixture.set.id });
      await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'attack',
        quality,
        playerId: fixture.players[2]!.id,
        zoneFrom: 4 as Zone,
        ...extra,
      });
      const open = await store.rallies.get(rally.id);
      if (open?.wonBy === null) await store.rallies.complete(rally.id, 'us');
    }

    await attack('perfect', { tempo: 'quick', blockers: 1 });
    await attack('perfect', { tempo: 'quick', blockers: 1 });
    await attack('error', { tempo: 'high', blockers: 3 });
    await attack('good'); // zonder tempo en zonder blok

    const rows = toActionRows(await loadMatchBundle(store, fixture.match.id));
    const tempo = attackByTempo(rows);
    const block = attackByBlock(rows);

    expect(tempo.known).toBe(3);
    expect(tempo.unknown).toBe(1);
    const quick = tempo.rows.find((row) => row.tempo === 'quick')!;
    expect(quick.stats.total).toBe(2);
    expect(quick.stats.efficiency).toBe(1);
    expect(quick.share).toBeCloseTo(2 / 3);

    expect(block.known).toBe(3);
    expect(block.rows.find((row) => row.blockers === 3)?.stats.efficiency).toBe(-1);
    expect(block.rows.find((row) => row.blockers === 0)?.stats.total).toBe(0);

    store.close();
  });

  it('leest tempo en blok uit een DataVolley-bestand', async () => {
    const store = await openTestStore();
    const path = new URL('../../fixtures/dvw/katowice-bedzin-2019.dvw', import.meta.url);
    const imported = interpretDvw(parseDvw(decodeDvw(readFileSync(path).buffer as ArrayBuffer)));
    const summary = await store.imports.importScoutedMatch(imported, { fileName: 'test.dvw' });
    const rows = toActionRows(await loadMatchBundle(store, summary.matchId));

    const tempo = attackByTempo(rows);
    expect(tempo.known).toBeGreaterThan(100);
    expect(tempo.rows.find((row) => row.tempo === 'back')?.stats.total).toBeGreaterThan(10);

    // Het cijfer waar het om gaat: tegen drie blokkeerders scoort een aanval
    // veel slechter dan tegen één. Zo niet, dan zit er een fout in de vertaling.
    const block = attackByBlock(rows);
    const one = block.rows.find((row) => row.blockers === 1)!;
    const three = block.rows.find((row) => row.blockers === 3)!;
    expect(one.stats.total).toBeGreaterThan(10);
    expect(three.stats.total).toBeGreaterThan(5);
    expect(one.stats.efficiency!).toBeGreaterThan(three.stats.efficiency!);

    store.close();
  });
});

describe('foutredenen', () => {
  it('telt per actietype waar de fouten heen gaan, en hoeveel er onbekend zijn', async () => {
    const store = await openTestStore();
    const fixture = await seedMatch(store);

    async function serveError(reason?: 'net' | 'out'): Promise<void> {
      const rally = await store.rallies.start({ setId: fixture.set.id, servingTeam: 'us' });
      const { action } = await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'serve',
        quality: 'error',
        playerId: fixture.players[0]!.id,
        zoneFrom: 1 as Zone,
        ...(reason ? { errorReason: reason } : {}),
      });
      expect(action.quality).toBe('error');
      const open = await store.rallies.get(rally.id);
      if (open?.wonBy === null) await store.rallies.complete(rally.id, 'them');
    }

    await serveError('net');
    await serveError('net');
    await serveError('out');
    await serveError();

    const rows = toActionRows(await loadMatchBundle(store, fixture.match.id));
    const breakdown = errorsByReason(rows).find((entry) => entry.type === 'serve')!;

    expect(breakdown.errors).toBe(4);
    expect(breakdown.known).toBe(3);
    expect(breakdown.reasons[0]).toMatchObject({ reason: 'net', count: 2 });
    expect(breakdown.reasons[0]?.share).toBeCloseTo(2 / 3);

    store.close();
  });

  it('haalt de foutreden uit een DataVolley-bestand, voor zover die erin staat', async () => {
    const store = await openTestStore();
    // Niet elk bestand vult de reden in: in twee van onze vier staat er geen
    // enkele. In dit bestand wel.
    const path = new URL('../../fixtures/dvw/braslovce-branik-2015.dvw', import.meta.url);
    const imported = interpretDvw(parseDvw(decodeDvw(readFileSync(path).buffer as ArrayBuffer)));
    const summary = await store.imports.importScoutedMatch(imported, { fileName: 'test.dvw' });
    const rows = toActionRows(await loadMatchBundle(store, summary.matchId));

    const breakdown = errorsByReason(rows);
    const known = breakdown.reduce((sum, entry) => sum + entry.known, 0);
    expect(known).toBeGreaterThan(10);

    const serve = breakdown.find((entry) => entry.type === 'serve')!;
    expect(serve.errors).toBeGreaterThan(5);
    // Een servicefout gaat in het net of uit; iets anders bestaat er nauwelijks.
    expect(serve.reasons.every((entry) => ['net', 'out', 'other'].includes(entry.reason))).toBe(
      true,
    );

    // Een geblokte aanval krijgt zijn reden gratis uit de waardering, ook als de
    // scout geen reden invulde.
    const attack = breakdown.find((entry) => entry.type === 'attack')!;
    expect(attack.reasons.some((entry) => entry.reason === 'blocked')).toBe(true);

    store.close();
  });
});

describe('ketens in een echte wedstrijd', () => {
  it('komt op plausibele cijfers uit bij een Bundesliga-play-off', async () => {
    const store = await openTestStore();
    const path = new URL('../../fixtures/dvw/stuttgart-schwerin-2018.dvw', import.meta.url);
    const imported = interpretDvw(parseDvw(decodeDvw(readFileSync(path).buffer as ArrayBuffer)));
    const summary = await store.imports.importScoutedMatch(imported, { fileName: 'test.dvw' });
    const loaded = await loadMatchBundle(store, summary.matchId);

    const passes = sideoutByPass([loaded]);
    const perfect = passes.rows.find((row) => row.quality === 'perfect')!;
    const poor = passes.rows.find((row) => row.quality === 'poor')!;

    // 97 ontvangen rally's in vijf sets, en een perfecte pass pakt beter uit
    // dan een matige: 63% tegenover 48%.
    expect(passes.total).toBeGreaterThan(90);
    expect(perfect.receptions).toBeGreaterThan(15);
    expect(perfect.sideoutPct!).toBeGreaterThan(poor.sideoutPct!);
    // Een passfout kan per definitie geen sideout opleveren.
    expect(passes.rows.find((row) => row.quality === 'error')?.sideoutPct).toBe(0);

    const phases = attackByPhase(toActionRows(loaded));
    const reception = phases.find((entry) => entry.phase === 'reception')!;
    const transition = phases.find((entry) => entry.phase === 'transition')!;
    expect(reception.stats.total).toBeGreaterThan(50);
    expect(transition.stats.total).toBeGreaterThan(50);

    // Samen zijn het precies alle eigen aanvallen: elke aanval hoort in één van
    // beide fases thuis, en in maar één.
    const attacks = toActionRows(loaded).filter(
      (row) => row.action.team === 'us' && row.action.type === 'attack',
    );
    expect(reception.stats.total + transition.stats.total).toBe(attacks.length);

    store.close();
  });
});

describe('waar we naartoe serveren', () => {
  let store: ScoutingStore;
  let fixture: TestMatchFixture;

  beforeEach(async () => {
    store = await openTestStore();
    fixture = await seedMatch(store);
  });

  afterEach(() => store.close());

  /** Eén service met een doelzone, en wie de rally wint. */
  async function serveTo(zone: Zone, wonBy: TeamSide): Promise<void> {
    const rally = await store.rallies.start({ setId: fixture.set.id, servingTeam: 'us' });
    await store.actions.append({
      rallyId: rally.id,
      team: 'us',
      type: 'serve',
      quality: wonBy === 'us' ? 'good' : 'poor',
      playerId: fixture.players[0]!.id,
      zoneFrom: 1,
      zoneTo: zone,
    });
    await store.rallies.complete(rally.id, wonBy);
  }

  it('telt per zone hoe vaak we de rally wonnen', async () => {
    for (let i = 0; i < 6; i++) await serveTo(5, 'us');
    for (let i = 0; i < 4; i++) await serveTo(1, 'them');

    const targets = serveTargets([await loadMatchBundle(store, fixture.match.id)]);

    expect(targets.total).toBe(10);
    expect(targets.wonPct).toBeCloseTo(0.6);

    const five = targets.byZone.find((row) => row.zone === 5);
    expect(five).toMatchObject({ serves: 6, won: 6 });
    expect(five?.wonPct).toBe(1);

    // Zonder hun opstelling blijft het bij de zone: raden wie daar stond doen
    // we niet.
    expect(targets.byPlayer).toStrictEqual([]);
  });

  it('hangt er een rugnummer aan zodra hun opstelling bekend is', async () => {
    const them = await store.players.createMany([
      { teamId: fixture.opponent.id, number: 38, name: '' },
      { teamId: fixture.opponent.id, number: 3, name: '' },
    ]);
    await store.lineups.set({
      setId: fixture.set.id,
      team: 'them',
      positions: { 1: them[1]!.id, 2: null, 3: null, 4: null, 5: them[0]!.id, 6: null },
    });

    // Wij serveren en winnen alles: hun rotatie blijft dus staan, en #38 blijft
    // in zone 5.
    for (let i = 0; i < 8; i++) await serveTo(5, 'us');

    const targets = serveTargets([await loadMatchBundle(store, fixture.match.id)]);

    expect(targets.byPlayer).toHaveLength(1);
    expect(targets.byPlayer[0]).toMatchObject({ zone: 5, number: 38, serves: 8, won: 8 });
  });
});
