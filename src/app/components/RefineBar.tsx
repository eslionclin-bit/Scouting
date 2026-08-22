/**
 * Verfijnen ná de tik.
 *
 * Alles wat optioneel is, wordt gevraagd nádat de actie al is opgeslagen: het
 * tempo en het blok bij een aanval, de reden bij een fout, en welke speler van
 * de tegenstander het was. Zo blijft de hoofdstroom altijd twee tikken, en kost
 * detail alleen iets als je er tijd voor hebt.
 *
 * Één balk voor alle drie, want het is één gebaar: de bal is uit het spel, jij
 * kijkt nog even naar het scherm, en dan gaat hij weg.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { ATTACK_TEMPO_LABELS, BLOCK_LABELS } from '../../domain/attack';
import { errorReasonsFor, ERROR_REASON_LABELS } from '../../domain/errors';
import { ACTION_TYPE_LABELS } from '../../domain/protocol';
import {
  ATTACK_TEMPOS,
  BLOCK_COUNTS,
  type Action,
  type AttackTempo,
  type BlockCount,
  type ErrorReason,
  type Player,
} from '../../domain/types';

export interface RefinePatch {
  tempo?: AttackTempo;
  blockers?: BlockCount;
  errorReason?: ErrorReason;
  playerId?: string;
}

export interface RefineBarProps {
  action: Action;
  /** Spelers van de ploeg waar deze actie bij hoort, om een naam aan te hangen. */
  players: readonly Player[];
  /** Tempo en blok hier vragen? Niet nodig als de invoerstroom het al deed. */
  askAttack: boolean;
  onRefine: (patch: RefinePatch) => void;
  onDismiss: () => void;
}

/** Zolang blijft de vraag staan; daarna is het moment voorbij. */
const VISIBLE_MS = 12000;

export function RefineBar({
  action,
  players,
  askAttack,
  onRefine,
  onDismiss,
}: RefineBarProps): ReactElement | null {
  const [patch, setPatch] = useState<RefinePatch>({});

  useEffect(() => {
    const timer = setTimeout(onDismiss, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const wantsAttack = askAttack && action.type === 'attack';
  const wantsReason = action.quality === 'error';
  const wantsPlayer = action.playerId === null && players.length > 0;
  if (!wantsAttack && !wantsReason && !wantsPlayer) return null;

  function choose(next: RefinePatch): void {
    setPatch((current) => ({ ...current, ...next }));
    onRefine(next);
  }

  return (
    <div className="refinebar" role="group" aria-label="Actie aanvullen">
      <span className="refinebar__label">
        {ACTION_TYPE_LABELS[action.type].toLowerCase()}
        {action.quality === 'error' ? ' fout' : ''} — nog iets erbij?
      </span>

      {wantsPlayer && (
        <span className="refinebar__group">
          {players.slice(0, 8).map((player) => (
            <button
              key={player.id}
              type="button"
              className={`refinebar__button ${
                patch.playerId === player.id ? 'refinebar__button--on' : ''
              }`}
              onClick={() => choose({ playerId: player.id })}
            >
              #{player.number}
            </button>
          ))}
        </span>
      )}

      {wantsAttack && (
        <>
          <span className="refinebar__group">
            {ATTACK_TEMPOS.map((tempo) => (
              <button
                key={tempo}
                type="button"
                className={`refinebar__button ${
                  (patch.tempo ?? action.tempo) === tempo ? 'refinebar__button--on' : ''
                }`}
                onClick={() => choose({ tempo })}
              >
                {ATTACK_TEMPO_LABELS[tempo]}
              </button>
            ))}
          </span>
          <span className="refinebar__group">
            {BLOCK_COUNTS.map((blockers) => (
              <button
                key={blockers}
                type="button"
                className={`refinebar__button ${
                  (patch.blockers ?? action.blockers) === blockers ? 'refinebar__button--on' : ''
                }`}
                onClick={() => choose({ blockers })}
              >
                {BLOCK_LABELS[blockers]}
              </button>
            ))}
          </span>
        </>
      )}

      {wantsReason && (
        <span className="refinebar__group">
          {errorReasonsFor(action.type).map((reason) => (
            <button
              key={reason}
              type="button"
              className={`refinebar__button ${
                (patch.errorReason ?? action.errorReason) === reason ? 'refinebar__button--on' : ''
              }`}
              onClick={() => choose({ errorReason: reason })}
            >
              {ERROR_REASON_LABELS[reason]}
            </button>
          ))}
        </span>
      )}

      <button type="button" className="refinebar__close" onClick={onDismiss} aria-label="Sluiten">
        ×
      </button>
    </div>
  );
}
