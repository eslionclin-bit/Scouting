/**
 * De vier kwalificatieknoppen, kleurgecodeerd.
 *
 * Lang indrukken toont het criterium uit het protocol; dat is de reden dat
 * nieuwe invoerders niet hoeven te bladeren en dat twee invoerders dezelfde bal
 * hetzelfde noteren.
 */

import type { ReactElement } from 'react';

import { QUALITY_LABELS, tooltipFor } from '../../domain/protocol';
import { QUALITIES, type ActionType, type Quality } from '../../domain/types';
import { useLongPress } from '../hooks/useLongPress';

export interface QualityButtonsProps {
  actionType: ActionType | null;
  disabled: boolean;
  active: boolean;
  onPick: (quality: Quality) => void;
  onExplain: (quality: Quality) => void;
}

export function QualityButtons({
  actionType,
  disabled,
  active,
  onPick,
  onExplain,
}: QualityButtonsProps): ReactElement {
  return (
    <section className={`panel ${active ? 'panel--active' : ''}`}>
      <h2 className="panel__title">
        4. Kwalificatie
        <span className="panel__subtitle">lang indrukken = criterium</span>
      </h2>
      <div className="grid grid--qualities">
        {QUALITIES.map((quality) => (
          <QualityButton
            key={quality}
            quality={quality}
            actionType={actionType}
            disabled={disabled}
            onPick={onPick}
            onExplain={onExplain}
          />
        ))}
      </div>
    </section>
  );
}

function QualityButton({
  quality,
  actionType,
  disabled,
  onPick,
  onExplain,
}: {
  quality: Quality;
  actionType: ActionType | null;
  disabled: boolean;
  onPick: (quality: Quality) => void;
  onExplain: (quality: Quality) => void;
}): ReactElement {
  const longPress = useLongPress(() => onExplain(quality));
  const hint = actionType ? tooltipFor(actionType, quality).criterion : undefined;

  return (
    <button
      type="button"
      className={`quality quality--${quality}`}
      disabled={disabled}
      title={hint}
      onClick={() => onPick(quality)}
      {...longPress}
    >
      <span className="quality__label">{QUALITY_LABELS[quality]}</span>
      {hint && <span className="quality__criterion">{hint}</span>}
    </button>
  );
}
