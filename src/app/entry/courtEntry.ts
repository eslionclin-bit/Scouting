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
import type { AppSettings, OpponentDetail } from '../../domain/settings';
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
  /**
   * Waar de bal naartoe ging: de zone op de helft van de tegenstander.
   *
   * Voorlopig alleen bij onze eigen service, en juist daar is het het meest
   * waard. 'Serveer op positie 5' is pas een advies als de app weet waar er
   * geserveerd wérd; wie daar stond volgt daarna uit hun rotatie, dus dat hoeft
   * niemand er apart bij te tikken.
   */
  target: Zone | null;
}

export type CourtEntryEvent =
  | { kind: 'select'; selection: CourtSelection }
  | { kind: 'type'; type: ActionType }
  | { kind: 'serveSpot'; zone: Zone }
  /** Doelzone op de helft van de tegenstander. */
  | { kind: 'target'; zone: Zone }
  | { kind: 'clear' }
  /** Nieuwe verwachting na een opgeslagen actie of een nieuwe rally. */
  | { kind: 'expect'; team: TeamSide; type: ActionType; selection?: CourtSelection | null };

export function initialCourtState(
  team: TeamSide = 'us',
  type: ActionType = 'serve',
  selection: CourtSelection | null = null,
): CourtEntryState {
  return { selection, type, expectedTeam: team, typeChosen: false, target: null };
}

/**
 * Betekent een tik op de helft van de tegenstander 'daar ging de bal naartoe'
 * in plaats van 'zij deden iets'?
 *
 * Bij onze eigen service en bij onze eigen aanval. Dat zijn de twee momenten
 * waarop wíj de bal hun kant op sturen, dus kan de tik daar niets anders
 * betekenen — en het zijn precies de twee waar de richting iets zegt. Bij een
 * service: waar je naartoe serveert. Bij een aanval: waar ze heen slaat, en dat
 * is de vraag die overblijft als een aanval matig was.
 */
export function targetsOpponent(state: CourtEntryState): boolean {
  return (
    (state.type === 'serve' || state.type === 'attack' || state.type === 'freeball') &&
    state.expectedTeam === 'us'
  );
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
  // Een vrije bal wordt aangenomen, niet verdedigd.
  freeball: 'reception',
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

    case 'target':
      return { ...state, target: event.zone };

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
 * Overslaan betekent hier alleen: niet vóórstellen. Kiezen kan altijd, en een
 * fout kan sowieso niet verdwijnen — die beëindigt de rally, dus hij wordt hoe
 * dan ook ingevoerd.
 *
 * Bij de tegenstander is dat overslaan geen zuinigheid maar een correctie. Hun
 * verdediging apart beoordelen vraagt twee keer hetzelfde: zeg je van onze
 * aanval dat hij de tegenstander in de problemen bracht, dan ís dat het oordeel
 * over hun verdediging. Precies zo met hun pass na onze service — alleen wordt
 * die niet weggelaten maar afgeleid (`domain/derive.ts`), want daar hangt de
 * tabel 'wie er slecht past' aan. Wat er te vrágen overblijft is wat op ons
 * afkomt: hun service en hun aanval.
 */
export function expectedNext(
  last: Pick<Action, 'team' | 'type' | 'quality'> | undefined,
  servingTeam: TeamSide,
  settings: Pick<AppSettings, 'askSetup' | 'opponentDetail'>,
): { team: TeamSide; type: ActionType } {
  if (!last) return { team: servingTeam, type: 'serve' };

  const suggestion = suggestNextAction(last);
  if (!suggestion) return { team: servingTeam, type: 'serve' };

  // Set-up overslaan: na de pass verwachten we meteen de aanval.
  if (suggestion.type === 'set' && suggestion.team === 'us' && !settings.askSetup) {
    return { team: 'us', type: 'attack' };
  }

  if (suggestion.team === 'them' && !asks(settings.opponentDetail, suggestion.type)) {
    // Alles wat we van hen overslaan loopt uit op hetzelfde: de eerstvolgende
    // bal die weer onze kant op komt.
    return { team: 'them', type: 'attack' };
  }

  return suggestion;
}

/**
 * Stelt de app deze actie van de tegenstander voor?
 *
 * Hun pass staat hier niet meer bij behalve op 'volledig'. Niet omdat hij niet
 * telt — hij telt juist, want daar staat wie er slecht past — maar omdat hij
 * niet gevraagd hoeft te worden: hij volgt uit de kwalificatie van onze eigen
 * service. Zie `domain/derive.ts`.
 */
function asks(detail: OpponentDetail, type: ActionType): boolean {
  if (detail === 'volledig') return true;
  // Alles wat van hun kant naar ons toe komt: hun service, hun aanval, en de
  // vrije bal die ze teruggeven. De rest gebeurt op hun helft en zegt ons niets
  // wat we niet al uit onze eigen kwalificatie halen.
  return type === 'serve' || type === 'attack' || type === 'freeball';
}

/**
 * Waar de invoer aan het begin van een rally op staat.
 *
 * Serveren wij, dan is dat onze service. Serveren zij, dan is het níet hun
 * service maar onze pass: wie er bij hen moet serveren staat al vast (dat is
 * hun zone 1, en daar mag niemand voor gewisseld worden), en hoe de service was
 * zegt onze passkwalificatie al. De app leidt hun service daaruit af in plaats
 * van er apart om te vragen — zie `domain/derive.ts`.
 *
 * Wie hun kant helemaal zelf wil invoeren zet dat om onder 'Van de
 * tegenstander'; dan blijft hun service gewoon de eerste vraag.
 */
export function expectAtServe(
  servingTeam: TeamSide,
  settings: Pick<AppSettings, 'opponentDetail'>,
): { team: TeamSide; type: ActionType } {
  if (servingTeam === 'us') return { team: 'us', type: 'serve' };
  return settings.opponentDetail === 'volledig'
    ? { team: 'them', type: 'serve' }
    : { team: 'us', type: 'reception' };
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
  zoneTo: Zone | null;
} | null {
  if (!state.selection) return null;
  return {
    team: state.selection.team,
    type: state.type,
    quality,
    playerId: state.selection.playerId,
    playerNumber: state.selection.playerNumber,
    zoneFrom: state.selection.zone,
    zoneTo: state.target,
  };
}
