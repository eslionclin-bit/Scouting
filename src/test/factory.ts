/** Hulpjes om in tests snel een speelbare wedstrijd op te zetten. */

import { ScoutingStore } from '../db/store';
import { newId } from '../domain/ids';
import type { Match, MatchSet, Player, Team } from '../domain/types';

export async function openTestStore(deviceId = 'device-a'): Promise<ScoutingStore> {
  return ScoutingStore.open({ name: `test-${newId()}`, deviceId });
}

export interface TestMatchFixture {
  ownTeam: Team;
  opponent: Team;
  players: Player[];
  match: Match;
  set: MatchSet;
}

export async function seedMatch(store: ScoutingStore): Promise<TestMatchFixture> {
  const ownTeam = await store.teams.create({ name: 'Onze ploeg', isOwnTeam: true });
  const opponent = await store.teams.findOrCreateOpponent('VC Tegenpartij');
  const players = await store.players.createMany([
    { teamId: ownTeam.id, number: 4, name: 'Sanne' },
    { teamId: ownTeam.id, number: 7, name: 'Noor' },
    { teamId: ownTeam.id, number: 9, name: 'Fem' },
  ]);
  const match = await store.matches.create({
    date: '2026-09-12',
    ownTeamId: ownTeam.id,
    opponentTeamId: opponent.id,
    homeAway: 'home',
    status: 'live',
  });
  const set = await store.sets.start({ matchId: match.id, startingServe: 'us' });
  return { ownTeam, opponent, players, match, set };
}
