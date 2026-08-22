/**
 * Een ingelezen wedstrijd in de database zetten.
 *
 * Dit gaat bewust langs de gewone repositories heen. Die schrijven per actie één
 * transactie — precies goed als een invoerder één bal per keer vastlegt, maar
 * onbruikbaar voor twaalfhonderd acties uit een bestand. Hier worden de records
 * in één keer opgebouwd en in blokken weggeschreven.
 *
 * Twee dingen liggen daarmee bij deze module in plaats van bij de repositories,
 * en dat hoort erbij vermeld te worden:
 *  - de afgeleide velden (stand na elke rally, volgnummers) worden hier gezet;
 *  - de protocolcontrole wordt overgeslagen. Die is er om een mens te
 *    corrigeren tijdens het invoeren; een scoutbestand is al gecontroleerd door
 *    degene die het maakte.
 */

import type { ImportedMatch } from '../../import/dvw/interpret';
import type { PlayerRole, TeamSide } from '../../domain/types';
import { buildRecord, commit, type WriteContext, type WriteOp } from '../mutations';
import type { PlayerRepository } from './players';
import type { TeamRepository } from './teams';

export interface ImportSummary {
  matchId: string;
  homeTeam: string;
  visitingTeam: string;
  date: string;
  competition: string | null;
  sets: number;
  rallies: number;
  actions: number;
  /** Codes die geen balcontact waren en dus niet zijn overgenomen. */
  skipped: number;
  /**
   * Acties per rally. Een bestand met vier of meer acties per rally is volledig
   * gescout; ligt het daar ver onder, dan zijn alleen de belangrijkste ballen
   * vastgelegd en zeggen de actiecijfers minder.
   */
  actionsPerRally: number;
}

/** Zoveel records gaan er per transactie in. */
const CHUNK = 400;

export class ImportRepository {
  constructor(
    private readonly ctx: WriteContext,
    private readonly teams: TeamRepository,
    private readonly players: PlayerRepository,
  ) {}

  async importScoutedMatch(
    imported: ImportedMatch,
    options: { fileName: string },
  ): Promise<ImportSummary> {
    const [homeTeam, visitingTeam] = await Promise.all([
      this.teams.findOrCreateReference(imported.homeTeam),
      this.teams.findOrCreateReference(imported.visitingTeam),
    ]);

    const numbers = new Map<string, string>();
    const ops: WriteOp[] = [];

    /** Spelers uit het bestand, met hun rugnummer als sleutel per ploeg. */
    const existing = await this.players.listByTeam(homeTeam.id);
    const existingVisiting = await this.players.listByTeam(visitingTeam.id);
    for (const player of [...existing, ...existingVisiting]) {
      numbers.set(`${player.teamId}:${player.number}`, player.id);
    }

    for (const [team, roster] of [
      [homeTeam.id, imported.homePlayers],
      [visitingTeam.id, imported.visitingPlayers],
    ] as const) {
      for (const player of roster) {
        const key = `${team}:${player.number}`;
        if (numbers.has(key)) continue;
        const record = buildRecord(this.ctx, 'players', {
          teamId: team,
          number: player.number,
          name: player.name,
          role: roleOf(player.role),
          position: null,
          active: true,
        });
        numbers.set(key, record.id);
        ops.push({ entity: 'players', record, skipOutbox: true });
      }
    }

    const date = imported.date ?? this.ctx.now().toISOString().slice(0, 10);
    const match = buildRecord(this.ctx, 'matches', {
      date,
      rules: null,
      ownTeamId: homeTeam.id,
      opponentTeamId: visitingTeam.id,
      homeAway: 'home',
      location: null,
      competition: imported.competition,
      status: 'finished',
      notes: null,
      reference: true,
      source: options.fileName,
    });
    ops.push({ entity: 'matches', record: match, skipOutbox: true });

    let rallyCount = 0;
    let actionCount = 0;

    for (const set of imported.sets) {
      const rallies = imported.rallies.filter((rally) => rally.setNumber === set.setNumber);
      const setRecord = buildRecord(this.ctx, 'sets', {
        matchId: match.id,
        setNumber: set.setNumber,
        pointsUs: set.pointsUs,
        pointsThem: set.pointsThem,
        status: 'finished',
        startingServe: rallies[0]?.servingTeam ?? null,
      });
      ops.push({ entity: 'sets', record: setRecord, skipOutbox: true });

      rallies.forEach((rally, index) => {
        const rallyRecord = buildRecord(this.ctx, 'rallies', {
          matchId: match.id,
          setId: setRecord.id,
          sequence: index + 1,
          servingTeam: rally.servingTeam ?? 'us',
          wonBy: rally.wonBy,
          pointsUsAfter: rally.pointsUs,
          pointsThemAfter: rally.pointsThem,
          rotationUs: rally.rotationUs,
          // Een rally zonder acties is in het bestand wel gespeeld maar niet
          // uitgeschreven — precies waar dit veld voor bedoeld is.
          scouted: rally.actions.length > 0,
        });
        ops.push({ entity: 'rallies', record: rallyRecord, skipOutbox: true });
        rallyCount++;

        rally.actions.forEach((action, sequence) => {
          const record = buildRecord(this.ctx, 'actions', {
            matchId: match.id,
            setId: setRecord.id,
            rallyId: rallyRecord.id,
            sequence: sequence + 1,
            team: action.team,
            playerId: playerIdFor(numbers, action.team, homeTeam.id, visitingTeam.id, action.playerNumber),
            playerNumber: action.playerNumber,
            type: action.type,
            zoneFrom: action.zoneFrom,
            zoneTo: action.zoneTo,
            quality: action.quality,
            videoTimestampMs: null,
          });
          ops.push({ entity: 'actions', record, skipOutbox: true });
          actionCount++;
        });
      });
    }

    for (let i = 0; i < ops.length; i += CHUNK) {
      await commit(this.ctx, ops.slice(i, i + CHUNK));
    }

    return {
      matchId: match.id,
      homeTeam: homeTeam.name,
      visitingTeam: visitingTeam.name,
      date,
      competition: imported.competition,
      sets: imported.sets.length,
      rallies: rallyCount,
      actions: actionCount,
      skipped: imported.skipped.length,
      actionsPerRally: rallyCount > 0 ? actionCount / rallyCount : 0,
    };
  }
}

function playerIdFor(
  numbers: ReadonlyMap<string, string>,
  team: TeamSide,
  homeTeamId: string,
  visitingTeamId: string,
  number: number | null,
): string | null {
  if (number === null) return null;
  return numbers.get(`${team === 'us' ? homeTeamId : visitingTeamId}:${number}`) ?? null;
}

/** DataVolley kent 'unknown' als rol; wij laten die dan liever leeg. */
function roleOf(role: string | null): PlayerRole | null {
  if (role === null || role === 'unknown') return null;
  return role as PlayerRole;
}
