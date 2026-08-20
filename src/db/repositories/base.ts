/** Gedeelde hulpjes voor de repositories. */

import type { BaseRecord } from '../../domain/types';

/** Tombstones horen nergens in de app zichtbaar te zijn, alleen in de sync. */
export function isAlive<T extends BaseRecord>(record: T | undefined): record is T {
  return record != null && record.deletedAt === null;
}

export function alive<T extends BaseRecord>(records: readonly T[]): T[] {
  return records.filter((record) => record.deletedAt === null);
}

export function bySequence<T extends { sequence: number }>(a: T, b: T): number {
  return a.sequence - b.sequence;
}

export function nextSequence(records: readonly { sequence: number }[]): number {
  return records.reduce((max, record) => Math.max(max, record.sequence), 0) + 1;
}

export class NotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} met id ${id} bestaat niet (of is verwijderd).`);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    readonly issues: readonly { code: string; message: string }[],
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}
