/**
 * Mini-veld met zes tikbare vakken.
 *
 * Eerst de vertrekzone (waar de speler stond bij afzet), daarna eventueel de
 * landingszone. Bij opslag en aanval is de vertrekzone verplicht; bij de rest
 * mag de hele stap worden overgeslagen.
 */

import type { ReactElement } from 'react';

import { COURT_GRID, ZONE_LABELS } from '../../domain/zones';
import type { Zone } from '../../domain/types';

export interface CourtPickerProps {
  zoneFrom: Zone | null;
  zoneTo: Zone | null;
  required: boolean;
  active: boolean;
  onZoneFrom: (zone: Zone) => void;
  onZoneTo: (zone: Zone | null) => void;
  onSkip: () => void;
}

export function CourtPicker({
  zoneFrom,
  zoneTo,
  required,
  active,
  onZoneFrom,
  onZoneTo,
  onSkip,
}: CourtPickerProps): ReactElement {
  const pickingLanding = zoneFrom !== null;

  return (
    <section className={`panel ${active ? 'panel--active' : ''}`}>
      <h2 className="panel__title">
        3. Zone
        <span className="panel__subtitle">
          {pickingLanding ? 'landingszone (optioneel)' : required ? 'vertrekzone — verplicht' : 'vertrekzone'}
        </span>
      </h2>

      <div className="court" role="group" aria-label="Zones 1 tot en met 6">
        <div className="court__net" aria-hidden="true">net</div>
        {COURT_GRID.map((row, rowIndex) => (
          <div className="court__row" key={rowIndex}>
            {row.map((zone) => (
              <button
                key={zone}
                type="button"
                title={ZONE_LABELS[zone]}
                aria-label={ZONE_LABELS[zone]}
                className={[
                  'court__zone',
                  zoneFrom === zone ? 'court__zone--from' : '',
                  zoneTo === zone ? 'court__zone--to' : '',
                ].join(' ')}
                onClick={() => (pickingLanding ? onZoneTo(zoneTo === zone ? null : zone) : onZoneFrom(zone))}
              >
                {zone}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="panel__actions">
        {!required && !pickingLanding && (
          <button type="button" className="button button--ghost" onClick={onSkip}>
            Zone overslaan
          </button>
        )}
        {pickingLanding && (
          <button type="button" className="button button--ghost" onClick={() => onZoneTo(null)}>
            Geen landingszone
          </button>
        )}
      </div>
    </section>
  );
}
