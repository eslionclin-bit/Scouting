/**
 * Wat een pass oplevert.
 *
 * Eén tabel met de bedoeling van een argument: passkwaliteit is geen doel op
 * zich, maar hij is in punten uit te drukken. 'Bij een perfecte pass winnen we
 * 74% van de rally's, bij een matige 39%' is de zin waarmee je een training
 * over passen verantwoordt.
 */

import type { ReactElement } from 'react';
import { MIN_PASSES, type SideoutByPass } from '../../analysis';
import { QUALITY_LABELS } from '../../domain/protocol';

export interface PassValueProps {
  data: SideoutByPass;
}

export function PassValue({ data }: PassValueProps): ReactElement {
  if (data.total === 0) {
    return <p className="card__hint">Nog geen ontvangen rally's met een ingevoerde pass.</p>;
  }

  return (
    <>
      <div className="tablewrap">
        <table className="stats">
          <thead>
            <tr>
              <th scope="col">Pass</th>
              <th scope="col">Ontvangen</th>
              <th scope="col">Rally gewonnen</th>
              <th scope="col">Sideout</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.quality}>
                <th scope="row">
                  <span className={`dot dot--${row.quality}`} aria-hidden="true" />
                  {QUALITY_LABELS[row.quality]}
                </th>
                <td>{row.receptions}</td>
                <td>{row.sideouts}</td>
                <td>
                  {row.receptions === 0
                    ? '—'
                    : `${Math.round((row.sideoutPct ?? 0) * 100)}%`}
                  {row.receptions > 0 && row.receptions < MIN_PASSES && (
                    <span className="metrics__sample">weinig waarnemingen</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="card__hint">
        {data.gain === null
          ? `Zodra er van zowel een perfecte als een matige pass ${MIN_PASSES} zijn, staat hier wat het verschil tussen die twee waard is.`
          : `Verschil tussen een perfecte en een matige pass: ${Math.round(
              data.gain * 100,
            )} punten per honderd ontvangen ballen.`}
      </p>
    </>
  );
}
