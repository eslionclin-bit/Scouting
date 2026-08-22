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
 */
export function rotatePositions(
  positions: Record<Zone, string | null>,
  times: number,
): Record<Zone, string | null> {
  const steps = ((times % 6) + 6) % 6;
  let current = { ...positions };
  for (let i = 0; i < steps; i++) {
    const next = {} as Record<Zone, string | null>;
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
  /** Rol per speler, om te bepalen wie de libero vervangt. */
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
 * De libero komt in voor de middenspeler zodra die achterin staat (zone 5 of 6),
 * en gaat eruit als diezelfde speler naar zone 1 draait — daar wordt geserveerd,
 * en een libero serveert niet. Is er geen rol bekend, dan blijft de opstelling
 * zoals hij is: liever niets veranderen dan gokken.
 */
export function courtPositions(
  lineup: Pick<Lineup, 'positions' | 'liberoId'>,
  rotation: number,
  substitutions: readonly Pick<Substitution, 'playerInId' | 'playerOutId'>[] = [],
  options: CourtOptions = {},
): CourtPositions {
  const positions = positionsAt(lineup, rotation, substitutions);
  const liberoId = options.liberoId ?? lineup.liberoId ?? null;
  if (!liberoId || !options.roleOf) return { positions, replaced: null };

  for (const zone of LIBERO_ZONES) {
    const playerId = positions[zone];
    if (!playerId || playerId === liberoId) continue;
    if (options.roleOf(playerId) !== 'middle') continue;

    return { positions: { ...positions, [zone]: liberoId }, replaced: playerId };
  }

  return { positions, replaced: null };
}

export function emptyPositions(): Record<Zone, string | null> {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };
}

/** Spelers die volgens de opstelling in het veld staan. */
export function playersOnCourt(positions: Record<Zone, string | null>): string[] {
  return ZONES.map((zone) => positions[zone]).filter((id): id is string => id !== null);
}
