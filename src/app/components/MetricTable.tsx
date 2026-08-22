/**
 * Nu — bij ons gemiddeld — op topniveau.
 *
 * Bewust een tabel en geen grafiek: zes getallen naast elkaar met een duidelijke
 * kop is sneller te lezen dan zes balkjes, en er valt niets in te misinterpreteren.
 * Bij de referentie hoort de herkomst, en die is uit te klappen — een getal
 * waarvan je niet weet waar het vandaan komt, hoort in deze app niet thuis.
 */

import { Fragment, useState, type ReactElement } from 'react';
import { formatMetric, type MetricComparison, type MetricKey } from '../../analysis';

export interface MetricTableProps {
  rows: readonly MetricComparison[];
  /** Kop boven de eerste kolom: 'Deze wedstrijd', 'Deze set', … */
  nowLabel: string;
  /** Kop boven de tweede kolom. Weglaten als er geen eigen gemiddelde is. */
  ownLabel?: string;
  referenceLabel: string;
  /** Alleen de referentiekolom tonen — voor het scherm waar die zelf onderwerp is. */
  hideNow?: boolean;
}

export function MetricTable({
  rows,
  nowLabel,
  ownLabel,
  referenceLabel,
  hideNow = false,
}: MetricTableProps): ReactElement {
  const [openSource, setOpenSource] = useState<MetricKey | null>(null);

  return (
    <div className="tablewrap">
      <table className="stats metrics">
        <thead>
          <tr>
            <th scope="col">Wat</th>
            {!hideNow && <th scope="col">{nowLabel}</th>}
            {ownLabel && !hideNow && <th scope="col">{ownLabel}</th>}
            <th scope="col">{referenceLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = row.metric.key;
            const open = openSource === key;
            return (
              <Fragment key={key}>
                <tr>
                  <th scope="row">
                    <span className="metrics__label">{row.metric.label}</span>
                    <span className="metrics__explain">{row.metric.explain}</span>
                  </th>
                  {!hideNow && (
                  <td className={row.vsOwn ? `metrics__now metrics__now--${row.vsOwn}` : 'metrics__now'}>
                    <span className="metrics__value">{formatMetric(key, row.now.value)}</span>
                    <span className="metrics__sample">
                      {row.now.sample} {row.metric.unit}
                      {row.vsOwn && row.vsOwn !== 'gelijk' ? ` · ${row.vsOwn} niveau` : ''}
                    </span>
                  </td>
                  )}
                  {ownLabel && !hideNow && (
                    <td>
                      <span className="metrics__value">{formatMetric(key, row.own.value)}</span>
                      <span className="metrics__sample">
                        {row.own.sample} {row.metric.unit}
                      </span>
                    </td>
                  )}
                  <td>
                    <button
                      type="button"
                      className="linkish metrics__reference"
                      aria-expanded={open}
                      onClick={() => setOpenSource(open ? null : key)}
                    >
                      {formatMetric(key, row.reference.value)}
                      <span className="metrics__basis">{row.reference.basis}</span>
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="metrics__sourcerow">
                    <td colSpan={hideNow ? 2 : ownLabel ? 4 : 3}>{row.reference.source}</td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
