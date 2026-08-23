/**
 * Rolkeuze bij het openen van een wedstrijd (projectbrief §6).
 *
 * Expliciet vragen in plaats van afleiden: op één tablet wordt ingevoerd, op de
 * andere meegelezen, en welke van de twee dit is moet buiten twijfel staan.
 */

import type { ReactElement } from 'react';
import type { DeviceRole } from '../../domain/types';

export interface RoleSheetProps {
  matchLabel: string;
  onChoose: (role: DeviceRole) => void;
  onClose: () => void;
}

const ROLES: { role: DeviceRole; title: string; description: string }[] = [
  {
    role: 'scorer',
    title: 'Ik voer in',
    description: 'Jij legt de rally\'s vast en bepaalt wanneer een rally en een set klaar zijn.',
  },
  {
    role: 'assistant',
    title: 'Ik vul aan',
    description:
      'Tweede invoerder: je vult acties aan in de rally die de hoofdinvoerder open heeft staan. Spreek af wie wat doet.',
  },
  {
    role: 'viewer',
    // Heette 'ik lees mee'. Dat beschrijft wat het apparaat doet, niet waar je
    // het voor gebruikt — en meelezen is niet waarom je erbij zit.
    title: 'Coachinformatie',
    description:
      'Wat er nu opvalt, waar je naartoe moet serveren, en wat je in de time-out zegt. Je voert zelf niets in.',
  },
];

export function RoleSheet({ matchLabel, onChoose, onClose }: RoleSheetProps): ReactElement {
  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Rol kiezen">
      <div className="sheet__backdrop" onClick={onClose} />
      <div className="sheet__card sheet__card--wide">
        <h3>{matchLabel}</h3>
        <p className="sheet__principle">Wat doe je op dit apparaat tijdens deze wedstrijd?</p>

        <div className="roles">
          {ROLES.map((option) => (
            <button
              key={option.role}
              type="button"
              className="roles__option"
              onClick={() => onChoose(option.role)}
            >
              <span className="roles__title">{option.title}</span>
              <span className="roles__description">{option.description}</span>
            </button>
          ))}
        </div>

        <div className="sheet__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Annuleren
          </button>
        </div>
      </div>
    </div>
  );
}
