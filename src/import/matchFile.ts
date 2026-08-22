/**
 * Een geëxporteerde wedstrijd weer inlezen.
 *
 * Dit is de tegenhanger van `export/json.ts` en tegelijk de enige manier om een
 * wedstrijd van het ene apparaat naar het andere te krijgen zonder dat beide
 * apparaten tegelijk aan staan: de invoerder exporteert, stuurt het bestand door
 * (mail, AirDrop, WhatsApp, USB — dat maakt niet uit) en de ander leest het in.
 *
 * Twee dingen maken dat veilig, en ze zijn allebei geleend van de sync:
 *
 *  1. **De id's blijven staan.** Elk record heeft een uuid dat op het apparaat
 *     van herkomst is gemaakt. Hetzelfde bestand twee keer inlezen levert dus
 *     geen tweede wedstrijd op, maar precies dezelfde records nog een keer.
 *  2. **De revisie beslist.** Inlezen loopt langs `applyRemote`, dezelfde weg
 *     als een wijziging die over de netwerkkoppeling binnenkomt. Wie lokaal al
 *     een nieuwere versie van een record heeft, houdt die — een oud bestand kan
 *     verse invoer niet overschrijven.
 *
 * Wat het niet doet: ploegen samenvoegen. Heeft dit apparaat een eigen team
 * aangemaakt en het andere apparaat ook, dan zijn dat twee ploegen met twee
 * id's, en dat blijven het er twee. Samenvoegen op naam raadt, en raden hoort
 * niet thuis in iets dat data wegschrijft.
 */

import type { BaseRecord, EntityName } from '../domain/types';
import type { ChangeEnvelope } from '../sync/types';
import { EXPORT_FORMAT_VERSION, type MatchExport } from '../export/json';

export class MatchFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MatchFileError';
  }
}

export interface MatchFileContents {
  file: MatchExport;
  changes: ChangeEnvelope[];
}

/**
 * Leest de tekst en controleert dat het om een wedstrijdbestand van deze app
 * gaat. Een csv-export, een .dvw of een willekeurig json-bestand hoort hier een
 * begrijpelijke melding op te leveren, geen stacktrace.
 */
export function parseMatchFile(text: string): MatchExport {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new MatchFileError('Dit is geen JSON-bestand. Kies een wedstrijd die je als JSON hebt geëxporteerd.');
  }

  if (parsed == null || typeof parsed !== 'object') {
    throw new MatchFileError('Het bestand is leeg of bevat geen wedstrijd.');
  }

  const file = parsed as Partial<MatchExport>;
  if (file.format !== 'volley-scouting-match') {
    throw new MatchFileError(
      'Dit bestand komt niet uit deze app. Verwacht wordt een JSON-export van een wedstrijd.',
    );
  }
  if (typeof file.formatVersion !== 'number' || file.formatVersion > EXPORT_FORMAT_VERSION) {
    throw new MatchFileError(
      `Het bestand is gemaakt met een nieuwere versie van de app (formaat ${String(
        file.formatVersion,
      )}). Werk deze tablet eerst bij.`,
    );
  }
  if (!isRecord(file.match)) {
    throw new MatchFileError('Er staat geen wedstrijd in het bestand.');
  }
  if (!Array.isArray(file.sets)) {
    throw new MatchFileError('Er staan geen sets in het bestand.');
  }

  return file as MatchExport;
}

/** Alles in het bestand, plat, in de volgorde waarin het weggeschreven wordt. */
export function toChanges(file: MatchExport): ChangeEnvelope[] {
  const changes: ChangeEnvelope[] = [];
  const add = (entity: EntityName, record: unknown): void => {
    if (isRecord(record)) changes.push({ entity, record });
  };

  // Ploegen en spelers eerst: de wedstrijd verwijst ernaar.
  add('teams', file.teams?.own);
  add('teams', file.teams?.opponent);
  for (const player of file.players ?? []) add('players', player);

  add('matches', file.match);

  for (const set of file.sets ?? []) {
    add('sets', set.set);
    add('lineups', set.lineup);
    for (const substitution of set.substitutions ?? []) add('substitutions', substitution);
    for (const entry of set.rallies ?? []) {
      add('rallies', entry.rally);
      for (const action of entry.actions ?? []) add('actions', action);
    }
  }

  return changes;
}

export function readMatchFile(text: string): MatchFileContents {
  const file = parseMatchFile(text);
  return { file, changes: toChanges(file) };
}

function isRecord(value: unknown): value is BaseRecord {
  if (value == null || typeof value !== 'object') return false;
  const candidate = value as Partial<BaseRecord>;
  return typeof candidate.id === 'string' && typeof candidate.rev === 'string';
}
