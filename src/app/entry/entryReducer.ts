/**
 * Invoerstroom van één actie: team → actietype → speler → zone → kwalificatie.
 *
 * Bewust een pure reducer, los van React: de volgorde uit schermontwerp A is het
 * hart van de app en moet te testen zijn zonder een scherm te renderen.
 */

import { requiresZoneFrom, suggestNextAction } from '../../domain/rules';
import type { Action, ActionType, Quality, TeamSide, Zone } from '../../domain/types';

export type EntryStep = 'type' | 'player' | 'zone' | 'quality';

export interface EntryState {
  team: TeamSide;
  type: ActionType | null;
  playerId: string | null;
  zoneFrom: Zone | null;
  zoneTo: Zone | null;
  step: EntryStep;
}

export type EntryEvent =
  | { kind: 'team'; team: TeamSide }
  | { kind: 'type'; type: ActionType }
  | { kind: 'player'; playerId: string | null }
  | { kind: 'zoneFrom'; zone: Zone }
  | { kind: 'zoneTo'; zone: Zone | null }
  | { kind: 'skipZone' }
  | { kind: 'back' }
  | { kind: 'reset'; team?: TeamSide }
  /** Nieuwe rally: de winnaar van de vorige serveert, dus die staat klaar. */
  | { kind: 'rallyStarted'; servingTeam: TeamSide }
  /** Na het opslaan van een actie: klaarzetten voor de volgende in de keten. */
  | { kind: 'committed'; last: Pick<Action, 'team' | 'type' | 'quality'> };

export function initialEntryState(team: TeamSide = 'us'): EntryState {
  return { team, type: null, playerId: null, zoneFrom: null, zoneTo: null, step: 'type' };
}

/** Is de invoer compleet genoeg om met een kwalificatie te worden vastgelegd? */
export function isReadyToCommit(state: EntryState): state is EntryState & { type: ActionType } {
  if (!state.type) return false;
  return !(requiresZoneFrom(state.type) && state.zoneFrom === null);
}

export function entryReducer(state: EntryState, event: EntryEvent): EntryState {
  switch (event.kind) {
    case 'team':
      // Van team wisselen betekent een andere spelerslijst: selectie los laten.
      return { ...state, team: event.team, playerId: null, step: state.type ? 'player' : 'type' };

    case 'type':
      return { ...state, type: event.type, step: 'player' };

    case 'player':
      return {
        ...state,
        playerId: event.playerId,
        step: state.type && needsZoneStep(state.type) ? 'zone' : 'quality',
      };

    case 'zoneFrom':
      return { ...state, zoneFrom: event.zone, step: 'quality' };

    case 'zoneTo':
      return { ...state, zoneTo: event.zone };

    case 'skipZone':
      // Alleen toegestaan waar het protocol de zone niet verplicht stelt.
      if (state.type && requiresZoneFrom(state.type)) return state;
      return { ...state, step: 'quality' };

    case 'back':
      return stepBack(state);

    case 'reset':
      return initialEntryState(event.team ?? state.team);

    case 'rallyStarted':
      return { ...initialEntryState(event.servingTeam), type: 'serve', step: 'player' };

    case 'committed': {
      const suggestion = suggestNextAction(event.last);
      if (!suggestion) return initialEntryState(state.team);
      return { ...initialEntryState(suggestion.team), type: suggestion.type, step: 'player' };
    }

    default:
      return state;
  }
}

/**
 * Bij welke actietypes tonen we de zonestap? Verplicht bij opslag en aanval;
 * bij de rest optioneel, omdat de landingszone waardevol is als er tijd voor is.
 */
export function needsZoneStep(type: ActionType): boolean {
  return type !== 'reception';
}

function stepBack(state: EntryState): EntryState {
  switch (state.step) {
    case 'quality':
      if (state.type && needsZoneStep(state.type)) {
        return { ...state, zoneFrom: null, zoneTo: null, step: 'zone' };
      }
      return { ...state, playerId: null, step: 'player' };
    case 'zone':
      return { ...state, playerId: null, step: 'player' };
    case 'player':
      return { ...state, type: null, step: 'type' };
    case 'type':
    default:
      return state;
  }
}

/** Wat er straks naar `store.actions.append()` gaat. */
export function toActionDraft(
  state: EntryState,
  quality: Quality,
): {
  team: TeamSide;
  type: ActionType;
  quality: Quality;
  playerId: string | null;
  zoneFrom: Zone | null;
  zoneTo: Zone | null;
} | null {
  if (!isReadyToCommit(state)) return null;
  return {
    team: state.team,
    type: state.type,
    quality,
    playerId: state.playerId,
    zoneFrom: state.zoneFrom,
    zoneTo: state.zoneTo,
  };
}
