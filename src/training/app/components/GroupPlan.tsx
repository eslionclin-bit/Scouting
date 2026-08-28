/**
 * Wie doet er mee, in welke groep, en wie wachten er.
 *
 * Dit is het antwoord op de vraag waar de app om begonnen is, en het staat
 * daarom op twee plekken: in de bouwer terwijl je een training in elkaar zet,
 * en op het trainingsblad in de zaal. Eén component, zodat het er allebei
 * hetzelfde uitziet.
 */

import type { Assignment } from '../../domain/grouping';
import { describeProblem } from '../../domain/plan';
import { POSITION_SHORT } from '../../domain/types';
import type { Player } from '../../domain/types';
import { Warning } from './ui';

export function GroupPlan({
  assignment,
  rounds = [],
  rotateEveryMinutes,
  compact = false,
}: {
  assignment: Assignment;
  rounds?: readonly Assignment[];
  rotateEveryMinutes?: number | null;
  compact?: boolean;
}) {
  const { groups, waiting, distribution } = assignment;

  if (!distribution.possible) {
    return (
      <div className="groupplan">
        {assignment.problems.map((problem, index) => (
          <Warning key={index} severity="blocking">
            {describeProblem(problem)}
          </Warning>
        ))}
      </div>
    );
  }

  return (
    <div className="groupplan">
      <div className="groupplan__groups">
        {groups.map((group) => (
          <div key={group.number} className="groupplan__group">
            <h4>
              Groep {group.number} <span className="muted">· {group.players.length}</span>
            </h4>
            <ol>
              {group.players.map((player) => (
                <li key={player.id}>
                  <PlayerName player={player} />
                </li>
              ))}
            </ol>
          </div>
        ))}

        {waiting.length > 0 && (
          <div className="groupplan__group groupplan__group--waiting">
            <h4>
              Wisselt in <span className="muted">· {waiting.length}</span>
            </h4>
            <ol>
              {waiting.map((player) => (
                <li key={player.id}>
                  <PlayerName player={player} />
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {rotateEveryMinutes && rounds.length > 1 && (
        <p className="groupplan__rotation">
          Wissel om de {rotateEveryMinutes} minuten door; na {rounds.length} beurten is iedereen
          even vaak aan de beurt geweest.
        </p>
      )}

      {!compact &&
        assignment.problems.map((problem, index) => (
          <Warning key={index} severity={problem.kind === 'step' ? 'notice' : 'blocking'}>
            {describeProblem(problem)}
          </Warning>
        ))}
    </div>
  );
}

export function PlayerName({ player }: { player: Player }) {
  return (
    <span className="playername">
      {player.number !== null && <span className="playername__number">{player.number}</span>}
      {player.name}
      {player.positions.length > 0 && (
        <span className="playername__position">
          {player.positions.map((position) => POSITION_SHORT[position]).join('/')}
        </span>
      )}
    </span>
  );
}
