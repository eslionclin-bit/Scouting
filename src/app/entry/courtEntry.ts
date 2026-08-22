/**
 * Invoeren door op het veld te tikken.
 *
 * De stapsgewijze invoer (`entryReducer`) stelt elke vraag opnieuw, ook als het
 * antwoord al vastligt. Op een tablet kan dat anders: het hele veld past op het
 * scherm, en één tik op een vak zegt tegelijk wie het was, welke kant en welke
 * zone. Wat er dan nog over is, is de kwalificatie.
 *
 * Twee tikken per actie dus, met de actiesoort als voorspelling ertussen —
 * zichtbaar, en met één tik te overrulen.
 */

import { suggestNextAction } from '../../domain/rules';
import type { AppSettings } from '../../domain/settings';
import type { Action, ActionType, Quality, TeamSide, Zone } from '../../domain/types';

/** Wat er aangetikt is: een speler van ons, of een zone van de tegenstander. */
export interface CourtSelection {
  team: TeamSide;
  playerId: string | null;
  playerNumber: number | null;
  zone: Zone | null;
}

export interface CourtEntryState {
  selection: CourtSelection | null;
  type: ActionType;
  /** Bij welke ploeg de verwachte actie hoort. */
  expectedTeam: TeamSide;
  /** Heeft de invoerder de voorspelling overruled? Dan niet opnieuw voorspellen. */
  typeChosen: boolean;
}

export type CourtEntryEvent =
  | { kind: 'select'; selection: CourtSelection }
  | { kind: 'type'; type: ActionType }
  | { kind: 'serveSpot'; zone: Zone }
  | { kind: 'clear' }
  /** Nieuwe verwachting na een opgeslagen actie of een nieuwe rally. */
  | { kind: 'expect'; team: TeamSide; type: ActionType; selection?: CourtSelection | null };

export function initialCourtState(
  team: TeamSide = 'us',
  type: ActionType = 'serve',
  selection: CourtSelection | null = null,
): CourtEntryState {
  return { selection, type, expectedTeam: team, typeChosen: false };
}

/**
 * Wat de andere kant op dat moment waarschijnlijk deed.
 *
 * Tik je op de ploeg waar de verwachting niet over ging, dan klopt het
 * actietype meestal ook niet meer: verwachtte de app onze service en tik je de
 * tegenstander aan, dan gaat het om hun pass. Altijd met één tik te corrigeren.
 */
const OTHER_SIDE: Record<ActionType, ActionType> = {
  serve: 'reception',
  reception: 'attack',
  set: 'attack',
  attack: 'dig',
  block: 'attack',
  dig: 'attack',
};

export function courtEntryReducer(
  state: CourtEntryState,
  event: CourtEntryEvent,
): CourtEntryState {
  switch (event.kind) {
    case 'select': {
      // Andere ploeg dan verwacht? Dan schuift het actietype mee, tenzij de
      // invoerder het zelf al had gekozen.
      const flip = event.selection.team !== state.expectedTeam && !state.typeChosen;
      return {
        ...state,
        selection: event.selection,
        type: flip ? OTHER_SIDE[state.type] : state.type,
        expectedTeam: flip ? event.selection.team : state.expectedTeam,
      };
    }

    case 'type':
      // Een andere ploeg kiezen wist de selectie: de vakken van de ene helft
      // zeggen niets over de andere.
      return { ...state, type: event.type, typeChosen: true };

    case 'serveSpot':
      return state.selection
        ? { ...state, selection: { ...state.selection, zone: event.zone } }
        : state;

    case 'clear':
      return { ...state, selection: null };

    case 'expect':
      return initialCourtState(event.team, event.type, event.selection ?? null);

    default:
      return state;
  }
}

/**
 * Wat de app verwacht na de vorige actie, met de voorkeuren erin verwerkt.
 *
 * De set-up en de pass van de tegenstander zijn overslaanbaar; dat betekent
 * hier alleen dat ze niet worden vóórgesteld. Kiezen kan altijd, en een fout
 * kan sowieso niet verdwijnen: die beëindigt de rally, dus hij wordt hoe dan
 * ook ingevoerd.
 */
export function expectedNext(
  last: Pick<Action, 'team' | 'type' | 'quality'> | undefined,
  servingTeam: TeamSide,
  settings: Pick<AppSettings, 'askSetup' | 'trackOpponentReception'>,
): { team: TeamSide; type: ActionType } {
  if (!last) return { team: servingTeam, type: 'serve' };

  const suggestion = suggestNextAction(last);
  if (!suggestion) return { team: servingTeam, type: 'serve' };

  // Set-up overslaan: na de pass verwachten we meteen de aanval.
  if (suggestion.type === 'set' && !settings.askSetup) {
    return { team: suggestion.team, type: 'attack' };
  }

  // De pass van de tegenstander overslaan: dan is hun aanval het volgende.
  if (
    suggestion.type === 'reception' &&
    suggestion.team === 'them' &&
    !settings.trackOpponentReception
  ) {
    return { team: 'them', type: 'attack' };
  }

  return suggestion;
}

/** Serveerplekken achter de achterlijn, zoals ze in het veld heten. */
export const SERVE_SPOTS: readonly { zone: Zone; label: string }[] = [
  { zone: 5, label: 'Links' },
  { zone: 6, label: 'Midden' },
  { zone: 1, label: 'Rechts' },
] as const;

export function isReady(state: CourtEntryState): boolean {
  return state.selection !== null;
}

export function toCourtDraft(
  state: CourtEntryState,
  quality: Quality,
): {
  team: TeamSide;
  type: ActionType;
  quality: Quality;
  playerId: string | null;
  playerNumber: number | null;
  zoneFrom: Zone | null;
} | null {
  if (!state.selection) return null;
  return {
    team: state.selection.team,
    type: state.type,
    quality,
    playerId: state.selection.playerId,
    playerNumber: state.selection.playerNumber,
    zoneFrom: state.selection.zone,
  };
}
