/**
 * Volledige wedstrijd als één geneste structuur.
 *
 * Dit is de vorm die export, analysedashboard en opponent-dossier allemaal nodig
 * hebben: wedstrijd → sets → rally's → acties, in speelvolgorde.
 */

import type {
  Action,
  Lineup,
  Match,
  MatchSet,
  Player,
  Rally,
  Substitution,
  Team,
} from '../domain/types';
import type { ScoutingStore } from './store';
import { NotFoundError } from './repositories/base';

export interface RallyBundle {
  rally: Rally;
  actions: Action[];
}

export interface SetBundle {
  set: MatchSet;
  rallies: RallyBundle[];
  /** Startopstelling van het eigen team, als die is vastgelegd. */
  lineup: Lineup | undefined;
  /**
   * Startopstelling van de tegenstander, als die is ingevuld. Optioneel, maar
   * het is wat een doelzone bij de service een naam geeft: met hun rotatie
   * erbij is 'zone 5' opeens '#38'.
   */
  opponentLineup: Lineup | undefined;
  substitutions: Substitution[];
}

export interface MatchBundle {
  match: Match;
  ownTeam: Team | undefined;
  opponent: Team | undefined;
  players: Player[];
  sets: SetBundle[];
}

export async function loadMatchBundle(
  store: ScoutingStore,
  matchId: string,
): Promise<MatchBundle> {
  const match = await store.matches.get(matchId);
  if (!match) throw new NotFoundError('Wedstrijd', matchId);

  const [ownTeam, opponent, ownPlayers, opponentPlayers, sets, actions] = await Promise.all([
    store.teams.get(match.ownTeamId),
    store.teams.get(match.opponentTeamId),
    store.players.listByTeam(match.ownTeamId, { includeInactive: true }),
    store.players.listByTeam(match.opponentTeamId, { includeInactive: true }),
    store.sets.listByMatch(matchId),
    store.actions.listByMatch(matchId),
  ]);

  const actionsByRally = new Map<string, Action[]>();
  for (const action of actions) {
    const list = actionsByRally.get(action.rallyId);
    if (list) list.push(action);
    else actionsByRally.set(action.rallyId, [action]);
  }
  for (const list of actionsByRally.values()) list.sort((a, b) => a.sequence - b.sequence);

  const setBundles: SetBundle[] = [];
  for (const set of sets) {
    const [rallies, lineup, opponentLineup, substitutions] = await Promise.all([
      store.rallies.listBySet(set.id),
      store.lineups.forSet(set.id),
      store.lineups.forSet(set.id, 'them'),
      store.substitutions.listBySet(set.id),
    ]);
    setBundles.push({
      set,
      lineup,
      opponentLineup,
      substitutions,
      rallies: rallies.map((rally) => ({
        rally,
        actions: actionsByRally.get(rally.id) ?? [],
      })),
    });
  }

  return {
    match,
    ownTeam,
    opponent,
    players: [...ownPlayers, ...opponentPlayers],
    sets: setBundles,
  };
}
