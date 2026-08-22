/**
 * Waarom een bal verloren ging.
 *
 * Twaalf servicefouten is een telling; 'negen daarvan in het net' is een
 * trainingsopdracht. Daarom bij een fout één extra vraag — maar pas nádat de
 * actie is opgeslagen, zodat het invoeren er nooit op wacht.
 *
 * Zes redenen, niet meer: ze moeten van een afstand te herkennen zijn en in één
 * rij op een tablet passen. De scoutprogramma's kennen er per vaardigheid tien,
 * maar die worden ingevuld door iemand die achter een video zit.
 */

import type { ActionType } from './types';

export type ErrorReason = 'out' | 'net' | 'blocked' | 'handling' | 'unplayable' | 'other';

export const ERROR_REASON_LABELS: Record<ErrorReason, string> = {
  out: 'Uit',
  net: 'In het net',
  blocked: 'Geblokt',
  handling: 'Technische fout',
  unplayable: 'Onhoudbaar',
  other: 'Anders',
};

/** Welke redenen bij welk actietype horen. Wat niet kan, staat er niet bij. */
const BY_TYPE: Record<ActionType, readonly ErrorReason[]> = {
  serve: ['net', 'out', 'other'],
  attack: ['out', 'net', 'blocked', 'other'],
  block: ['net', 'out', 'other'],
  reception: ['unplayable', 'handling', 'other'],
  dig: ['unplayable', 'handling', 'other'],
  set: ['handling', 'net', 'other'],
};

export function errorReasonsFor(type: ActionType): readonly ErrorReason[] {
  return BY_TYPE[type] ?? ['other'];
}
