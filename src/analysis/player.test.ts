import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadMatchBundle, type MatchBundle } from '../db/bundle';
import type { ScoutingStore } from '../db/store';
import { openTestStore } from '../test/factory';
import { buildPlayerProfile, MIN_HISTORY_ACTIONS } from './player';
import type { Player, Quality, Team, Zone } from '../domain/types';

describe('spelerprofiel', () => {
  let store: ScoutingStore;
  let ownTeam: Team;
  let opponent: Team;
  let fem: Player;
  let noor: Player;

  beforeEach(async () => {
    store = await openTestStore();
    ownTeam = await store.teams.create({ name: 'VCH DS 1', isOwnTeam: true });
    opponent = await store.teams.findOrCreateOpponent('VC Noord');
    const created = await store.players.createMany([
      { teamId: ownTeam.id, number: 9, name: 'Fem', role: 'outside' },
      { teamId: ownTeam.id, number: 7, name: 'Noor', role: 'middle' },
    ]);
    fem = created[0]!;
    noor = created[1]!;
  });

  afterEach(() => store.close());

  /** Speelt een wedstrijd waarin Fem een aantal aanvallen doet. */
  async function playMatch(options: {
    date: string;
    attacks: Quality[];
  }): Promise<MatchBundle> {
    const match = await store.matches.create({
      date: options.date,
      ownTeamId: ownTeam.id,
      opponentTeamId: opponent.id,
      homeAway: 'home',
      status: 'finished',
    });
    const set = await store.sets.start({ matchId: match.id, startingServe: 'us' });

    for (const quality of options.attacks) {
      const rally = await store.rallies.start({ setId: set.id });
      await store.actions.append({
        rallyId: rally.id,
        team: 'us',
        type: 'attack',
        quality,
        playerId: fem.id,
        zoneFrom: 4 as Zone,
      });
      const open = await store.rallies.get(rally.id);
      if (open?.wonBy === null) await store.rallies.complete(rally.id, 'us');
    }

    return loadMatchBundle(store, match.id);
  }

  const goede = (aantal: number): Quality[] => Array.from({ length: aantal }, () => 'perfect');
  const foute = (aantal: number): Quality[] => Array.from({ length: aantal }, () => 'error');

  it('zet de wedstrijden op een rij, nieuwste eerst', async () => {
    const eerste = await playMatch({ date: '2026-09-12', attacks: goede(4) });
    const tweede = await playMatch({ date: '2026-11-01', attacks: goede(2) });

    const profile = buildPlayerProfile([eerste, tweede], fem);

    expect(profile.matchesPlayed).toBe(2);
    expect(profile.matches[0]?.date).toBe('2026-11-01');
    expect(profile.season.byType.attack.total).toBe(6);
    expect(profile.name).toBe('Fem');
  });

  it('laat een speler zonder acties buiten beschouwing', async () => {
    const bundle = await playMatch({ date: '2026-09-12', attacks: goede(3) });

    const profile = buildPlayerProfile([bundle], noor);
    expect(profile.matchesPlayed).toBe(0);
    expect(profile.form).toStrictEqual([]);
  });

  it('zegt niets over vorm zolang er te weinig historie is', async () => {
    const eerste = await playMatch({ date: '2026-09-12', attacks: goede(8) });
    const tweede = await playMatch({ date: '2026-11-01', attacks: foute(8) });

    // Acht aanvallen in de historie is te weinig om een niveau op te baseren.
    const profile = buildPlayerProfile([eerste, tweede], fem);
    expect(profile.form).toStrictEqual([]);
  });

  it('herkent een speler die onder haar eigen niveau speelt', async () => {
    const historie = [
      await playMatch({ date: '2026-09-12', attacks: goede(10) }),
      await playMatch({ date: '2026-09-19', attacks: goede(10) }),
      await playMatch({ date: '2026-09-26', attacks: goede(5) }),
    ];
    const vandaag = await playMatch({ date: '2026-11-01', attacks: foute(8) });

    const profile = buildPlayerProfile([...historie, vandaag], fem);
    const aanval = profile.form.find((entry) => entry.type === 'attack');

    expect(aanval?.verdict).toBe('onder');
    expect(aanval?.actionsNow).toBe(8);
    expect(aanval?.actionsSeason).toBeGreaterThanOrEqual(MIN_HISTORY_ACTIONS);
    expect(aanval?.season).toBe(1);
    expect(aanval?.now).toBe(-1);
  });

  it('herkent ook een speler die er juist bovenuit springt', async () => {
    const historie = [
      await playMatch({ date: '2026-09-12', attacks: [...goede(5), ...foute(5)] }),
      await playMatch({ date: '2026-09-19', attacks: [...goede(5), ...foute(5)] }),
      await playMatch({ date: '2026-09-26', attacks: [...goede(3), ...foute(3)] }),
    ];
    const vandaag = await playMatch({ date: '2026-11-01', attacks: goede(8) });

    const profile = buildPlayerProfile([...historie, vandaag], fem);
    expect(profile.form.find((entry) => entry.type === 'attack')?.verdict).toBe('boven');
  });
});
