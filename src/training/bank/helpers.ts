/**
 * Korte schrijfwijze voor de ingebouwde oefeningen.
 *
 * Een oefening met animatie is veel tekst, en het meeste daarvan is altijd
 * hetzelfde. Deze hulpjes halen dat weg, zodat in `builtin.ts` blijft staan wat
 * de oefening ís: waar de spelers staan, waar de bal heen gaat, en wat je wil
 * zien.
 */

import { PATH_ARC } from '../domain/animation';
import type {
  Animation,
  Exercise,
  GroupSpec,
  Marker,
  MarkerKind,
  Path,
  PathKind,
  Phase,
  Point,
} from '../domain/types';

export function at(x: number, y: number): Point {
  return { x, y };
}

export function marker(id: string, kind: MarkerKind, label = '', slot: number | null = null): Marker {
  return { id, kind, label, slot };
}

export function move(markerId: string, to: Point, kind: PathKind = 'run', arc = 0): Path {
  return { markerId, to, kind, arc };
}

/** Een bal boogt: een set-up hoog, een pass wat minder, een aanval nauwelijks. */
export function ball(markerId: string, to: Point, kind: PathKind = 'pass'): Path {
  return { markerId, to, kind, arc: PATH_ARC[kind] };
}

export function phase(
  id: string,
  caption: string,
  durationMs: number,
  positions: Record<string, Point>,
  paths: Path[] = [],
): Phase {
  return { id, caption, durationMs, positions, paths };
}

export function animation(
  markers: Marker[],
  phases: Phase[],
  view: Animation['view'] = 'half',
): Animation {
  return { markers, phases, view, loop: true };
}

export function group(partial: Partial<GroupSpec>): GroupSpec {
  return { min: 4, max: 12, step: 1, maxGroups: 1, roles: [], ...partial };
}

/** Alles wat elke ingebouwde oefening gemeen heeft. */
export function builtIn(
  input: Omit<
    Exercise,
    'rev' | 'updatedAt' | 'deletedAt' | 'authorId' | 'authorName' | 'visibility' | 'groupIds' | 'builtIn' | 'copiedFromId'
  >,
): Exercise {
  return {
    ...input,
    // Ingebouwde oefeningen staan in de app zelf en gaan nooit de deur uit:
    // ze zijn bij iedereen al aanwezig. Wil je er iets mee delen, dan maak je
    // er een kopie van — die is dan van jou, met jouw naam erop.
    visibility: 'private',
    groupIds: [],
    builtIn: true,
    copiedFromId: null,
    rev: 'ingebouwd',
    updatedAt: '2026-01-01T00:00:00.000Z',
    deletedAt: null,
    authorId: 'ingebouwd',
    authorName: 'Oefeningenbank',
  };
}
