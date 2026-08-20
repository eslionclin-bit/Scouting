/**
 * Analyse begint met platslaan: van de geneste wedstrijd naar één rij per actie,
 * met de context (set, rally, rotatie) erbij. Elke berekening in het dashboard
 * werkt daarna op dezelfde rijen, en filteren is een `Array.filter`.
 */

import type { MatchBundle } from '../db/bundle';
import type { Action, ActionType, Rally, TeamSide } from '../domain/types';

export interface ActionRow {
  action: Action;
  rally: Rally;
  setId: string;
  setNumber: number;
  /** Rotatiestand van het eigen team tijdens deze rally (1-6). */
  rotation: number | null;
}

export interface RallyRow {
  rally: Rally;
  setId: string;
  setNumber: number;
  rotation: number | null;
}

export interface AnalysisFilter {
  setId?: string | null;
  playerId?: string | null;
  team?: TeamSide | null;
  rotation?: number | null;
  type?: ActionType | null;
}

export function toActionRows(bundle: MatchBundle): ActionRow[] {
  const rows: ActionRow[] = [];
  for (const setBundle of bundle.sets) {
    for (const rallyBundle of setBundle.rallies) {
      for (const action of rallyBundle.actions) {
        rows.push({
          action,
          rally: rallyBundle.rally,
          setId: setBundle.set.id,
          setNumber: setBundle.set.setNumber,
          rotation: rallyBundle.rally.rotationUs ?? null,
        });
      }
    }
  }
  return rows;
}

export function toRallyRows(bundle: MatchBundle): RallyRow[] {
  return bundle.sets.flatMap((setBundle) =>
    setBundle.rallies.map((rallyBundle) => ({
      rally: rallyBundle.rally,
      setId: setBundle.set.id,
      setNumber: setBundle.set.setNumber,
      rotation: rallyBundle.rally.rotationUs ?? null,
    })),
  );
}

export function filterActions(rows: readonly ActionRow[], filter: AnalysisFilter): ActionRow[] {
  return rows.filter((row) => {
    if (filter.setId && row.setId !== filter.setId) return false;
    if (filter.team && row.action.team !== filter.team) return false;
    if (filter.playerId && row.action.playerId !== filter.playerId) return false;
    if (filter.type && row.action.type !== filter.type) return false;
    if (filter.rotation != null && row.rotation !== filter.rotation) return false;
    return true;
  });
}

export function filterRallies(rows: readonly RallyRow[], filter: AnalysisFilter): RallyRow[] {
  return rows.filter((row) => {
    if (filter.setId && row.setId !== filter.setId) return false;
    if (filter.rotation != null && row.rotation !== filter.rotation) return false;
    return true;
  });
}
