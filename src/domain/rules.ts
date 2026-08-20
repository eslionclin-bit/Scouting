/**
 * Spelregels van het protocol, uitgedrukt als code.
 *
 * Doel is niet om de invoerder te betuttelen, maar om invoer die het protocol
 * tegenspreekt zichtbaar te maken vóór hij in de analyse belandt. Daarom kent
 * de validatie twee niveaus:
 *   - `error`   : dit mag niet opgeslagen worden (schendt het datamodel).
 *   - `warning` : dit kan kloppen, maar wijkt af van het protocol — laat het zien.
 */

import type { Action, ActionType, Quality, Rally, TeamSide } from './types';
import { ACTION_TYPES, QUALITIES } from './types';
import { isZone } from './zones';

export interface ValidationIssue {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  field?: keyof Action;
}

/** Actietypes waarbij de vertrekzone verplicht is (protocol, zonelogica). */
export const ZONE_FROM_REQUIRED: readonly ActionType[] = ['serve', 'attack'] as const;

export function requiresZoneFrom(type: ActionType): boolean {
  return ZONE_FROM_REQUIRED.includes(type);
}

/**
 * Actietypes die bij kwalificatie 'perfect' de rally direct beëindigen met een
 * punt voor het uitvoerende team. Een perfecte receptie of toets levert immers
 * geen punt op — die zetten alleen de volgende speler goed.
 */
const POINT_ON_PERFECT: readonly ActionType[] = ['serve', 'attack', 'block'] as const;

/**
 * Bepaalt of een actie de rally afsluit, en zo ja voor wie het punt is.
 *
 * - 'error'   : de rally eindigt altijd in het nadeel van het uitvoerende team.
 * - 'perfect' : bij opslag, aanval en block een direct punt voor dat team.
 * - anders    : de rally loopt door.
 *
 * De invoerder mag dit altijd overrulen bij het afronden van de rally; dit is
 * een voorstel, geen automatisme dat de waarheid overschrijft.
 */
export function rallyOutcomeFor(action: Pick<Action, 'type' | 'quality' | 'team'>): TeamSide | null {
  if (action.quality === 'error') return other(action.team);
  if (action.quality === 'perfect' && POINT_ON_PERFECT.includes(action.type)) return action.team;
  return null;
}

export function isTerminalAction(action: Pick<Action, 'type' | 'quality' | 'team'>): boolean {
  return rallyOutcomeFor(action) !== null;
}

export function other(side: TeamSide): TeamSide {
  return side === 'us' ? 'them' : 'us';
}

export interface ActionDraft {
  team: TeamSide;
  type: ActionType;
  quality: Quality;
  playerId?: string | null;
  playerNumber?: number | null;
  zoneFrom?: number | null;
  zoneTo?: number | null;
  videoTimestampMs?: number | null;
}

export interface ValidateActionContext {
  /** Acties die al in deze rally staan, op volgorde. */
  previousActions?: readonly Pick<Action, 'team' | 'type' | 'quality'>[];
  /** Bij het eigen team verwachten we een gekozen speler; bij de tegenstander niet. */
  requirePlayerForOwnTeam?: boolean;
}

/** Valideert één in te voeren actie tegen datamodel en protocol. */
export function validateAction(
  draft: ActionDraft,
  context: ValidateActionContext = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { previousActions = [], requirePlayerForOwnTeam = true } = context;

  if (!ACTION_TYPES.includes(draft.type)) {
    issues.push({ severity: 'error', code: 'unknown_action_type', field: 'type', message: `Onbekend actietype: ${String(draft.type)}.` });
  }
  if (!QUALITIES.includes(draft.quality)) {
    issues.push({ severity: 'error', code: 'unknown_quality', field: 'quality', message: `Onbekende kwalificatie: ${String(draft.quality)}.` });
  }

  if (requiresZoneFrom(draft.type) && draft.zoneFrom == null) {
    issues.push({
      severity: 'error',
      code: 'zone_from_required',
      field: 'zoneFrom',
      message: 'Vertrekzone is verplicht bij opslag en aanval.',
    });
  }
  for (const [field, value] of [
    ['zoneFrom', draft.zoneFrom],
    ['zoneTo', draft.zoneTo],
  ] as const) {
    if (value != null && !isZone(value)) {
      issues.push({ severity: 'error', code: 'invalid_zone', field, message: `Zone moet 1 t/m 6 zijn (kreeg ${String(value)}).` });
    }
  }

  if (requirePlayerForOwnTeam && draft.team === 'us' && draft.playerId == null) {
    issues.push({
      severity: 'error',
      code: 'player_required',
      field: 'playerId',
      message: 'Kies een speler voor een actie van het eigen team.',
    });
  }

  if (draft.playerNumber != null && (!Number.isInteger(draft.playerNumber) || draft.playerNumber < 0 || draft.playerNumber > 99)) {
    issues.push({ severity: 'error', code: 'invalid_player_number', field: 'playerNumber', message: 'Rugnummer moet tussen 0 en 99 liggen.' });
  }

  const last = previousActions.at(-1);
  if (last && isTerminalAction(last)) {
    issues.push({
      severity: 'error',
      code: 'rally_already_ended',
      message: 'De rally is al beëindigd door de vorige actie; rond de rally eerst af.',
    });
  }

  // Toewijzingsregel: een ace krijgt géén aparte receptie (protocol).
  if (draft.type === 'reception' && last?.type === 'serve' && last.quality === 'perfect') {
    issues.push({
      severity: 'warning',
      code: 'reception_after_ace',
      message:
        "Na een ace wordt geen aparte receptie geregistreerd. Was de bal wél haalbaar, zet de opslag dan op 'goed' of 'matig'.",
    });
  }

  if (draft.type === 'reception' && last && last.type !== 'serve') {
    issues.push({
      severity: 'warning',
      code: 'reception_without_serve',
      message: 'Een receptie volgt normaal op een opslag; bij een aanval hoort verdediging.',
    });
  }

  if (draft.type === 'serve' && previousActions.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'serve_not_first',
      message: 'Een opslag hoort de eerste actie van de rally te zijn.',
    });
  }

  if (draft.type === 'block' && last && last.team === draft.team) {
    issues.push({
      severity: 'warning',
      code: 'block_own_attack',
      message: 'Een block volgt op een aanval van de tegenpartij.',
    });
  }

  return issues;
}

export function hasBlockingIssue(issues: readonly ValidationIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

/** Validatie van een af te ronden rally. */
export function validateRallyCompletion(
  rally: Pick<Rally, 'wonBy'>,
  actions: readonly Pick<Action, 'team' | 'type' | 'quality'>[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (actions.length === 0) {
    issues.push({ severity: 'warning', code: 'rally_without_actions', message: 'Deze rally bevat geen acties.' });
    return issues;
  }
  const last = actions.at(-1);
  if (!last) return issues;
  const suggested = rallyOutcomeFor(last);
  if (suggested && rally.wonBy && suggested !== rally.wonBy) {
    issues.push({
      severity: 'warning',
      code: 'outcome_mismatch',
      message: `De laatste actie wijst op een punt voor ${suggested === 'us' ? 'wij' : 'de tegenstander'}.`,
    });
  }
  return issues;
}
