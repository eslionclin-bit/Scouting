import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attackByPhase, attackDistribution, sideoutByPass } from './chains';
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
