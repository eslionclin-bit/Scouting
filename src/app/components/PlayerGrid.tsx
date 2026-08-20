/** Spelerselectie: grid met rugnummer en naam. */

import type { ReactElement } from 'react';

import type { Player, TeamSide } from '../../domain/types';

export interface PlayerGridProps {
  players: readonly Player[];
  value: string | null;
  team: TeamSide;
  onChange: (playerId: string | null) => void;
  active: boolean;
}

export function PlayerGrid({ players, value, team, onChange, active }: PlayerGridProps): ReactElement {
  return (
    <section className={`panel ${active ? 'panel--active' : ''}`}>
      <h2 className="panel__title">2. Speler</h2>
      <div className="grid grid--players">
        {players.map((player) => (
          <button
            key={player.id}
            type="button"
            className={`tile tile--player ${value === player.id ? 'tile--selected' : ''}`}
            onClick={() => onChange(player.id)}
            aria-pressed={value === player.id}
            aria-label={`#${player.number} ${player.name}`}
          >
            <span className="tile__number">{player.number}</span>
            <span className="tile__name">{player.name}</span>
          </button>
        ))}
        {/* Bij de tegenstander weet je het rugnummer lang niet altijd; de actie
            zelf (zone, kwalificatie) is dan nog steeds waardevol. */}
        {team === 'them' && (
          <button
            type="button"
            className={`tile tile--unknown ${value === null && active ? '' : ''}`}
            onClick={() => onChange(null)}
          >
            Onbekend
          </button>
        )}
        {players.length === 0 && team === 'us' && (
          <p className="panel__hint">Nog geen spelers in dit team. Voeg ze toe bij de wedstrijd.</p>
        )}
      </div>
    </section>
  );
}
