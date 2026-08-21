/**
 * Invoerstroom van één actie.
 *
 * De volgorde volgt hoe je een rally ziet: eerst wie de bal speelde, dan wat hij
 * deed, dan waar hij stond, dan hoe het uitpakte. Eén vraag tegelijk — tijdens
 * een rally is er geen tijd om een scherm vol knoppen af te zoeken.
 *
 * Bewust een pure reducer, los van React: dit is het hart van de app en moet te
 * testen zijn zonder een scherm te renderen.
 */

import { requiresZoneFrom, suggestNextAction } from '../../domain/rules';
import type { Action, ActionType, Quality, TeamSide, Zone } from '../../domain/types';

export type EntryStep = 'player' | 'type' | 'zone' | 'quality';

export interface EntryState {
  team: TeamSide;
  playerId: string | null;
  /** Los van `playerId`, omdat 'onbekend' (null) ook een keuze is. */
  playerChosen: boolean;
  type: ActionType | null;
  zoneFrom: Zone | null;
  zoneTo: Zone | null;
  step: EntryStep;
  /** Wat er volgens de rally-keten waarschijnlijk komt; alleen een hint. */
  suggestion: ActionType | null;
}

export type EntryEvent =
  | { kind: 'team'; team: TeamSide }
  | { kind: 'player'; playerId: string | null }
  | { kind: 'type'; type: ActionType }
  | { kind: 'zoneFrom'; zone: Zone }
  | { kind: 'zoneTo'; zone: Zone | null }
  | { kind: 'skipZone' }
  | { kind: 'goTo'; step: EntryStep }
  | { kind: 'back' }
  | { kind: 'reset'; team?: TeamSide }
  /** Na het opslaan van een actie: klaarzetten voor de volgende in de keten. */
  | { kind: 'committed'; last: Pick<Action, 'team' | 'type' | 'quality'> }
  /** Nieuwe rally: de winnaar van de vorige serveert, dus die staat klaar. */
  | { kind: 'rallyStarted'; servingTeam: TeamSide };

export function initialEntryState(team: TeamSide = 'us', suggestion: ActionType | null = null): EntryState {
  return {
    team,
    playerId: null,
    playerChosen: false,
    type: null,
    zoneFrom: null,
    zoneTo: null,
    step: 'player',
    suggestion,
  };
}

/** Is de invoer compleet genoeg om met een kwalificatie te worden vastgelegd? */
export function isReadyToCommit(state: EntryState): state is EntryState & { type: ActionType } {
  if (!state.type || !state.playerChosen) return false;
  return !(requiresZoneFrom(state.type) && state.zoneFrom === null);
}

/**
 * Bij welke actietypes tonen we de zonestap? Verplicht bij service en aanval;
 * bij een blok en de verdediging is de plek vaak nuttig, bij een pass zelden —
 * die stap slaan we daar over.
 */
export function needsZoneStep(type: ActionType): boolean {
  return type !== 'reception';
}

export function entryReducer(state: EntryState, event: EntryEvent): EntryState {
  switch (event.kind) {
    case 'team':
      // Van team wisselen betekent een andere spelerslijst: selectie los laten.
      return { ...state, team: event.team, playerId: null, playerChosen: false, step: 'player' };

    case 'player':
      return { ...state, playerId: event.playerId, playerChosen: true, step: 'type' };

    case 'type':
      return {
        ...state,
        type: event.type,
        zoneFrom: null,
        zoneTo: null,
        step: needsZoneStep(event.type) ? 'zone' : 'quality',
      };

    case 'zoneFrom':
      return { ...state, zoneFrom: event.zone, step: 'quality' };

    case 'zoneTo':
      return { ...state, zoneTo: event.zone };

    case 'skipZone':
      // Alleen toegestaan waar het protocol de zone niet verplicht stelt.
      if (state.type && requiresZoneFrom(state.type)) return state;
      return { ...state, step: 'quality' };

    case 'goTo':
      return { ...state, step: event.step };

    case 'back':
      return stepBack(state);

    case 'reset':
      return initialEntryState(event.team ?? state.team, state.suggestion);

    case 'committed': {
      const suggestion = suggestNextAction(event.last);
      if (!suggestion) return initialEntryState(state.team);
      return initialEntryState(suggestion.team, suggestion.type);
    }

    case 'rallyStarted':
      return initialEntryState(event.servingTeam, 'serve');

    default:
      return state;
  }
}

function stepBack(state: EntryState): EntryState {
  switch (state.step) {
    case 'quality':
      if (state.type && needsZoneStep(state.type)) {
        return { ...state, zoneFrom: null, zoneTo: null, step: 'zone' };
      }
      return { ...state, type: null, step: 'type' };
    case 'zone':
      return { ...state, type: null, zoneFrom: null, zoneTo: null, step: 'type' };
    case 'type':
      return { ...state, playerId: null, playerChosen: false, step: 'player' };
    case 'player':
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
