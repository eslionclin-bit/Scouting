/**
 * Publieke ingang van de opslag- en datalaag.
 *
 * De UI die hierop komt (rally-invoer, dashboard, opponent-dossier) hoort alleen
 * dit bestand te importeren, nooit iets uit `db/` of `sync/` rechtstreeks.
 */

export { ScoutingStore, type StoreOptions } from './db/store';
export { loadMatchBundle, type MatchBundle, type SetBundle, type RallyBundle } from './db/bundle';
export { deleteScoutingDb } from './db/database';
export { DB_NAME, DB_VERSION, META_KEYS } from './db/schema';
export { NotFoundError, ValidationError } from './db/repositories/base';

export * from './domain/types';
export { newId, getDeviceId, setDeviceId } from './domain/ids';
export { compareRev, HybridClock } from './domain/clock';
export {
  ACTION_TYPE_LABELS,
  GENERAL_PRINCIPLES,
  PROTOCOL_CRITERIA,
  PROTOCOL_RULES,
  PROTOCOL_VERSION,
  QUALITY_COLORS,
  QUALITY_LABELS,
  QUALITY_SCORE,
  TEAM_SIDE_LABELS,
  criterionFor,
  tooltipFor,
  type ActionCriteria,
  type QualityCriterion,
} from './domain/protocol';
export {
  isTerminalAction,
  rallyOutcomeFor,
  requiresZoneFrom,
  validateAction,
  validateRallyCompletion,
  hasBlockingIssue,
  type ActionDraft,
  type ValidationIssue,
} from './domain/rules';
export { COURT_GRID, ZONE_LABELS, emptyZoneTally, isZone, toZone } from './domain/zones';
export {
  emptyPositions,
  playersOnCourt,
  positionsAt,
  rotatePositions,
  rotationForNextRally,
  rotationsAfter,
  serverAt,
} from './domain/rotation';

export * from './analysis';

export { SyncEngine, type SyncEngineOptions } from './sync/engine';
export { LoopbackHub } from './sync/loopback';
export { compactOutbox, pendingCount } from './sync/outbox';
export type { ChangeEnvelope, SyncState, SyncStatus, SyncTransport } from './sync/types';

export { toMatchCsv, CSV_COLUMNS } from './export/csv';
export { toMatchExport, toMatchJson, EXPORT_FORMAT_VERSION, type MatchExport } from './export/json';
