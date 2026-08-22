/**
 * De zes van de tegenstander.
 *
 * Hun opstelling invullen is optioneel — de app werkt er zonder gewoon door —
 * maar het levert twee dingen op die je anders nooit krijgt:
 *
 *  1. **Wie van hen serveert.** Zodra hun rotatie bekend is, weet de app na elke
 *     rally wie er bij hen in zone 1 staat. Een servicefout van ons betekent dat
 *     zij doordraaien, en dan staat er meteen wie er zo aan de opslag komt.
 *  2. **Op wie je serveert.** Een doelzone zegt 'positie 5'; met hun opstelling
 *     erbij zegt hij '#38 op positie 5', en dat is pas een advies.
 *
 * Je vult in wat je nú in het veld ziet, niet hun beginopstelling: dat is wat je
 * op dat moment voor je hebt. De app rekent zelf terug naar het begin van de
 * set, want daar is de rotatietelling op gebouwd.
 */

import { useState, type ReactElement } from 'react';
import { rotatePositions } from '../../domain/rotation';
import type { Zone } from '../../domain/types';
import { ZONES } from '../../domain/types';
import { OPPONENT_GRID, ZONE_LABELS } from '../../domain/zones';

export interface OpponentLineupSheetProps {
  /** Wat er nu in het veld staat volgens de al bekende opstelling, per zone. */
  current: Record<Zone, number | null>;
  /** Rotatiestand van de tegenstander op dit moment (1-6). */
  rotation: number;
  /** Rugnummers die we al van hen kennen, als suggestie. */
  known: readonly number[];
  /** Ontvangt de opstelling zoals die aan het begin van de set stond. */
  onSave: (atStartOfSet: Record<Zone, number | null>) => void;
  onClose: () => void;
}

const EMPTY: Record<Zone, number | null> = { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null };

export function OpponentLineupSheet({
  current,
  rotation,
  known,
  onSave,
  onClose,
}: OpponentLineupSheetProps): ReactElement {
  const [draft, setDraft] = useState<Record<Zone, number | null>>({ ...EMPTY, ...current });

  function set(zone: Zone, value: string): void {
    const number = value.trim() === '' ? null : Number.parseInt(value, 10);
    setDraft((positions) => ({
      ...positions,
      [zone]: number !== null && Number.isFinite(number) ? number : null,
    }));
  }

  const filled = ZONES.filter((zone) => draft[zone] !== null).length;

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Opstelling tegenstander">
      <div className="sheet__backdrop" onClick={onClose} />
      <div className="sheet__card sheet__card--wide">
        <p className="sheet__principle">
          Vul de rugnummers in zoals ze er <strong>nu</strong> staan (hun rotatie R{rotation}). Het
          veld staat zoals je het ziet: hun voorlijn aan het net, hun zone 4 voor jou rechts. De
          app rekent zelf terug naar het begin van de set.
        </p>

        <div className="court court--lineup">
          {OPPONENT_GRID.map((row, index) => (
            <div className="court__row" key={index}>
              {row.map((zone) => (
                <label key={zone} className="lineupcell lineupcell--input">
                  <span className="lineupcell__zone">{zone}</span>
                  <span className="visually-hidden">{`Tegenstander ${ZONE_LABELS[zone]}`}</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={99}
                    aria-label={`Rugnummer ${ZONE_LABELS[zone]}`}
                    value={draft[zone] ?? ''}
                    onChange={(event) => set(zone, event.target.value)}
                  />
                </label>
              ))}
            </div>
          ))}
          <div className="court__net" aria-hidden="true">
            net
          </div>
        </div>

        {known.length > 0 && (
          <p className="step__hint">
            Al gezien deze wedstrijd: {known.map((number) => `#${number}`).join(' ')}
          </p>
        )}

        <div className="sheet__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Annuleren
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={filled === 0}
            // Terugrekenen naar het begin van de set: daar hangt de hele
            // rotatietelling aan, en die telt zelf al door.
            onClick={() => onSave(rotatePositions(draft, -(rotation - 1)))}
          >
            {filled === 6 ? 'Opstelling bewaren' : `Bewaren (${filled} van 6)`}
          </button>
        </div>
      </div>
    </div>
  );
}
