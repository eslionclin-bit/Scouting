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

import { tempoFromZone } from '../../domain/attack';
import { requiresZoneFrom, suggestNextAction } from '../../domain/rules';
import type {
  Action,
  ActionType,
  AttackTempo,
  BlockCount,
  Quality,
  TeamSide,
  Zone,
} from '../../domain/types';

export type EntryStep = 'player' | 'type' | 'zone' | 'target' | 'attack' | 'quality';

export interface EntryState {
  team: TeamSide;
  playerId: string | null;
  /** Los van `playerId`, omdat 'onbekend' (null) ook een keuze is. */
  playerChosen: boolean;
  type: ActionType | null;
  zoneFrom: Zone | null;
  zoneTo: Zone | null;
  /** Alleen bij een aanval; allebei mag leeg blijven. */
  tempo: AttackTempo | null;
  blockers: BlockCount | null;
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
  | { kind: 'tempo'; tempo: AttackTempo }
  | { kind: 'blockers'; blockers: BlockCount }
  | { kind: 'skipAttack' }
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
    tempo: null,
    blockers: null,
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

/**
 * De extra vraag bij een aanval: welk tempo, en hoeveel blok stond ertegenover.
 * Alleen bij een aanval — dat is de actie waar het antwoord het meest verklaart,
 * en de enige waar twee tikken extra te verantwoorden zijn.
 */
export function needsAttackStep(type: ActionType): boolean {
  return type === 'attack';
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
        tempo: null,
        blockers: null,
        step: needsZoneStep(event.type) ? 'zone' : nextAfterZone(event.type, state.team),
      };

    case 'zoneFrom':
      return {
        ...state,
        zoneFrom: event.zone,
        // Stond ze achterin, dan is het een achteraanval. Dat hoeft de invoerder
        // niet nog eens in te tikken; welke het was (pipe, of vanaf 1 of 5)
        // volgt al uit deze zone.
        tempo: (state.type === 'attack' ? tempoFromZone(event.zone) : null) ?? state.tempo,
        step: nextAfterZone(state.type, state.team),
      };

    // Het tempo kiezen laat de stap staan: daarna volgt het blok, en dát tikje
    // brengt je naar de kwalificatie. Zo blijft het bij twee tikken.
    case 'tempo':
      return { ...state, tempo: event.tempo };

    case 'blockers':
      return { ...state, blockers: event.blockers, step: 'quality' };

    case 'skipAttack':
      return { ...state, step: 'quality' };

    case 'zoneTo':
      // In de doelstap is dit het antwoord op de vraag; daarna volgt bij een
      // aanval nog het tempo en het blok. Elders (de landingszone bij een
      // gewone actie) blijft de stap staan.
      return {
        ...state,
        zoneTo: event.zone,
        step:
          state.step === 'target'
            ? state.type && needsAttackStep(state.type)
              ? 'attack'
              : 'quality'
            : state.step,
      };

    case 'skipZone':
      // Alleen toegestaan waar het protocol de zone niet verplicht stelt.
      if (state.type && requiresZoneFrom(state.type)) return state;
      return { ...state, step: nextAfterZone(state.type, state.team) };

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

/**
 * Vraagt de app bij deze actie waar de bal op hun helft terechtkwam?
 *
 * Bij onze eigen service en bij onze eigen aanval. Bij de service hangt het hele
 * serveeradvies eraan — 'serveer op positie 5' kan de app pas zeggen als hij
 * weet waar er geserveerd wérd — en hun pass wordt eraan vastgeknoopt.
 *
 * Bij de aanval is het de vraag die overblijft zodra je 'matig' aantikt: dat
 * zegt dat er niets uitkwam, maar niet waarheen ze sloeg. En juist dat is wat je
 * wilt weten, want een aanvalster die er drie keer achter elkaar in hetzelfde
 * blok in slaat heeft geen slechte dag maar een gewoonte.
 */
export function needsTargetStep(type: ActionType | null, team: TeamSide): boolean {
  return (type === 'serve' || type === 'attack') && team === 'us';
}

/**
 * Waar je heen gaat als de vertrekzone klaar is.
 *
 * Bij onze aanval eerst waarheen, dan tempo en blok: dat is de volgorde waarin
 * je het ziet gebeuren, en de richting is het stuk dat je meteen kwijt bent.
 */
function nextAfterZone(type: ActionType | null, team: TeamSide): EntryStep {
  if (needsTargetStep(type, team)) return 'target';
  if (type && needsAttackStep(type)) return 'attack';
  return 'quality';
}

function stepBack(state: EntryState): EntryState {
  switch (state.step) {
    case 'quality':
      if (state.type && needsAttackStep(state.type)) {
        return { ...state, tempo: null, blockers: null, step: 'attack' };
      }
      if (needsTargetStep(state.type, state.team)) {
        return { ...state, zoneTo: null, step: 'target' };
      }
      if (state.type && needsZoneStep(state.type)) {
        return { ...state, zoneFrom: null, zoneTo: null, step: 'zone' };
      }
      return { ...state, type: null, step: 'type' };
    case 'target':
      return { ...state, zoneFrom: null, zoneTo: null, step: 'zone' };
    case 'attack':
      if (needsTargetStep(state.type, state.team)) {
        return { ...state, zoneTo: null, tempo: null, blockers: null, step: 'target' };
      }
      return { ...state, zoneFrom: null, zoneTo: null, tempo: null, blockers: null, step: 'zone' };
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
  tempo: AttackTempo | null;
  blockers: BlockCount | null;
} | null {
  if (!isReadyToCommit(state)) return null;
  return {
    team: state.team,
    type: state.type,
    quality,
    playerId: state.playerId,
    zoneFrom: state.zoneFrom,
    zoneTo: state.zoneTo,
    // Tempo en blok horen alleen bij een aanval; bij de rest zou het ruis zijn.
    tempo: needsAttackStep(state.type) ? state.tempo : null,
    blockers: needsAttackStep(state.type) ? state.blockers : null,
  };
}
