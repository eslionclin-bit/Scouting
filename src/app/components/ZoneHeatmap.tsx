/**
 * Zone-heatmap op het mini-veld.
 *
 * De kleur loopt in één tint van bijna-achtergrond naar helder, zodat 'meer' ook
 * echt donkerder-naar-lichter leest. Elk vak toont daarnaast het aantal en het
 * percentage: wie de kleuren niet uit elkaar houdt, leest gewoon de getallen.
 */

import type { ReactElement } from 'react';
import type { ZoneTally } from '../../analysis/stats';
import { COURT_GRID, ZONE_LABELS } from '../../domain/zones';

export interface ZoneHeatmapProps {
  title: string;
  subtitle?: string;
  tally: ZoneTally;
}

/** Vijf niveaus: leeg, en vier stappen van de sequentiële schaal. */
function heatStep(count: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (count === 0 || max === 0) return 0;
  const ratio = count / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function ZoneHeatmap({ title, subtitle, tally }: ZoneHeatmapProps): ReactElement {
  return (
    <figure className="heatmap">
      <figcaption className="heatmap__caption">
        <span className="heatmap__title">{title}</span>
        {subtitle && <span className="heatmap__subtitle">{subtitle}</span>}
      </figcaption>

      <div className="court court--heat">
        <div className="court__net" aria-hidden="true">net</div>
        {COURT_GRID.map((row, index) => (
          <div className="court__row" key={index}>
            {row.map((zone) => {
              const count = tally.counts[zone];
              const percentage = tally.percentages[zone];
              // De inkt hangt aan de stap, niet aan het aantal: op de donkere
              // stappen wit, op de lichte zwart. Anders vallen juist de kleine
              // labels weg op de vakken die er het meest toe doen.
              const step = heatStep(count, tally.max);
              return (
                <div
                  key={zone}
                  className={`heatcell heatcell--s${step}`}
                  title={`${ZONE_LABELS[zone]}: ${count} (${formatPct(percentage)})`}
                >
                  <span className="heatcell__zone">{zone}</span>
                  <span className="heatcell__value">{count}</span>
                  <span className="heatcell__pct">{tally.total > 0 ? formatPct(percentage) : '—'}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="heatmap__total">{tally.total} geregistreerd</p>
    </figure>
  );
}

function formatPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}
