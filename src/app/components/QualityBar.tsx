/**
 * Verdeling over de vier kwalificaties als één balk.
 *
 * De volgorde ligt vast (perfect → fout), dus de plek in de balk zegt al wat een
 * segment betekent; de kleur bevestigt dat alleen. Elk segment draagt zijn eigen
 * aantal als tekst, en de exacte getallen staan sowieso in de tabel ernaast.
 */

import type { ReactElement } from 'react';
import { QUALITY_LABELS } from '../../domain/protocol';
import { QUALITIES, type Quality } from '../../domain/types';

export interface QualityBarProps {
  counts: Record<Quality, number>;
  total: number;
}

export function QualityBar({ counts, total }: QualityBarProps): ReactElement {
  if (total === 0) return <span className="qbar qbar--empty">—</span>;

  return (
    <span className="qbar" role="img" aria-label={describe(counts, total)}>
      {QUALITIES.map((quality) => {
        const count = counts[quality];
        if (count === 0) return null;
        const share = count / total;
        return (
          <span
            key={quality}
            className={`qbar__segment qbar__segment--${quality}`}
            style={{ flexGrow: count }}
            title={`${QUALITY_LABELS[quality]}: ${count} van ${total}`}
          >
            {share > 0.14 ? count : ''}
          </span>
        );
      })}
    </span>
  );
}

export function QualityLegend(): ReactElement {
  return (
    <div className="qlegend">
      {QUALITIES.map((quality) => (
        <span key={quality} className="qlegend__item">
          <span className={`qlegend__swatch qbar__segment--${quality}`} aria-hidden="true" />
          {QUALITY_LABELS[quality]}
        </span>
      ))}
    </div>
  );
}

function describe(counts: Record<Quality, number>, total: number): string {
  return QUALITIES.map((quality) => `${QUALITY_LABELS[quality]} ${counts[quality]}`).join(', ') + ` van ${total}`;
}
