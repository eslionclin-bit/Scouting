import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMatchBundle, type MatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore } from '../test/factory';
import { buildTeamProfile, MIN_ROTATION_RALLIES } from './team';
import type { Player, Team, TeamSide, Zone } from '../domain/types';

describe('eigen teamprofiel', () => {
  let store: ScoutingStore;
  let ownTeam: Team;
  let opponent: Team;
  let players: Player[];

  beforeEach(async () => {
    store = await openTestStore();
    ownTeam = await store.teams.create({ name: 'Onze ploeg', isOwnTeam: true });
    opponent = await store.teams.findOrCreateOpponent('VC Tegenpartij');
    players = await store.players.createMany([
      { teamId: ownTeam.id, number: 1, name: 'Een' },
      { teamId: ownTeam.id, number: 2, name: 'Twee' },
      { teamId: ownTeam.id, number: 3, name: 'Drie' },
      { teamId: ownTeam.id, number: 4, name: 'Vier' },
      { teamId: ownTeam.id, number: 5, name: 'Vijf' },
      { teamId: ownTeam.id, number: 6, name: 'Zes' },
      { teamId: ownTeam.id, number: 7, name: 'Zeven' },
    ]);
  });

  afterEach(() => store.close());

  /**
   * Speelt een set waarin de tegenstander steeds serveert en wij elke rally
   * verliezen: zo blijft de rotatie staan en loopt één rotatie vol.
   */
  async function playSet(options: {
    date: string;
    receiveRallies: number;
    sideouts?: number;
    lineup?: Player[];
  }): Promise<MatchBundle> {
    const match = await store.matches.create({
      date: options.date,
      ownTeamId: ownTeam.id,
      opponentTeamId: opponent.id,
      homeAway: 'home',
      status: 'finished',
    });
    const set = await store.sets.start({ matchId: match.id, startingServe: 'them' });

    if (options.lineup) {
      const positions = Object.fromEntries(
        options.lineup.slice(0, 6).map((player, index) => [index + 1, player.id]),
      ) as Record<Zone, string | null>;
      await store.lineups.set({ setId: set.id, positions });
    }

    for (let i = 0; i < options.receiveRallies; i++) {
      const wonBy: TeamSide = i < (options.sideouts ?? 0) ? 'us' : 'them';
      const rally = await store.rallies.start({ setId: set.id });
      await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'reception',
        quality: wonBy === 'us' ? 'good' : 'error',
        playerId: players[0]!.id,
      });
      await store.rallies.complete(rally.id, wonBy);
    }

    return loadMatchBundle(store, match.id);
  }

  it('telt rotaties over meerdere wedstrijden bij elkaar op', async () => {
    const first = await playSet({ date: '2026-09-12', receiveRallies: 6 });
    const second = await playSet({ date: '2026-11-01', receiveRallies: 6 });

    const profile = buildTeamProfile([first, second], ownTeam.id);
    const rotation1 = profile.rotations.find((entry) => entry.rotation === 1);

    expect(profile.matches).toBe(2);
    expect(rotation1?.receiveRallies).toBe(12);
    expect(rotation1?.sideoutPct).toBe(0);
  });

  it('zwijgt over een rotatie waar te weinig van gezien is', async () => {
    const bundle = await playSet({ date: '2026-09-12', receiveRallies: MIN_ROTATION_RALLIES - 1 });

    const profile = buildTeamProfile([bundle], ownTeam.id);
    expect(profile.findings.filter((finding) => finding.code === 'rotation_weak')).toStrictEqual([]);
  });

  it('meldt een rotatie waarin de sideout structureel achterblijft', async () => {
    // Eén sideout per set brengt ons in R2 en de service naar ons; zodra we die
    // weer verliezen, blijven we in R2 steken op hun service.
    const first = await playSet({ date: '2026-09-12', receiveRallies: 8, sideouts: 1 });
    const second = await playSet({ date: '2026-11-01', receiveRallies: 8, sideouts: 1 });

    const profile = buildTeamProfile([first, second], ownTeam.id);
    const finding = profile.findings.find((entry) => entry.code === 'rotation_weak');

    expect(finding?.text).toContain('R2');
    expect(finding?.sample).toBe(12);
    expect(profile.advice.some((entry) => entry.because === finding?.text)).toBe(true);
  });

  it('vergelijkt opstellingen op puntverschil per set', async () => {
    const sterk = players.slice(0, 6);
    const zwak = [...players.slice(1, 6), players[6]!];

    const bundles = [
      await playSet({ date: '2026-09-12', receiveRallies: 4, sideouts: 4, lineup: sterk }),
      await playSet({ date: '2026-09-19', receiveRallies: 4, sideouts: 4, lineup: sterk }),
      await playSet({ date: '2026-10-01', receiveRallies: 6, sideouts: 0, lineup: zwak }),
      await playSet({ date: '2026-10-08', receiveRallies: 6, sideouts: 0, lineup: zwak }),
    ];

    const profile = buildTeamProfile(bundles, ownTeam.id);
    expect(profile.lineups).toHaveLength(2);
    expect(profile.lineups[0]?.diffPerSet).toBeGreaterThan(profile.lineups[1]!.diffPerSet);

    const finding = profile.findings.find((entry) => entry.code === 'lineup_weak');
    expect(finding?.text).toContain('#7');
    expect(profile.advice.some((entry) => entry.text.includes('sterkere opstelling'))).toBe(true);
  });

  it('koppelt aan elke bevinding een advies dat ernaar terugverwijst', async () => {
    const bundles = [
      await playSet({ date: '2026-09-12', receiveRallies: 12, sideouts: 2 }),
      await playSet({ date: '2026-11-01', receiveRallies: 12, sideouts: 2 }),
    ];

    const profile = buildTeamProfile(bundles, ownTeam.id);
    expect(profile.findings.length).toBeGreaterThan(0);
    for (const advice of profile.advice) {
      expect(profile.findings.some((finding) => finding.text === advice.because)).toBe(true);
    }
  });
});
