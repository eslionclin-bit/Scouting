/**
 * Datamodel van de scouting-app.
 *
 * Structuur (zie projectbrief §2):
 *   Wedstrijd -> Set (1-5) -> Rally -> Actie
 *
 * Ontwerpuitgangspunten:
 * - Elk record heeft een device-onafhankelijk UUID, zodat twee apparaten offline
 *   records kunnen aanmaken zonder ooit te botsen op sleutels.
 * - Elk record draagt sync-metadata (`rev`, `updatedAt`, `deletedAt`), zodat
 *   samenvoegen tussen apparaten deterministisch is (last-writer-wins op `rev`).
 * - Verwijderen gebeurt nooit hard: een tombstone (`deletedAt`) synchroniseert wél,
 *   een verdwenen rij niet. Undo van een actie is dus gewoon een tombstone.
 */

import type { ErrorReason } from './errors';
import type { MatchRules } from './scoring';
import type { TeamSide } from './teams';

export type { TeamSide };
export type { ErrorReason };

/** Actietypes uit het scoutingprotocol. */
export type ActionType =
  | 'serve' // service
  | 'reception' // pass (receptie)
  | 'set' // set-up (toets)
  | 'attack' // aanval
  | 'block' // blok
  | 'dig'; // verdediging

export const ACTION_TYPES: readonly ActionType[] = [
  'serve',
  'reception',
  'set',
  'attack',
  'block',
  'dig',
] as const;

/** Vierpuntsschaal. Volgorde loopt van beste naar slechtste gevolg. */
export type Quality = 'perfect' | 'good' | 'poor' | 'error';

export const QUALITIES: readonly Quality[] = ['perfect', 'good', 'poor', 'error'] as const;

/** Zone volgens standaard rotatienummering 1 t/m 6 (1 = rechtsachter bij opslag). */
export type Zone = 1 | 2 | 3 | 4 | 5 | 6;

export const ZONES: readonly Zone[] = [1, 2, 3, 4, 5, 6] as const;

/**
 * Rol van dit apparaat binnen een wedstrijd (projectbrief §6).
 *
 * - `scorer`    — hoofdinvoerder: voert in én bepaalt het verloop (rally's, sets).
 * - `assistant` — tweede invoerder: vult acties aan in de lopende rally.
 * - `viewer`    — leest mee, schrijft niets.
 */
export type DeviceRole = 'scorer' | 'assistant' | 'viewer';

/**
 * Sync-metadata die elk opgeslagen record draagt.
 *
 * `rev` is een hybride logische klok (zie domain/clock.ts): monotoon oplopend,
 * lexicografisch sorteerbaar en met device-id als tiebreak. Daarmee is
 * last-writer-wins deterministisch, ook als de klokken van twee tablets
 * uiteenlopen.
 */
export interface SyncMeta {
  /** Hybride logische klok van de laatste schrijfactie. */
  rev: string;
  /** Apparaat dat de laatste schrijfactie deed. */
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
  /** Tombstone: gezet betekent verwijderd, maar het record blijft synchroniseerbaar. */
  deletedAt: string | null;
}

export interface BaseRecord extends SyncMeta {
  id: string;
}

/** Team: zowel het eigen team als elke tegenstander (nodig voor het opponent-dossier). */
export interface Team extends BaseRecord {
  name: string;
  /** Precies één team in de database hoort het eigen team te zijn. */
  isOwnTeam: boolean;
  club?: string | null;
  level?: string | null;
  /** Ploeg uit ingelezen referentiemateriaal; hoort niet bij onze tegenstanders. */
  reference?: boolean;
}

/**
 * Rol in het team. Alleen de libero verandert het gedrag van de app: die
 * serveert niet en staat alleen achterin.
 */
export type PlayerRole = 'setter' | 'middle' | 'outside' | 'opposite' | 'libero';

export interface Player extends BaseRecord {
  teamId: string;
  /** Rugnummer; uniek binnen een team. */
  number: number;
  name: string;
  /**
   * De positie waar ze normaal staat. Blijft bestaan naast `roles`: de app moet
   * ergens één antwoord kunnen geven op 'wat is ze', en oudere opslag kent
   * alleen dit veld.
   */
  role?: PlayerRole | null;
  /**
   * Alle posities die ze kan spelen, inclusief de bovenstaande.
   *
   * Beschrijvend, niet voorschrijvend: het beperkt niet wat je kunt invoeren.
   * Het is er om te zien wie er inzetbaar is als er iemand uitvalt, en om te
   * begrijpen waarom iemands cijfers per positie verschillen — een middenspeler
   * die soms diagonaal speelt, doet dat met andere ballen.
   */
  roles?: PlayerRole[] | null;
  position?: string | null;
  active: boolean;
}

