/**
 * JSON-export: het canonieke, open formaat.
 *
 * Codes blijven hier in hun oorspronkelijke vorm ('attack', 'poor'), zodat een
 * import of een extern script niets hoeft te raden. De Nederlandse labels staan
 * in het protocol-bestand en zijn daaruit af te leiden.
 */

import { PROTOCOL_VERSION } from '../domain/protocol';
import type { MatchBundle } from '../db/bundle';

export const EXPORT_FORMAT_VERSION = 1;

export interface MatchExport {
  format: 'volley-scouting-match';
  formatVersion: number;
  protocolVersion: string;
  exportedAt: string;
  match: MatchBundle['match'];
  teams: { own: MatchBundle['ownTeam']; opponent: MatchBundle['opponent'] };
  players: MatchBundle['players'];
  sets: MatchBundle['sets'];
}

export function toMatchExport(bundle: MatchBundle, exportedAt = new Date()): MatchExport {
  return {
    format: 'volley-scouting-match',
    formatVersion: EXPORT_FORMAT_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    exportedAt: exportedAt.toISOString(),
    match: bundle.match,
    teams: { own: bundle.ownTeam, opponent: bundle.opponent },
    players: bundle.players,
    sets: bundle.sets,
  };
}

export function toMatchJson(bundle: MatchBundle, exportedAt = new Date()): string {
  return JSON.stringify(toMatchExport(bundle, exportedAt), null, 2);
}
