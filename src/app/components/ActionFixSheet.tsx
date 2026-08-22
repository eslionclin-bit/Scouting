/**
 * Een actie rechtzetten die verder terugligt.
 *
 * Undo haalt de laatste actie weg; dat werkt zolang je de fout meteen ziet. Merk
 * je pas drie rally's later dat die pass matig was in plaats van goed, dan zou
 * je alles ertussen moeten weggooien. Daarom deze lijst: de laatste acties van
 * deze set, met de rally erbij, en per actie de kwalificatie en de speler aan
 * te passen.
 *
 * De stand wordt hier niet aangeraakt. Verandert een correctie de uitslag van
 * een rally, dan staat dat erbij en corrigeert de invoerder de stand zelf via
 * 'Stand'. Stilzwijgend punten verschuiven is erger dan een cijfer dat even
 * niet klopt.
 */

import { useState, type ReactElement } from 'react';
import { rallyOutcomeFor } from '../../domain/rules';
import { playerLabel } from '../../domain/players';
import { ACTION_TYPE_LABELS, QUALITY_LABELS } from '../../domain/protocol';
import type { Action, Player, Rally } from '../../domain/types';
import { QUALITIES } from '../../domain/types';
import { useQuery, useStore } from '../StoreProvider';

export interface ActionFixSheetProps {
  setId: string;
  players: readonly Player[];
  onClose: () => void;
}

/** Zoveel acties terug kun je corrigeren; verder terug hoort in het dashboard thuis. */
const HISTORY = 20;

export function ActionFixSheet({ setId, players, onClose }: ActionFixSheetProps): ReactElement {
  const store = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const { data } = useQuery(
    async (instance) => {
      const [actions, rallies] = await Promise.all([
        instance.actions.listBySet(setId),
        instance.rallies.listBySet(setId),
      ]);
      const sequenceOf = new Map(rallies.map((rally) => [rally.id, rally.sequence]));
      const rallyById = new Map(rallies.map((rally) => [rally.id, rally]));
      return { actions, sequenceOf, rallyById };
    },
    [setId],
  );

  const byId = new Map(players.map((player) => [player.id, player]));

  const recent = (data?.actions ?? [])
    .slice()
    .sort((a, b) => {
      const rallyDiff =
        (data?.sequenceOf.get(a.rallyId) ?? 0) - (data?.sequenceOf.get(b.rallyId) ?? 0);
      return rallyDiff !== 0 ? rallyDiff : a.sequence - b.sequence;
    })
    .slice(-HISTORY)
    .reverse();

  const action = recent.find((entry) => entry.id === selected) ?? null;
  const rally = action ? (data?.rallyById.get(action.rallyId) ?? null) : null;

  /** Zegt of deze correctie de uitslag van de rally tegenspreekt. */
  function outcomeWarning(next: Action, forRally: Rally | null): string | null {
    if (!forRally || forRally.wonBy === null) return null;
    const outcome = rallyOutcomeFor(next);
    if (outcome === null || outcome === forRally.wonBy) return null;
    return `Deze rally staat op een punt voor ${
      forRally.wonBy === 'us' ? 'ons' : 'de tegenstander'
    }, maar deze actie wijst nu de andere kant op. De stand is niet aangepast — doe dat zo nodig via 'Stand'.`;
  }

  async function change(patch: Parameters<typeof store.actions.revise>[1]): Promise<void> {
    if (!action) return;
    const updated = await store.actions.revise(action.id, patch);
    setNote(outcomeWarning(updated, rally) ?? 'Aangepast.');
  }

  async function remove(): Promise<void> {
    if (!action) return;
    await store.actions.remove(action.id);
    setSelected(null);
    setNote('Actie verwijderd. De stand is niet aangepast.');
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Actie corrigeren">
      <div className="sheet__backdrop" onClick={onClose} />
      <div className="sheet__card sheet__card--wide">
        <h3>Actie corrigeren</h3>

        {action === null ? (
          <>
            <p className="sheet__principle">
              De laatste acties van deze set, nieuwste bovenaan. Tik er een aan om de kwalificatie
              of de speler te veranderen.
            </p>
            <ul className="fixlist">
              {recent.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="fixlist__item"
                    onClick={() => {
                      setSelected(entry.id);
                      setNote(null);
                    }}
                  >
                    <span className="fixlist__rally">
                      rally {data?.sequenceOf.get(entry.rallyId) ?? '?'}
                    </span>
                    <span className="fixlist__what">
                      {entry.team === 'us' ? 'wij' : 'zij'} · {ACTION_TYPE_LABELS[entry.type]}
                    </span>
                    <span className="fixlist__who">
                      {entry.playerId
                        ? (() => {
                            const player = byId.get(entry.playerId);
                            return player ? playerLabel(player) : `#${entry.playerNumber ?? '?'}`;
                          })()
                        : entry.playerNumber !== null
                          ? `#${entry.playerNumber}`
                          : '—'}
                    </span>
                    <span className={`fixlist__quality quality--${entry.quality}`}>
                      {QUALITY_LABELS[entry.quality]}
                    </span>
                  </button>
                </li>
              ))}
              {recent.length === 0 && <p className="panel__hint">Nog geen acties in deze set.</p>}
            </ul>
          </>
        ) : (
          <>
            <p className="sheet__principle">
              Rally {data?.sequenceOf.get(action.rallyId) ?? '?'} ·{' '}
              {action.team === 'us' ? 'wij' : 'zij'} · {ACTION_TYPE_LABELS[action.type]}
            </p>

            <h4 className="sheet__subtitle">Kwalificatie</h4>
            <div className="grid grid--qualities">
              {QUALITIES.map((quality) => (
                <button
                  key={quality}
                  type="button"
                  className={`quality quality--${quality} ${
                    action.quality === quality ? 'quality--selected' : ''
                  }`}
                  onClick={() => void change({ quality })}
                >
                  <span className="quality__label">{QUALITY_LABELS[quality]}</span>
                </button>
              ))}
            </div>

            {action.team === 'us' && (
              <>
                <h4 className="sheet__subtitle">Speler</h4>
                <div className="grid grid--players">
                  {players.map((player) => (
                    <button
                      key={player.id}
                      type="button"
                      className={`tile tile--player ${
                        action.playerId === player.id ? 'tile--selected' : ''
                      }`}
                      aria-label={playerLabel(player)}
                      onClick={() => void change({ playerId: player.id })}
                    >
                      <span className="tile__number">{player.number}</span>
                      <span className="tile__name">{player.name}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {note && <p className="sheet__rule">{note}</p>}

            <div className="sheet__actions">
              <button type="button" className="button button--ghost" onClick={() => setSelected(null)}>
                ← Lijst
              </button>
              <button type="button" className="button button--danger" onClick={() => void remove()}>
                Verwijderen
              </button>
            </div>
          </>
        )}

        <div className="sheet__actions">
          <button type="button" className="button" onClick={onClose}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
