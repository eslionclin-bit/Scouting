/**
 * CSV-export: één regel per actie, met alle context erbij.
 *
 * Bedoeld om in Excel of Numbers te openen, dus met Nederlandse kolomkoppen en
 * labels. De id-kolommen staan erbij zodat een rij altijd terug te vinden is in
 * de JSON-export, die het canonieke formaat blijft.
 */

import type { MatchBundle } from '../db/bundle';
import { ATTACK_TEMPO_LABELS } from '../domain/attack';
import { ACTION_TYPE_LABELS, QUALITY_LABELS, TEAM_SIDE_LABELS } from '../domain/protocol';

export const CSV_COLUMNS = [
  'wedstrijd_id',
  'datum',
  'tegenstander',
  'thuis_uit',
  'set',
  'rally',
  'rally_gewonnen_door',
  'stand_wij',
  'stand_zij',
  'actie_volgnummer',
  'team',
  'rugnummer',
  'speler',
  'actietype',
  'zone_vertrek',
  'zone_landing',
  'kwalificatie',
  'tempo',
  'blok',
  'video_ms',
  'actie_id',
] as const;

export function toMatchCsv(bundle: MatchBundle, delimiter = ';'): string {
  const playerNames = new Map(bundle.players.map((player) => [player.id, player.name]));
  const opponentName = bundle.opponent?.name ?? '';
  const rows: string[] = [CSV_COLUMNS.join(delimiter)];

  for (const setBundle of bundle.sets) {
    for (const rallyBundle of setBundle.rallies) {
      const { rally } = rallyBundle;
      for (const action of rallyBundle.actions) {
        rows.push(
          [
            bundle.match.id,
            bundle.match.date,
            opponentName,
            bundle.match.homeAway === 'home' ? 'thuis' : 'uit',
            setBundle.set.setNumber,
            rally.sequence,
            rally.wonBy ? TEAM_SIDE_LABELS[rally.wonBy] : '',
            rally.pointsUsAfter ?? '',
            rally.pointsThemAfter ?? '',
            action.sequence,
            TEAM_SIDE_LABELS[action.team],
            action.playerNumber ?? '',
            action.playerId ? (playerNames.get(action.playerId) ?? '') : '',
            ACTION_TYPE_LABELS[action.type],
            action.zoneFrom ?? '',
            action.zoneTo ?? '',
            QUALITY_LABELS[action.quality],
            action.tempo ? ATTACK_TEMPO_LABELS[action.tempo] : '',
            action.blockers ?? '',
            action.videoTimestampMs ?? '',
            action.id,
          ]
            .map((value) => escapeCsv(value, delimiter))
            .join(delimiter),
        );
      }
    }
  }

  return rows.join('\r\n');
}

function escapeCsv(value: string | number, delimiter: string): string {
  const text = String(value);
  if (text.includes(delimiter) || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}
