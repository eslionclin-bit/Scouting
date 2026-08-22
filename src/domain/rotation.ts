/**
 * Rotatie- en wisselbeheer.
 *
 * De projectbrief noemt als reden om dit in de app te doen: voorkomen dat er
 * twee systemen naast elkaar bestaan (rotatie op papier, acties in de app). Het
 * model houdt daarom alleen de startopstelling en de wissels bij; elke
 * rotatiestand daarna is te berékenen. Zo kan er niets uit de pas lopen.
 */

import type { Lineup, PlayerRole, Rally, Substitution, TeamSide, Zone } from './types';
import { ZONES } from './types';

/** Een team draait door zodra het een rally wint waarin de tegenstander serveerde. */
export function rotationsAfter(
  rallies: readonly Pick<Rally, 'wonBy'>[],
  startingServe: TeamSide,
  team: TeamSide,
): number {
  let serving = startingServe;
  let rotations = 0;
  for (const rally of rallies) {
    if (rally.wonBy === null) continue;
    if (rally.wonBy !== serving && rally.wonBy === team) rotations++;
    serving = rally.wonBy;
  }
  return rotations;
}

/**
 * Rotatiestand waarin een team aan een rally begint, als 1 t/m 6.
 * R1 is de startopstelling van de set.
 */
export function rotationForNextRally(
  previousRallies: readonly Pick<Rally, 'wonBy'>[],
  startingServe: TeamSide,
  team: TeamSide = 'us',
): number {
  return (rotationsAfter(previousRallies, startingServe, team) % 6) + 1;
}

/** Zone waar de speler uit deze zone na één keer doordraaien vandaan komt. */
const NEXT_ZONE: Record<Zone, Zone> = { 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 1 };

/**
 * Draait de opstelling met de klok mee: wie in zone 2 stond, staat na één
 * rotatie in zone 1 en serveert.
 *
 * Generiek in wat er per zone staat, want bij de tegenstander is dat een
 * rugnummer en bij onszelf een speler-id. Een negatief aantal draait terug —
 * dat is hoe een opstelling die je halverwege de set invult wordt teruggerekend
 * naar het begin.
 */
export function rotatePositions<T>(
  positions: Record<Zone, T>,
  times: number,
): Record<Zone, T> {
  const steps = ((times % 6) + 6) % 6;
  let current = { ...positions };
  for (let i = 0; i < steps; i++) {
    const next = {} as Record<Zone, T>;
    for (const zone of ZONES) next[zone] = current[NEXT_ZONE[zone]];
    current = next;
  }
  return current;
}

/**
 * Wie staat waar, gegeven de startopstelling, de rotatiestand en de wissels die
 * tot dan toe zijn gedaan. Een wissel is een vervanging op dezelfde plek; een
 * terugwissel is gewoon de omgekeerde vervanging.
 */
export function positionsAt(
  lineup: Pick<Lineup, 'positions'>,
  rotation: number,
  substitutions: readonly Pick<Substitution, 'playerInId' | 'playerOutId'>[] = [],
): Record<Zone, string | null> {
  const rotated = rotatePositions(lineup.positions, rotation - 1);
  for (const substitution of substitutions) {
    for (const zone of ZONES) {
      if (rotated[zone] === substitution.playerOutId) rotated[zone] = substitution.playerInId;
    }
  }
  return rotated;
}

/** De speler die in deze stand serveert (zone 1). */
export function serverAt(
  lineup: Pick<Lineup, 'positions'>,
  rotation: number,
  substitutions: readonly Pick<Substitution, 'playerInId' | 'playerOutId'>[] = [],
): string | null {
  return positionsAt(lineup, rotation, substitutions)[1];
}

/** Achterste zones, waar een libero mag staan. Zone 1 hoort daar ook bij, maar
 * daar wordt geserveerd — en dat mag een libero niet. */
const LIBERO_ZONES: readonly Zone[] = [5, 6] as const;

export interface CourtOptions {
  /** De libero van deze set, als die er is. */
  liberoId?: string | null;
  /** Voor wie de libero erin komt; overruled de afleiding hieronder. */
  liberoForId?: string | null;
  /**
   * Welke posities een speler kan spelen. Meervoud, want dat is bij een
   * amateurploeg de normale situatie: wie én midden én diagonaal speelt, komt
   * hier met allebei terug.
   */
  rolesOf?: (playerId: string) => readonly PlayerRole[];
  /** Kortere weg voor wie maar één positie kent. */
  roleOf?: (playerId: string) => PlayerRole | null | undefined;
}

export interface CourtPositions {
  positions: Record<Zone, string | null>;
  /** De speler die door de libero is vervangen, als dat gebeurd is. */
  replaced: string | null;
}

/**
 * Wie er echt in het veld staat, inclusief de libero.
 *
 * De regel laat de libero voor elke achterspeler invallen. In de praktijk is dat
 * de middenspeelster, en pas ná haar serviceserie — vandaar dat hier alleen zone
 * 5 en 6 meedoen en zone 1 niet: daar wordt geserveerd, en een libero serveert
 * niet.
 *
 * Wie het is, in deze volgorde:
 *
 *  1. **Wat er is vastgelegd** (`liberoForId`). Dat gaat altijd voor.
 *  2. **De enige middenspeelster achterin.** Staan er twee, of is het een
 *     speelster die naast midden ook iets anders speelt en is er verder geen
 *     uitsluitsel, dan is het raden — en dan verandert de app niets. Liever een
 *     opstelling die klopt met wat je ziet dan een die gokt.
 */
export function courtPositions(
  lineup: Pick<Lineup, 'positions' | 'liberoId' | 'liberoForId'>,
  rotation: number,
  substitutions: readonly Pick<Substitution, 'playerInId' | 'playerOutId'>[] = [],
  options: CourtOptions = {},
): CourtPositions {
  const positions = positionsAt(lineup, rotation, substitutions);
  const liberoId = options.liberoId ?? lineup.liberoId ?? null;
  if (!liberoId) return { positions, replaced: null };

  const forId = options.liberoForId ?? lineup.liberoForId ?? null;
  if (forId) {
    for (const zone of LIBERO_ZONES) {
      if (positions[zone] !== forId) continue;
      return { positions: { ...positions, [zone]: liberoId }, replaced: forId };
    }
    return { positions, replaced: null };
  }

  const roles = options.rolesOf ?? (options.roleOf ? toRoles(options.roleOf) : null);
  if (!roles) return { positions, replaced: null };

  const middles = LIBERO_ZONES.filter((zone) => {
    const playerId = positions[zone];
    return playerId !== null && playerId !== liberoId && roles(playerId).includes('middle');
  });
  // Twee middens achterin: niet te zeggen wie eruit gaat, dus niets veranderen.
  if (middles.length !== 1) return { positions, replaced: null };

  const zone = middles[0]!;
  const playerId = positions[zone]!;
  return { positions: { ...positions, [zone]: liberoId }, replaced: playerId };
}

function toRoles(
  roleOf: (playerId: string) => PlayerRole | null | undefined,
): (playerId: string) => readonly PlayerRole[] {
  return (playerId) => {
    const role = roleOf(playerId);
    return role ? [role] : [];
  };
}

export function emptyPositions(): Record<Zone, string | null> {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
}

/** Spelers die volgens de opstelling in het veld staan. */
export function playersOnCourt(positions: Record<Zone, string | null>): string[] {
  return ZONES.map((zone) => positions[zone]).filter((id): id is string => id !== null);
}
