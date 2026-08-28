/**
 * Datamodel van de trainingsapp.
 *
 * Structuur:
 *   Team -> Speler
 *   Oefening (bank)
 *   Training -> Blok -> verwijzing naar een oefening
 *   Reeks -> Trainingen over een periode
 *   Groep -> trainers die reeksen en oefeningen delen
 *
 * Uitgangspunten, gelijk aan de scouting-app in deze repo:
 * - Elk record heeft een UUID, zodat twee apparaten offline records kunnen
 *   aanmaken zonder op sleutels te botsen.
 * - Elk record draagt sync-metadata (`rev`, `updatedAt`, `deletedAt`), zodat
 *   samenvoegen deterministisch is (last-writer-wins op `rev`).
 * - Verwijderen is een tombstone: een verdwenen rij synchroniseert niet, een
 *   gemarkeerde wel.
 */

/** Wat er in een oefening getraind wordt; hierop kun je filteren. */
export type Goal =
  | 'serve' // service
  | 'pass' // pass (receptie)
  | 'set' // set-up
  | 'block' // blok
  | 'attack' // aanval
  | 'defense' // verdediging
  | 'conditioning' // conditie
  | 'positioning' // opstelling
  | 'tactics' // tactiek
  | 'technique'; // techniek

export const GOALS: readonly Goal[] = [
  'serve',
  'pass',
  'set',
  'block',
  'attack',
  'defense',
  'conditioning',
  'positioning',
  'tactics',
  'technique',
] as const;

export const GOAL_LABELS: Record<Goal, string> = {
  serve: 'Service',
  pass: 'Pass',
  set: 'Set-up',
  block: 'Blok',
  attack: 'Aanval',
  defense: 'Verdediging',
  conditioning: 'Conditie',
  positioning: 'Opstelling',
  tactics: 'Tactiek',
  technique: 'Techniek',
};

/** Positie van een speelster. Bepaalt of een oefening met deze groep kán. */
export type Position = 'setter' | 'outside' | 'middle' | 'opposite' | 'libero';

export const POSITIONS: readonly Position[] = [
  'setter',
  'outside',
  'middle',
  'opposite',
  'libero',
] as const;

export const POSITION_LABELS: Record<Position, string> = {
  setter: 'Spelverdeler',
  outside: 'Passer-loper',
  middle: 'Midden',
  opposite: 'Diagonaal',
  libero: 'Libero',
};

export const POSITION_SHORT: Record<Position, string> = {
  setter: 'SV',
  outside: 'PL',
  middle: 'MID',
  opposite: 'DIA',
  libero: 'LIB',
};

/** Wie mag dit record zien als het gesynchroniseerd wordt. */
export type Visibility = 'private' | 'group' | 'public';

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  private: 'Privé',
  group: 'Gedeeld met groep',
  public: 'Openbaar',
};

