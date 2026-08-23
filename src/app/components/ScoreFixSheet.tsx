/**
 * Punten die niet zijn ingevoerd alsnog meetellen.
 *
 * Tijdens een wedstrijd raakt een invoerder wel eens een rally kwijt. Dan loopt
 * de stand in de app achter op het scorebord — en, vervelender, ook de rotatie.
 * Hier tel je zo'n punt bij. Het komt in de data te staan als 'niet ingevoerd',
 * dus de stand klopt weer zonder te doen alsof er acties bekend zijn.
 *
 * En wie er begon met serveren staat hier ook. Eén tik verkeerd bij die vraag en
 * de rest van de set klopt niet meer — de rotatie telt door vanaf wie er
 * serveerde — dus dat moet te herstellen zijn zonder de set opnieuw in te
 * voeren.
 */

import { useState, type ReactElement } from 'react';
import type { TeamSide } from '../../domain/types';

export interface ScoreFixSheetProps {
  pointsUs: number;
  pointsThem: number;
  /** Wie er volgens de app met serveren begon in deze set. */
  startingServe: TeamSide | null;
  onAdd: (wonBy: TeamSide) => Promise<void>;
  /** Zet de beginservice om en rekent de hele set opnieuw door. */
  onFixStartingServe: (side: TeamSide) => Promise<void>;
  onClose: () => void;
}

export function ScoreFixSheet({
  pointsUs,
  pointsThem,
  startingServe,
  onAdd,
  onFixStartingServe,
  onClose,
}: ScoreFixSheetProps): ReactElement {
  const [busy, setBusy] = useState(false);

  async function add(wonBy: TeamSide): Promise<void> {
    setBusy(true);
    try {
      await onAdd(wonBy);
    } finally {
      setBusy(false);
    }
  }

  async function fixServe(side: TeamSide): Promise<void> {
    setBusy(true);
    try {
      await onFixStartingServe(side);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Stand bijstellen">
      <div className="sheet__backdrop" onClick={onClose} />
      <div className="sheet__card">
        <h3>Stand bijstellen</h3>
        <p className="sheet__principle">
          Loopt de app achter op het scorebord? Tik per gemist punt één keer. Het punt telt mee voor
          de stand en de rotatie, maar wordt gemarkeerd als niet ingevoerd — er horen immers geen
          acties bij.
        </p>

        <div className="scorefix">
          <div className="scorefix__score">
            <span>in de app</span>
            <strong>
              {pointsUs} – {pointsThem}
            </strong>
          </div>
        </div>

        <div className="scorefix__buttons">
          <button
            type="button"
            className="button button--us"
            disabled={busy}
            onClick={() => void add('us')}
          >
            + punt wij
          </button>
          <button
            type="button"
            className="button button--them"
            disabled={busy}
            onClick={() => void add('them')}
          >
            + punt zij
          </button>
        </div>

        <h3 className="sheet__subtitle">Wie begon met serveren</h3>
        <p className="sheet__principle">
          Staat dit verkeerd, dan klopt de rotatie de hele set niet. Omzetten laat de acties en de
          uitslagen staan; alleen wie er serveerde en in welke rotatie wordt opnieuw uitgerekend.
        </p>
        <div className="scorefix__buttons">
          {(['us', 'them'] as const).map((side) => (
            <button
              key={side}
              type="button"
              className={`button ${side === 'us' ? 'button--us' : 'button--them'} ${
                startingServe === side ? 'button--live' : ''
              }`}
              disabled={busy || startingServe === side}
              onClick={() => void fixServe(side)}
            >
              {side === 'us' ? 'Wij' : 'Tegenstander'}
              {startingServe === side ? ' · staat nu zo' : ''}
            </button>
          ))}
        </div>

        <div className="sheet__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Klaar
          </button>
        </div>
      </div>
    </div>
  );
}
