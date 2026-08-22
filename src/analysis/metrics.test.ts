import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMatchBundle, type MatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore } from '../test/factory';
import { TOP_LEVEL } from './benchmarks';
import { compareMetrics } from './comparison';
import { emptyMetrics, formatMetric, measureMetrics } from './metrics';
import type { Player, Team, TeamSide } from '../domain/types';

describe('kerngetallen', () => {
  let store: ScoutingStore;
  let ownTeam: Team;
  let opponent: Team;
  let speler: Player;

  beforeEach(async () => {
    store = await openTestStore();
    ownTeam = await store.teams.create({ name: 'VCH DS 1', isOwnTeam: true });
    opponent = await store.teams.findOrCreateOpponent('VC Noord');
    speler = (await store.players.createMany([{ teamId: ownTeam.id, number: 9, name: 'Fem' }]))[0]!;
  });

  afterEach(() => store.close());

  /**
   * Speelt rally's met een vaste serverende partij en een vaste uitslag. De
   * serverende partij wordt hier expliciet gezet: dat maakt de verwachte
   * percentages onafhankelijk van wat de app zelf zou afleiden.
   */
  async function playMatch(options: {
    date: string;
    receiving: TeamSide[];
    serving: TeamSide[];
  }): Promise<MatchBundle> {
    const match = await store.matches.create({
      date: options.date,
      ownTeamId: ownTeam.id,
      opponentTeamId: opponent.id,
      homeAway: 'home',
      status: 'finished',
    });
    const receiveSet = await store.sets.start({ matchId: match.id, startingServe: 'them' });
    for (const wonBy of options.receiving) {
      const rally = await store.rallies.start({ setId: receiveSet.id, servingTeam: 'them' });
      await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'reception',
        quality: wonBy === 'us' ? 'good' : 'poor',
        playerId: speler.id,
      });
      await store.rallies.complete(rally.id, wonBy);
    }

    const serveSet = await store.sets.start({ matchId: match.id, startingServe: 'us' });
    for (const wonBy of options.serving) {
      const rally = await store.rallies.start({ setId: serveSet.id, servingTeam: 'us' });
      await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'serve',
        quality: wonBy === 'us' ? 'perfect' : 'error',
        playerId: speler.id,
        zoneFrom: 1,
      });
      const open = await store.rallies.get(rally.id);
      if (open?.wonBy === null) await store.rallies.complete(rally.id, wonBy);
    }

    return loadMatchBundle(store, match.id);
  }

  const outcomes = (won: number, lost: number): TeamSide[] => [
    ...Array.from({ length: won }, () => 'us' as const),
    ...Array.from({ length: lost }, () => 'them' as const),
  ];

  it('rekent sideout en punt op eigen service uit de rally-uitslagen', async () => {
    const bundle = await playMatch({
      date: '2026-09-12',
      receiving: outcomes(6, 4),
      serving: outcomes(3, 7),
    });

    const metrics = measureMetrics([bundle]);
    expect(metrics.sideout.value).toBeCloseTo(0.6);
    expect(metrics.sideout.sample).toBe(10);
    expect(metrics.breakPoint.value).toBeCloseTo(0.3);
    expect(metrics.breakPoint.sample).toBe(10);
    // Zeven verloren eigen services waren allemaal servicefouten.
    expect(metrics.serveError.value).toBeCloseTo(0.7);
  });

  it('zegt niets zodra er niets te tellen valt', () => {
    const empty = emptyMetrics();
    expect(empty.sideout.value).toBeNull();
    expect(formatMetric('sideout', null)).toBe('—');
    expect(formatMetric('attackEfficiency', 0.25)).toBe('+25%');
    expect(formatMetric('sideout', 0.64)).toBe('64%');
  });

  it('vergelijkt pas met het eigen gemiddelde als daar genoeg van gezien is', async () => {
    const nu = await playMatch({ date: '2026-11-01', receiving: outcomes(4, 8), serving: [] });
    const eerder = await playMatch({ date: '2026-09-12', receiving: outcomes(6, 6), serving: [] });

    // Twaalf rally's zijn te weinig voor een eigen niveau: geen oordeel.
    const tekort = compareMetrics(measureMetrics([nu]), measureMetrics([eerder]));
    expect(tekort.find((row) => row.metric.key === 'sideout')?.vsOwn).toBeNull();

    const historie = [
      eerder,
      await playMatch({ date: '2026-09-19', receiving: outcomes(6, 6), serving: [] }),
      await playMatch({ date: '2026-09-26', receiving: outcomes(6, 6), serving: [] }),
    ];
    const genoeg = compareMetrics(measureMetrics([nu]), measureMetrics(historie));
    const sideout = genoeg.find((row) => row.metric.key === 'sideout');

    expect(sideout?.own.value).toBeCloseTo(0.5);
    expect(sideout?.now.value).toBeCloseTo(1 / 3);
    expect(sideout?.vsOwn).toBe('onder');
    expect(sideout?.reference.value).toBe(TOP_LEVEL.values.sideout.value);
    expect(sideout?.reference.basis).toBe('indicatief');
  });

  it('draait het oordeel om bij servicefouten, want daar is minder beter', async () => {
    const historie = [
      await playMatch({ date: '2026-09-12', receiving: [], serving: outcomes(5, 5) }),
      await playMatch({ date: '2026-09-19', receiving: [], serving: outcomes(5, 5) }),
      await playMatch({ date: '2026-09-26', receiving: [], serving: outcomes(5, 5) }),
    ];
    const nu = await playMatch({ date: '2026-11-01', receiving: [], serving: outcomes(9, 1) });

    const row = compareMetrics(measureMetrics([nu]), measureMetrics(historie)).find(
      (entry) => entry.metric.key === 'serveError',
    );

    // 10% fout tegenover 50% eerder: dat is beter, niet slechter.
    expect(row?.now.value).toBeCloseTo(0.1);
    expect(row?.own.value).toBeCloseTo(0.5);
    expect(row?.vsOwn).toBe('boven');
  });
});