/** Sync-metadata die elk opgeslagen record draagt. */
export interface SyncMeta {
  /** Hybride logische klok; zie `src/domain/clock.ts`. */
  rev: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Wie het record maakte. Blijft staan als het bij een ander apparaat aankomt. */
export interface Authorship {
  authorId: string;
  authorName: string;
}

export interface Team extends SyncMeta, Authorship {
  id: string;
  name: string;
  season: string | null;
  notes: string | null;
}

export interface Player extends SyncMeta, Authorship {
  id: string;
  teamId: string;
  name: string;
  number: number | null;
  /** Meerdere posities mag: een passer-loper die ook diagonaal kan. */
  positions: Position[];
  /** Uit de selectie (geblesseerd, gestopt): telt niet mee bij aanwezigheid. */
  active: boolean;
  notes: string | null;
}

/**
 * Hoeveel deelnemers een oefening aankan, en in welke stappen.
 *
 * `step` is de kern van de schaalbaarheid: een oefening in drietallen heeft
 * step 3 en kan dus alleen met 3, 6, 9 ... spelers in één groep. Een oefening
 * die "vanaf 4" werkt heeft step 1 en schaalt vloeiend mee.
 *
 * `maxGroups` is de ruimte in de zaal: hoe vaak deze oefening naast elkaar kan
 * draaien. Eén veld met één net is vaak 1 of 2; oefeningen zonder net kunnen
 * vaker parallel.
 */
export interface GroupSpec {
  /** Kleinste werkbare groep. */
  min: number;
  /** Grootste werkbare groep. */
  max: number;
  /** Groepsgrootte moet een veelvoud hiervan zijn. 1 = elk aantal. */
  step: number;
  /** Hoe vaak deze oefening tegelijk kan draaien. */
  maxGroups: number;
  /** Posities die per groep nodig zijn, bijvoorbeeld één spelverdeler. */
  roles: RoleRequirement[];
}

export interface RoleRequirement {
  position: Position;
  count: number;
  /** Verplicht: zonder deze positie kan de oefening niet. Anders: voorkeur. */
  required: boolean;
}

/** Een variant van dezelfde oefening: zwaarder, lichter, of met meer spelers. */
export interface Variant {
  id: string;
  title: string;
  description: string;
  /** Wijkt de deelnemersvraag af, dan staat dat hier; anders die van de oefening. */
  group: GroupSpec | null;
}

/** Soort blok in een training. Bepaalt de volgorde en de kleur op het blad. */
export type BlockKind = 'warmup' | 'core' | 'game' | 'cooldown';

export const BLOCK_KINDS: readonly BlockKind[] = ['warmup', 'core', 'game', 'cooldown'] as const;

export const BLOCK_LABELS: Record<BlockKind, string> = {
  warmup: 'Warming-up',
  core: 'Kern',
  game: 'Wedstrijdvorm',
  cooldown: 'Afsluiting',
};

export interface Exercise extends SyncMeta, Authorship {
  id: string;
  title: string;
  /** Eén regel voor in de lijst. */
  summary: string;
  /** Volledige uitleg: opbouw, verloop, wat je wil zien. */
  description: string;
  goals: Goal[];
  /** 1 = beginners, 2 = gemiddeld, 3 = gevorderd. */
  level: 1 | 2 | 3;
  /** Richtduur in minuten; in een training aan te passen. */
  minutes: number;
  material: string[];
  group: GroupSpec;
  /** In welke delen van een training deze oefening past. Stuurt reeksen maken. */
  slots: BlockKind[];
  coachingPoints: string[];
  variants: Variant[];
  animation: Animation | null;
  visibility: Visibility;
  /** Groepen waarmee gedeeld wordt als `visibility` 'group' is. */
  groupIds: string[];
  /** Ingebouwde bankoefening: wel te kopiëren, niet te wijzigen. */
  builtIn: boolean;
  /** Van welke oefening dit een kopie is; leeg bij een eigen oefening. */
  copiedFromId: string | null;
}

export interface TrainingBlock {
  id: string;
  kind: BlockKind;
  /** Leeg bij een vrij blok (bijvoorbeeld 'inspelen'), anders de oefening. */
  exerciseId: string | null;
  /** Overschrijft de titel van de oefening; verplicht bij een vrij blok. */
  title: string | null;
  minutes: number;
  /** Gekozen variant van de oefening. */
  variantId: string | null;
  note: string | null;
}

export interface Training extends SyncMeta, Authorship {
  id: string;
  teamId: string | null;
  title: string;
  /** ISO-datum (YYYY-MM-DD). */
  date: string;
  /** HH:MM, mag leeg. */
  time: string | null;
  location: string | null;
  focus: string | null;
  blocks: TrainingBlock[];
  /** Speler-ids die aanwezig zijn. Leeg = nog niet afgevinkt. */
  attendance: string[];
  /** Speler-ids die zijn afgemeld; verschilt van 'nog niet afgevinkt'. */
  absent: string[];
  seriesId: string | null;
  visibility: Visibility;
  groupIds: string[];
  done: boolean;
  evaluation: string | null;
}

/** Accent van een periode binnen een reeks: waar de nadruk op ligt. */
export interface PeriodAccent {
  /** Aantal weken dat dit accent duurt. */
  weeks: number;
  label: string;
  goals: Goal[];
}

export interface Series extends SyncMeta, Authorship {
  id: string;
  name: string;
  teamId: string | null;
  startDate: string;
  endDate: string;
  /** 1 = maandag ... 7 = zondag, zoals ISO. */
  weekdays: number[];
  /** Standaardduur van een training in deze reeks. */
  minutes: number;
  accents: PeriodAccent[];
  trainingIds: string[];
  visibility: Visibility;
  groupIds: string[];
  notes: string | null;
}

export interface GroupMember {
  userId: string;
  name: string;
  joinedAt: string;
}

/**
 * Een groep trainers die reeksen en oefeningen deelt.
 *
 * De code is de sleutel: wie hem heeft, hoort erbij. De server bewaart hem niet
 * (alleen een hash ervan), net als bij de ploegcode van de scouting-app.
 */
export interface Group extends SyncMeta, Authorship {
  id: string;
  name: string;
  code: string;
  members: GroupMember[];
  notes: string | null;
}

/** Naam en id van deze trainer; staat als auteur op alles wat je maakt. */
export interface Profile {
  id: string;
  name: string;
}

// ---------- Animatie ----------

/** Een punt op het veld, in meters. Oorsprong linksonder van de eigen helft. */
export interface Point {
  x: number;
  y: number;
}

export type MarkerKind =
  | 'player'
  | 'opponent'
  | 'ball'
  | 'cone'
  | 'coach'
  | 'cart'
  /** Een plek op de vloer: een doelvak, een pion om omheen te lopen. */
  | 'target';

export interface Marker {
  id: string;
  kind: MarkerKind;
  /** Wat er in of naast het poppetje staat: 'SV', '1', 'P'. */
  label: string;
  /** Bij welke groepsdeelnemer dit poppetje hoort (1-based), voor de bezetting. */
  slot: number | null;
}

/** Lijn tussen twee punten in een fase: een pass, een aanval, een looplijn. */
export type PathKind = 'pass' | 'set' | 'attack' | 'serve' | 'run' | 'dribble';

export interface Path {
  markerId: string;
  to: Point;
  kind: PathKind;
  /** Hoogte van de boog; 0 is een rechte lijn. Een aanval boogt minder dan een set-up. */
  arc: number;
}

/**
 * Eén fase van de animatie: waar alles staat als de fase begint, en welke
 * verplaatsingen er in die fase gebeuren.
 */
export interface Phase {
  id: string;
  /** Wat er in deze fase gebeurt; staat onder de animatie. */
  caption: string;
  durationMs: number;
  /** Beginpositie per marker; markers die ontbreken houden hun vorige plek. */
  positions: Record<string, Point>;
  paths: Path[];
}

export interface Animation {
  markers: Marker[];
  phases: Phase[];
  /** Half veld (eigen kant) of heel veld. */
  view: 'half' | 'full';
  loop: boolean;
}

/** Alle stores die synchroniseren. */
export type EntityName =
  | 'teams'
  | 'players'
  | 'exercises'
  | 'trainings'
  | 'series'
  | 'groups';

export const ENTITIES: readonly EntityName[] = [
  'teams',
  'players',
  'exercises',
  'trainings',
  'series',
  'groups',
] as const;

/** Record zoals het in een store staat: altijd met id en sync-metadata. */
export interface StoredRecord extends SyncMeta {
  id: string;
}
