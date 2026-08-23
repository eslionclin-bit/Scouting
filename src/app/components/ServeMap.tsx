/**
 * Waar we naartoe moeten serveren, als plaatje.
 *
 * De cijfers hiervoor stonden al in het dossier, maar een tabel lees je niet
 * tijdens een time-out. Dit is dezelfde informatie in de vorm waarin je hem
 * nodig hebt: hun helft, zoals je hem vanaf de bank ziet, met per plek wat
 * onze service daar oplevert en wie er staat.
 *
 * Wat er níet gebeurt: kleuren op te weinig ballen. Een vak dat groen kleurt op
 * drie services is geen advies maar een toevalstreffer, en daar een wedstrijd
 * op sturen is erger dan niets weten. Zulke vakken blijven grijs, met het
 * aantal erbij.
 */

import type { ReactElement } from 'react';
import { MIN_SERVES_PER_TARGET, type ServeTargets } from '../../analysis';
import type { Zone } from '../../domain/types';
import { OPPONENT_GRID, ZONE_LABELS } from '../../domain/zones';

export interface ServeMapProps {
  targets: ServeTargets;
  /** Rugnummer per zone bij de tegenstander, als hun opstelling bekend is. */
  numbers?: Record<Zone, number | null>;
}

export function ServeMap({ targets, numbers }: ServeMapProps): ReactElement {
  const byZone = new Map(targets.byZone.map((row) => [row.zone, row]));
  const gemiddeld = targets.wonPct;

  return (
    <div className="servemap">
      <p className="servemap__side">Tegenstander</p>
      <div className="servemap__court">
        {OPPONENT_GRID.flat().map((zone) => {
          const row = byZone.get(zone);
          const enough = (row?.serves ?? 0) >= MIN_SERVES_PER_TARGET;
          const won = row?.wonPct ?? null;

          // Alleen kleuren als er genoeg ballen zijn én het afwijkt van ons
          // eigen gemiddelde: anders kleurt het hele veld en zegt het niets.
          const gap = enough && won !== null && gemiddeld !== null ? won - gemiddeld : 0;
          const tone = gap >= 0.1 ? 'goed' : gap <= -0.1 ? 'slecht' : 'neutraal';
          const number = numbers?.[zone] ?? null;

          return (
            <div key={zone} className={`servecell servecell--${tone}`}>
              <span className="servecell__zone">{zone}</span>
              {number !== null && <span className="servecell__number">#{number}</span>}
              <span className="servecell__value">
                {won === null ? '—' : `${Math.round(won * 100)}%`}
              </span>
              <span className="servecell__hint">
                {row === undefined
                  ? 'nooit geserveerd'
                  : enough
                    ? `${row.serves} services`
                    : `${row.serves} — te weinig`}
              </span>
              <span className="visually-hidden">{ZONE_LABELS[zone]}</span>
            </div>
          );
        })}
      </div>
      <p className="servemap__net" aria-hidden="true">
        net
      </p>
      <p className="servemap__legend">
        Aandeel rally's dat we wonnen na een service op die plek.
        {gemiddeld === null
          ? ' Nog niets om mee te vergelijken.'
          : ` Gemiddeld ${Math.round(gemiddeld * 100)}% over al onze services.`}{' '}
        Groen is beter dan dat, rood slechter; grijs betekent te weinig ballen om iets van te
        vinden.
      </p>
    </div>
  );
}