export type MatchStatus = 'planned' | 'live' | 'finished';

export interface Match extends BaseRecord {
  /** ISO-datum (YYYY-MM-DD) van de wedstrijd. */
  date: string;
  /**
   * Puntentelling van deze competitie. Ontbreekt het veld, dan gelden de
   * standaardregels uit `domain/scoring.ts` — zo blijven oudere wedstrijden
   * gewoon werken.
   */
  rules?: MatchRules | null;
  ownTeamId: string;
  opponentTeamId: string;
  homeAway: 'home' | 'away';
  location?: string | null;
  competition?: string | null;
  status: MatchStatus;
  notes?: string | null;
  /**
   * Referentiemateriaal: een ingelezen wedstrijd van andere ploegen, bedoeld om
   * onze cijfers tegen af te zetten. Zulke wedstrijden horen niet in de eigen
   * wedstrijdlijst en tellen niet mee in ons eigen gemiddelde — anders zou de
   * Bundesliga onze seizoenscijfers optillen.
   */
  reference?: boolean;
  /** Bestandsnaam waar deze wedstrijd uit komt, als hij is ingelezen. */
  source?: string | null;
}

export type SetStatus = 'pending' | 'live' | 'finished';

/** Eén set binnen een wedstrijd. Heet `MatchSet` omdat `Set` een JS-builtin is. */
export interface MatchSet extends BaseRecord {
  matchId: string;
  /** 1 t/m 5. */
  setNumber: number;
  pointsUs: number;
  pointsThem: number;
  status: SetStatus;
  /**
   * Wie begint met serveren in deze set.
   *
   * `null` zolang het nog niet bekend is: bij de toss weet je het vaak pas aan
   * het eind van de warming-up, en dan is een vast ingevulde waarde erger dan
   * een lege — die zou stilzwijgend de rotatie verschuiven.
   */
  startingServe: TeamSide | null;
}

export interface Rally extends BaseRecord {
  matchId: string;
  setId: string;
  /** Volgnummer binnen de set, oplopend vanaf 1. */
  sequence: number;
  servingTeam: TeamSide;
  /** null zolang de rally loopt. */
  wonBy: TeamSide | null;
  /** Stand ná deze rally; null zolang de rally loopt. */
  pointsUsAfter: number | null;
  pointsThemAfter: number | null;
  /** Rotatiestand van het eigen team (1-6) tijdens deze rally, indien bijgehouden. */
  rotationUs?: number | null;
  /**
   * Rotatiestand van de tegenstander (1-6).
   *
   * Volgt uit precies dezelfde telling als die van onszelf: zij draaien door
   * zodra zij een rally winnen waarin wij serveerden. Dat is de reden dat de app
   * na een servicefout kan zeggen wie van hen zo meteen serveert — zonder dat
   * iemand hun rotatie hoeft bij te houden.
   */
  rotationThem?: number | null;
  /**
   * Is deze rally echt ingevoerd, of alleen als punt bijgeteld?
   *
   * Tijdens een wedstrijd raakt een invoerder wel eens een rally kwijt — een bal
   * die te snel gaat, even niet opletten. Zo'n punt telt gewoon mee voor de
   * stand en voor de rotatie (anders loopt de app uit de pas met het veld), maar
   * er hangen geen acties aan. `false` maakt dat expliciet in plaats van het te
   * verzwijgen. Ontbreekt het veld, dan is de rally gewoon ingevoerd.
   */
  scouted?: boolean;
}

/**
 * Tempo van een aanval.
 *
 * Vier soorten, want dat is wat een invoerder tijdens een rally betrouwbaar ziet:
 * een hoge bal buitenom, een snelle bal in het midden, een bal vanaf de
 * achterlijn, en de rest (prikballen, noodoplossingen, tweede bal van de
 * spelverdeler).
 */
export type AttackTempo = 'high' | 'quick' | 'back' | 'other';

export const ATTACK_TEMPOS: readonly AttackTempo[] = ['high', 'quick', 'back', 'other'] as const;

/** Aantal blokkeerders tegenover een aanval. */
export type BlockCount = 0 | 1 | 2 | 3;

