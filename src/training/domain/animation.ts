/**
 * Animatiemodel voor oefeningen.
 *
 * Een animatie is een rij fases. Elke fase zegt waar de poppetjes en de bal
 * staan als de fase begint, en welke verplaatsingen er in die fase gebeuren.
 * Wat een fase niet noemt, blijft staan waar het stond — zo hoef je bij een
 * oefening van zes fases niet zes keer alle posities in te tikken.
 *
 * De tijd zit in het model, niet in CSS: dan kan het scherm de animatie
 * afspelen, stap voor stap tonen, of er een stilstaand plaatje van maken voor
 * op papier, en gebruikt alles hetzelfde rekenwerk.
 *
 * Coördinaten zijn meters op een volleybalveld: x van 0 (linkerzijlijn) tot 9,
 * y van 0 (achterlijn eigen helft) tot 18 (achterlijn overkant). Het net ligt op
 * y = 9. Buiten het veld mag: de serviceplek ligt op y = -1,5.
 */

import type { Animation, Marker, Path, Phase, Point } from './types';

export const COURT_WIDTH = 9;
export const COURT_LENGTH = 18;
export const NET_Y = 9;
export const ATTACK_LINE = 3;

/** Hoe lang de hele animatie duurt. */
export function totalDuration(animation: Animation): number {
  return animation.phases.reduce((sum, phase) => sum + Math.max(0, phase.durationMs), 0);
}

/** Waar alles staat aan het begin van elke fase, met overerving van de vorige. */
export function phaseStarts(animation: Animation): Record<string, Point>[] {
  const starts: Record<string, Point>[] = [];
  let current: Record<string, Point> = {};
  for (const phase of animation.phases) {
    current = { ...current, ...phase.positions };
    starts.push(current);
    current = endOf(current, phase);
  }
  return starts;
}

/** Waar alles staat aan het eind van een fase: beginpositie plus de paden. */
function endOf(start: Record<string, Point>, phase: Phase): Record<string, Point> {
  const end = { ...start };
  for (const path of phase.paths) end[path.markerId] = path.to;
  return end;
}

export interface Frame {
  /** Fase die op dit moment loopt. */
  phaseIndex: number;
  /** 0 aan het begin van die fase, 1 aan het eind. */
  progress: number;
  positions: Record<string, Point>;
  caption: string;
}

/**
 * Waar alles staat op tijdstip `timeMs`.
 *
 * Poppetjes lopen met een zachte in- en uitloop (een speler zet niet ineens
 * aan), de bal gaat gelijkmatig en volgt zijn boog: een set-up boogt hoog, een
 * aanval nauwelijks.
 */
export function frameAt(animation: Animation, timeMs: number): Frame {
  const starts = phaseStarts(animation);
  const total = totalDuration(animation);
  const time = animation.loop && total > 0 ? ((timeMs % total) + total) % total : clamp(timeMs, 0, total);

  let elapsed = 0;
  for (let index = 0; index < animation.phases.length; index++) {
    const phase = animation.phases[index] as Phase;
    const duration = Math.max(1, phase.durationMs);
    if (time <= elapsed + duration || index === animation.phases.length - 1) {
      const progress = clamp((time - elapsed) / duration, 0, 1);
      return {
        phaseIndex: index,
        progress,
        caption: phase.caption,
        positions: interpolate(starts[index] ?? {}, phase, progress, animation.markers),
      };
    }
    elapsed += duration;
  }

  return { phaseIndex: 0, progress: 0, caption: '', positions: starts[0] ?? {} };
}

function interpolate(
  start: Record<string, Point>,
  phase: Phase,
  progress: number,
  markers: readonly Marker[],
): Record<string, Point> {
  const positions: Record<string, Point> = { ...start };
  for (const path of phase.paths) {
    const from = start[path.markerId];
    if (!from) continue;
    const marker = markers.find((m) => m.id === path.markerId);
    const eased = marker?.kind === 'ball' ? progress : easeInOut(progress);
    positions[path.markerId] = pointOn(from, path, eased);
  }
  return positions;
}

/** Punt op het pad; met een boog is dat een kwadratische bézier. */
export function pointOn(from: Point, path: Path, t: number): Point {
  if (!path.arc) {
    return { x: lerp(from.x, path.to.x, t), y: lerp(from.y, path.to.y, t) };
  }
  const dx = path.to.x - from.x;
  const dy = path.to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  // Loodrecht op de lijn, zodat de boog altijd dezelfde kant op staat.
  const control = {
    x: (from.x + path.to.x) / 2 - (dy / length) * path.arc,
    y: (from.y + path.to.y) / 2 + (dx / length) * path.arc,
  };
  const inv = 1 - t;
  return {
    x: inv * inv * from.x + 2 * inv * t * control.x + t * t * path.to.x,
    y: inv * inv * from.y + 2 * inv * t * control.y + t * t * path.to.y,
  };
}

/** Punten langs een pad, om er een lijn van te tekenen (ook voor op papier). */
export function pathPoints(from: Point, path: Path, steps = 16): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => pointOn(from, path, i / steps));
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Lege animatie om mee te beginnen in de bewerker. */
export function emptyAnimation(view: Animation['view'] = 'half'): Animation {
  return { markers: [], phases: [], view, loop: true };
}

/**
 * Verplaats een marker binnen het veld plus een halve meter uitloop, zodat je
 * hem bij het slepen niet kwijtraakt achter de rand van het scherm.
 */
export function clampToField(point: Point, view: Animation['view']): Point {
  const maxY = view === 'half' ? NET_Y + 1 : COURT_LENGTH + 3;
  return {
    x: clamp(round(point.x), -3, COURT_WIDTH + 3),
    y: clamp(round(point.y), -3, maxY),
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Alleen de markers die op dit moment in beeld horen te zijn. */
export function visibleMarkers(animation: Animation, positions: Record<string, Point>): Marker[] {
  return animation.markers.filter((marker) => positions[marker.id] !== undefined);
}
