import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { computeReference, measureMetrics, MIN_REFERENCE_SAMPLE } from '../analysis';
import { loadMatchBundle, type MatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore } from '../test/factory';
import { interpretDvw } from './dvw/interpret';
import { decodeDvw, parseDvw } from './dvw/parse';

function fixture(name: string): string {
  const path = new URL(`../../fixtures/dvw/${name}`, import.meta.url);
  return decodeDvw(readFileSync(path).buffer as ArrayBuffer);
}

describe('een ingelezen wedstrijd in de opslag', () => {
  let store: ScoutingStore;

  beforeEach(async () => {
    store = await openTestStore();
  });

  afterEach(() => store.close());

  async function importFile(name: string) {
    const match = interpretDvw(parseDvw(fixture(name)));
    return store.imports.importScoutedMatch(match, { fileName: name });
  }

  it('zet een Bundesliga-wedstrijd om in rally’s, acties en spelers', async () => {
    const summary = await importFile('stuttgart-schwerin-2018.dvw');

    expect(summary.homeTeam).toBe('Allianz MTV Stuttgart');
    expect(summary.sets).toBe(5);
    expect(summary.rallies).toBeGreaterThan(180);
    expect(summary.actions).toBeGreaterThan(1000);
    expect(summary.actionsPerRally).toBeGreaterThan(4);

    const bundle = await loadMatchBundle(store, summary.matchId);
    const scores = bundle.sets.map((set) => `${set.set.pointsUs}-${set.set.pointsThem}`);
    expect(scores).toStrictEqual(['25-21', '22-25', '22-25', '25-21', '12-15']);

    // Elke actie hangt aan een speler uit het bestand, op de onbekende na.
    const actions = bundle.sets.flatMap((set) =>
      set.rallies.flatMap((rally) => rally.actions),
    );
    const withPlayer = actions.filter((action) => action.playerId !== null);
    expect(withPlayer.length / actions.length).toBeGreaterThan(0.95);
  });

  it('houdt referentiewedstrijden buiten onze eigen wedstrijdlijst', async () => {
    await importFile('braslovce-branik-2015.dvw');

    expect(await store.matches.list()).toStrictEqual([]);
    expect(await store.teams.opponents()).toStrictEqual([]);
    expect(await store.matches.listReference()).toHaveLength(1);
  });

  it('leest dezelfde ploeg uit twee bestanden als één ploeg', async () => {
    await importFile('stuttgart-schwerin-2018.dvw');
    await importFile('stuttgart-schwerin-2018.dvw');

    const teams = (await store.teams.list()).filter((team) => team.reference);
    expect(teams).toHaveLength(2);
    expect(await store.matches.listReference()).toHaveLength(2);
  });

  it('berekent referentiewaarden uit beide ploegen van elke wedstrijd', async () => {
    const bundles: MatchBundle[] = [];
    for (const name of [
      'stuttgart-schwerin-2018.dvw',
      'katowice-bedzin-2019.dvw',
      'hartberg-graz-2020.dvw',
      'braslovce-branik-2015.dvw',
    ]) {
      const summary = await importFile(name);
      bundles.push(await loadMatchBundle(store, summary.matchId));
    }

    const computed = computeReference(bundles);
    expect(computed).not.toBeNull();
    const sideout = computed!.level.values.sideout;

    expect(sideout.basis).toBe('berekend');
    expect(sideout.source).toContain('4 ingelezen wedstrijden');
    // Beide ploegen meegeteld hoort rond de helft uit te komen: elke rally is
    // voor de een een sideout en voor de ander een gemiste breakpoint.
    expect(sideout.value).toBeGreaterThan(0.5);
    expect(sideout.value).toBeLessThan(0.75);

    // Het ondiep gescoute bekerbestand telt niet mee voor de actiegetallen.
    expect(computed!.source.detailedMatches).toBeLessThan(computed!.source.matches);
    expect(computed!.level.values.attackKill.source).toContain(
      `${computed!.source.detailedMatches} ingelezen`,
    );
  });

  it('valt terug op de indicatieve waarde zolang er te weinig is ingelezen', async () => {
    const summary = await importFile('braslovce-branik-2015.dvw');
    const bundle = await loadMatchBundle(store, summary.matchId);

    // Eén jeugdfinale is genoeg voor de rally-getallen, maar de drempel geldt
    // per getal: wat eronder blijft houdt het label 'indicatief'.
    const computed = computeReference([bundle])!;
    for (const key of ['sideout', 'attackKill'] as const) {
      const entry = computed.level.values[key];
      const measured = measureMetrics([bundle], { side: 'us' })[key];
      if (entry.basis === 'indicatief') {
        expect(measured.sample * 2).toBeLessThan(MIN_REFERENCE_SAMPLE);
      }
    }
  });
});