export const BLOCK_COUNTS: readonly BlockCount[] = [0, 1, 2, 3] as const;

export interface Action extends BaseRecord {
  matchId: string;
  setId: string;
  rallyId: string;
  /** Volgnummer binnen de rally, oplopend vanaf 1. */
  sequence: number;
  team: TeamSide;
  /** Speler aan wie de actie wordt toegewezen (toewijzingsregel uit het protocol). */
  playerId: string | null;
  /** Rugnummer als los veld: bij de tegenstander ken je vaak wel het nummer, niet de speler. */
  playerNumber: number | null;
  type: ActionType;
  /** Vertrekzone: verplicht bij opslag en aanval. */
  zoneFrom: Zone | null;
  /** Landingszone: altijd optioneel. */
  zoneTo: Zone | null;
  quality: Quality;
  /**
   * Tempo van de aanval. Alleen bij een aanval, en altijd optioneel: liever een
   * aanval zonder tempo dan een invoerder die achterloopt op het spel.
   */
  tempo?: AttackTempo | null;
  /**
   * Hoeveel blokkeerders er tegenover stonden. Dit is wat een laag
   * aanvalsrendement verklaart: tegen een enkel blok hoort het dubbele te
   * scoren van tegen een dubbel blok.
   */
  blockers?: BlockCount | null;
  /**
   * Waarom de bal verloren ging. Alleen bij een fout, en altijd optioneel: hij
   * wordt gevraagd nadat de actie al is opgeslagen.
   */
  errorReason?: ErrorReason | null;
  /** Alleen relevant bij invoer tijdens video-terugkijken. */
  videoTimestampMs?: number | null;
  /**
   * Heeft niemand deze actie ingevoerd, maar heeft de app hem afgeleid?
   *
   * Zo is de pass van de tegenstander het spiegelbeeld van onze
   * servicekwalificatie (zie `derive.ts`). Dat scheelt de invoerder de halve
   * rally, maar het blijft een gevolgtrekking en geen waarneming — en dat hoort
   * zichtbaar te zijn overal waar het cijfer opduikt.
   */
  derived?: boolean;
}

/**
 * Startopstelling van een set: welke speler staat bij aanvang in welke zone.
 * Vanaf hier is elke latere rotatiestand te berekenen, dus dit is het enige wat
 * bijgehouden hoeft te worden.
 */
export interface Lineup extends BaseRecord {
  matchId: string;
  setId: string;
  team: TeamSide;
  /** Speler-id per zone 1 t/m 6; null als de plek (nog) niet is ingevuld. */
  positions: Record<Zone, string | null>;
  /**
   * De libero van deze set. Die staat niet in de zes: hij vervangt een
   * achterspeler zonder dat het een wissel is, en gaat er weer uit zodra die
   * speler naar voren draait of moet serveren.
   */
  liberoId?: string | null;
  /**
   * Voor wie de libero erin komt.
   *
   * De regel laat elke achterspeler toe; in de praktijk is het de
   * middenspeelster, en dan pas ná haar serviceserie. Meestal kan de app dat
   * zelf uitrekenen — er staat één middenspeelster achterin — maar bij een
   * speelster die meerdere posities speelt, of bij twee middens achterin, is
   * dat raden. Dan telt wat hier staat.
   */
  liberoForId?: string | null;
}

/** Wissel: vanaf de genoemde rally staat de invaller in het veld. */
export interface Substitution extends BaseRecord {
  matchId: string;
  setId: string;
  rallyId: string;
  team: TeamSide;
  playerOutId: string;
  playerInId: string;
}

/** Alle entiteiten die in de lokale database staan en meesynchroniseren. */
export type Entity = Team | Player | Match | MatchSet | Rally | Action | Lineup | Substitution;

export type EntityName =
  | 'teams'
  | 'players'
  | 'matches'
  | 'sets'
  | 'rallies'
  | 'actions'
  | 'lineups'
  | 'substitutions';

/** Dezelfde namen als lijst, voor als je ze allemaal langs moet. */
export const ENTITY_NAMES: readonly EntityName[] = [
  'teams',
  'players',
  'matches',
  'sets',
  'rallies',
  'actions',
  'lineups',
  'substitutions',
] as const;

export interface EntityMap {
  teams: Team;
  players: Player;
  matches: Match;
  sets: MatchSet;
  rallies: Rally;
  actions: Action;
  lineups: Lineup;
  substitutions: Substitution;
}
