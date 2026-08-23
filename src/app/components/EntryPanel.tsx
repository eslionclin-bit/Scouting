/**
 * Het invoeren van één actie, stap voor stap.
 *
 * Eén vraag tegelijk, in gewone taal, en bovenin steeds wat er al staat. Tijdens
 * een rally is er geen tijd om een scherm vol knoppen af te zoeken; er hoort maar
 * één ding te zijn waar je op tikt.
 *
 * De volgorde volgt hoe je een rally ziet: wie → wat → waar → hoe.
 */

import { useState, type ReactElement } from 'react';
import { ATTACK_TEMPO_HINTS, ATTACK_TEMPO_LABELS, BLOCK_LABELS } from '../../domain/attack';
import {
  ACTION_TYPE_LABELS,
  QUALITY_LABELS,
  TEAM_SIDE_LABELS,
  tooltipFor,
} from '../../domain/protocol';
import { MAX_PLAYER_NUMBER, playerLabel } from '../../domain/players';
import { requiresZoneFrom } from '../../domain/rules';
import {
  ACTION_TYPES,
  ATTACK_TEMPOS,
  BLOCK_COUNTS,
  QUALITIES,
  type Player,
  type Quality,
  type TeamSide,
  type Zone,
} from '../../domain/types';
import { COURT_GRID, OPPONENT_GRID, ZONE_LABELS } from '../../domain/zones';
import { useLongPress } from '../hooks/useLongPress';
import { needsTargetStep, type EntryEvent, type EntryState } from '../entry/entryReducer';

export interface NewPlayerInput {
  team: TeamSide;
  number: number;
  name: string;
}

export interface EntryPanelProps {
  state: EntryState;
  dispatch: (event: EntryEvent) => void;
  ownPlayers: readonly Player[];
  opponentPlayers: readonly Player[];
  /**
   * Speler die zojuist de bal speelde en hem dus niet nog een keer mag raken.
   * Na een blok mag dat wél, dus dan staat hier niets.
   */
  blockedPlayerId?: string | null;
  /**
   * Hun rugnummers per zone, als hun opstelling bekend is. Alleen om te tonen:
   * 'positie 5 · #38' leest anders dan 'positie 5', en dat is precies het
   * verschil tussen een cijfer en een advies.
   */
  opponentPositions?: Record<Zone, number | null>;
  onCommit: (quality: Quality) => void;
  onExplain: (quality: Quality) => void;
  onAddPlayer: (input: NewPlayerInput) => Promise<void>;
}

export function EntryPanel(props: EntryPanelProps): ReactElement {
  const { state, dispatch, opponentPositions } = props;
  const players = state.team === 'us' ? props.ownPlayers : props.opponentPlayers;
  const chosen = state.playerId ? players.find((player) => player.id === state.playerId) : undefined;

  return (
    <div className="entry">
      <DraftBar {...props} chosen={chosen} />

      {state.step === 'player' && <PlayerStep {...props} players={players} />}
      {state.step === 'type' && <TypeStep state={state} dispatch={dispatch} chosen={chosen} />}
      {state.step === 'zone' &&
        (state.type === 'serve' ? (
          <ServeSpotStep state={state} dispatch={dispatch} />
        ) : (
          <ZoneStep state={state} dispatch={dispatch} />
        ))}
      {state.step === 'target' && (
        <ServeTargetStep state={state} dispatch={dispatch} opponentPositions={opponentPositions} />
      )}
      {state.step === 'attack' && <AttackStep state={state} dispatch={dispatch} />}
      {state.step === 'quality' && (
        <QualityStep state={state} onCommit={props.onCommit} onExplain={props.onExplain} />
      )}
    </div>
  );
}

/** Wat er tot nu toe is ingevuld. Elk gevuld stukje is aan te tikken om terug te gaan. */
function DraftBar({
  state,
  dispatch,
  chosen,
  opponentPositions,
}: EntryPanelProps & { chosen: Player | undefined }): ReactElement {
  const who = !state.playerChosen ? null : chosen ? playerLabel(chosen) : 'onbekende speler';

  return (
    <div className={`draft ${state.type === 'attack' ? 'draft--attack' : ''}`}>
      <button
        type="button"
        className={`draft__chip ${state.step === 'player' ? 'draft__chip--active' : ''}`}
        onClick={() => dispatch({ kind: 'goTo', step: 'player' })}
      >
        <span className="draft__label">Wie</span>
        <span className="draft__value">
          {TEAM_SIDE_LABELS[state.team]}
          {who ? ` · ${who}` : ''}
        </span>
      </button>

      <button
        type="button"
        className={`draft__chip ${state.step === 'type' ? 'draft__chip--active' : ''}`}
        disabled={!state.playerChosen}
        onClick={() => dispatch({ kind: 'goTo', step: 'type' })}
      >
        <span className="draft__label">Wat</span>
        <span className="draft__value">{state.type ? ACTION_TYPE_LABELS[state.type] : '—'}</span>
      </button>

      <button
        type="button"
        className={`draft__chip ${state.step === 'zone' ? 'draft__chip--active' : ''}`}
        disabled={!state.type}
        onClick={() => dispatch({ kind: 'goTo', step: 'zone' })}
      >
        <span className="draft__label">Waar</span>
        <span className="draft__value">
          {state.zoneFrom ? `zone ${state.zoneFrom}${state.zoneTo ? ` → ${state.zoneTo}` : ''}` : '—'}
        </span>
      </button>

      {needsTargetStep(state.type, state.team) && (
        <button
          type="button"
          className={`draft__chip ${state.step === 'target' ? 'draft__chip--active' : ''}`}
          disabled={state.zoneFrom === null}
          onClick={() => dispatch({ kind: 'goTo', step: 'target' })}
        >
          <span className="draft__label">Op wie</span>
          <span className="draft__value">
            {state.zoneTo === null
              ? '—'
              : `positie ${state.zoneTo}${
                  opponentPositions?.[state.zoneTo] != null
                    ? ` · #${opponentPositions[state.zoneTo]}`
                    : ''
                }`}
          </span>
        </button>
      )}

      {state.type === 'attack' && (
        <button
          type="button"
          className={`draft__chip ${state.step === 'attack' ? 'draft__chip--active' : ''}`}
          disabled={state.zoneFrom === null}
          onClick={() => dispatch({ kind: 'goTo', step: 'attack' })}
        >
          <span className="draft__label">Hoe</span>
          <span className="draft__value">
            {state.tempo === null && state.blockers === null
              ? '—'
              : [
                  state.tempo ? ATTACK_TEMPO_LABELS[state.tempo].toLowerCase() : null,
                  state.blockers === null ? null : BLOCK_LABELS[state.blockers].toLowerCase(),
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ')}
          </span>
        </button>
      )}

      <button
        type="button"
        className="draft__back"
        disabled={state.step === 'player'}
        onClick={() => dispatch({ kind: 'back' })}
      >
        ← Terug
      </button>
    </div>
  );
}

function StepCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}): ReactElement {
  return (
    <section className="step">
      <h2 className="step__title">{title}</h2>
      {hint && <p className="step__hint">{hint}</p>}
      {children}
    </section>
  );
}

function PlayerStep({
  state,
  dispatch,
  players,
  blockedPlayerId,
  onAddPlayer,
}: EntryPanelProps & { players: readonly Player[] }): ReactElement {
  const [adding, setAdding] = useState(false);

  return (
    <StepCard title="Wie speelde de bal?" hint="Kies eerst de kant van het net, dan de speler.">
      <div className="teamswitch" role="group" aria-label="Team">
        {(['us', 'them'] as const).map((side) => (
          <button
            key={side}
            type="button"
            className={`teamswitch__button ${state.team === side ? 'teamswitch__button--active' : ''}`}
            onClick={() => dispatch({ kind: 'team', team: side })}
            aria-pressed={state.team === side}
          >
            {TEAM_SIDE_LABELS[side]}
          </button>
        ))}
      </div>

      <div className="grid grid--players">
        {players.map((player) => {
          // Twee keer achter elkaar de bal raken mag niet; die speler staat er
          // dus wel, maar is niet te kiezen.
          const blocked = blockedPlayerId === player.id;
          return (
            <button
              key={player.id}
              type="button"
              className={`tile tile--player ${state.playerId === player.id ? 'tile--selected' : ''}`}
              aria-label={playerLabel(player)}
              disabled={blocked}
              title={blocked ? 'Speelde zojuist de bal' : undefined}
              onClick={() => dispatch({ kind: 'player', playerId: player.id })}
            >
              <span className="tile__number">{player.number}</span>
              <span className="tile__name">{player.name || '\u00a0'}</span>
            </button>
          );
        })}

        {/* Een invaller of een rugnummer dat je pas tijdens de wedstrijd ziet,
            hoort geen reden te zijn om de invoer te onderbreken. */}
        <button
          type="button"
          className="tile tile--add"
          aria-label="Speler toevoegen"
          onClick={() => setAdding(true)}
        >
          <span className="tile__number">+</span>
          <span className="tile__name">speler</span>
        </button>

        {state.team === 'them' && (
          <button
            type="button"
            className="tile tile--unknown"
            onClick={() => dispatch({ kind: 'player', playerId: null })}
          >
            Onbekend
          </button>
        )}
      </div>

      {players.length === 0 && (
        <p className="step__empty">
          {state.team === 'us'
            ? 'Nog geen spelers in dit team — voeg ze hier toe.'
            : 'Nog geen rugnummers van de tegenstander. Voeg ze toe als je ze ziet, of kies “onbekend”.'}
        </p>
      )}

      {adding && (
        <AddPlayerDialog
          team={state.team}
          onCancel={() => setAdding(false)}
          onSave={async (input) => {
            await onAddPlayer(input);
            setAdding(false);
          }}
        />
      )}
    </StepCard>
  );
}

function AddPlayerDialog({
  team,
  onSave,
  onCancel,
}: {
  team: TeamSide;
  onSave: (input: NewPlayerInput) => Promise<void>;
  onCancel: () => void;
}): ReactElement {
  const [number, setNumber] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(): Promise<void> {
    const parsed = Number(number);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_PLAYER_NUMBER) {
      setError(`Vul een rugnummer tussen 0 en ${MAX_PLAYER_NUMBER} in.`);
      return;
    }
    setBusy(true);
    try {
      // Bij de tegenstander ken je meestal alleen het nummer; dat is genoeg.
      // De naam blijft dan leeg, zodat er nergens '#7 #7' komt te staan.
      await onSave({ team, number: parsed, name: name.trim() });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Speler toevoegen">
      <div className="sheet__backdrop" onClick={onCancel} />
      <div className="sheet__card">
        <h3>Speler toevoegen</h3>
        <p className="sheet__principle">
          {team === 'us' ? 'Aan het eigen team.' : 'Aan de tegenstander — de naam mag leeg blijven.'}
        </p>

        <label className="field">
          <span>Rugnummer</span>
          <input
            inputMode="numeric"
            autoFocus
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            placeholder="7"
          />
        </label>
        <label className="field">
          <span>Naam</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={team === 'us' ? 'Noor' : 'optioneel'}
          />
        </label>

        {error && <p className="setup__error">{error}</p>}

        <div className="sheet__actions">
          <button type="button" className="button button--ghost" onClick={onCancel}>
            Annuleren
          </button>
          <button type="button" className="button button--primary" disabled={busy} onClick={() => void save()}>
            Toevoegen
          </button>
        </div>
      </div>
    </div>
  );
}

function TypeStep({
  state,
  dispatch,
  chosen,
}: {
  state: EntryState;
  dispatch: (event: EntryEvent) => void;
  chosen: Player | undefined;
}): ReactElement {
  const who = chosen ? playerLabel(chosen) : TEAM_SIDE_LABELS[state.team].toLowerCase();

  return (
    <StepCard title={`Wat deed ${who}?`}>
      <div className="grid grid--types">
        {ACTION_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            className={`tile tile--type ${state.type === type ? 'tile--selected' : ''} ${
              state.suggestion === type ? 'tile--suggested' : ''
            }`}
            // Zonder eigen label leest een schermlezer 'Serviceverwacht'.
            aria-label={ACTION_TYPE_LABELS[type]}
            onClick={() => dispatch({ kind: 'type', type })}
          >
            {ACTION_TYPE_LABELS[type]}
            {state.suggestion === type && <span className="tile__hint">verwacht</span>}
          </button>
        ))}
      </div>
    </StepCard>
  );
}

/**
 * Bij een service sta je achter de achterlijn, niet op een van de zes posities
 * in het veld. Drie plekken volstaan, en ze komen overeen met de zones waar de
 * server vandaan komt: links (5), midden (6) en rechts (1).
 */
const SERVE_SPOTS: { zone: Zone; label: string }[] = [
  { zone: 5, label: 'Links' },
  { zone: 6, label: 'Midden' },
  { zone: 1, label: 'Rechts' },
];

function ServeSpotStep({
  state,
  dispatch,
}: {
  state: EntryState;
  dispatch: (event: EntryEvent) => void;
}): ReactElement {
  return (
    <StepCard title="Waar vandaan geserveerd?" hint="Achter de achterlijn.">
      <div className="servespots">
        {SERVE_SPOTS.map((spot) => (
          <button
            key={spot.zone}
            type="button"
            className={`tile tile--spot ${state.zoneFrom === spot.zone ? 'tile--selected' : ''}`}
            onClick={() => dispatch({ kind: 'zoneFrom', zone: spot.zone })}
          >
            {spot.label}
          </button>
        ))}
      </div>
      <p className="step__hint servespots__net">↑ richting het net</p>
    </StepCard>
  );
}

function ZoneStep({
  state,
  dispatch,
}: {
  state: EntryState;
  dispatch: (event: EntryEvent) => void;
}): ReactElement {
  const required = state.type ? requiresZoneFrom(state.type) : false;
  const pickingLanding = state.zoneFrom !== null;

  return (
    <StepCard
      title={pickingLanding ? 'Waar kwam de bal terecht?' : 'Waar stond de speler?'}
      hint={
        pickingLanding
          ? 'Landingszone — alleen als je er tijd voor hebt.'
          : required
            ? 'Vertrekzone: waar de speler stond bij afzet. Verplicht bij een service en een aanval.'
            : 'Vertrekzone. Overslaan mag.'
      }
    >
      <div className="court" role="group" aria-label="Zones 1 tot en met 6">
        <div className="court__net" aria-hidden="true">net</div>
        {COURT_GRID.map((row, index) => (
          <div className="court__row" key={index}>
            {row.map((zone) => (
              <button
                key={zone}
                type="button"
                aria-label={ZONE_LABELS[zone]}
                title={ZONE_LABELS[zone]}
                className={[
                  'court__zone',
                  state.zoneFrom === zone ? 'court__zone--from' : '',
                  state.zoneTo === zone ? 'court__zone--to' : '',
                ].join(' ')}
                onClick={() =>
                  pickingLanding
                    ? dispatch({ kind: 'zoneTo', zone: state.zoneTo === zone ? null : (zone as Zone) })
                    : dispatch({ kind: 'zoneFrom', zone })
                }
              >
                {zone}
              </button>
            ))}
          </div>
        ))}
      </div>

      <div className="step__actions">
        {!required && !pickingLanding && (
          <button type="button" className="button" onClick={() => dispatch({ kind: 'skipZone' })}>
            Zone overslaan
          </button>
        )}
        {pickingLanding && (
          <button type="button" className="button" onClick={() => dispatch({ kind: 'zoneTo', zone: null })}>
            Geen landingszone
          </button>
        )}
      </div>
    </StepCard>
  );
}

/**
 * De enige extra vraag in de invoer, en alleen bij een aanval: welk tempo, en
 * hoeveel blok stond ertegenover. Twee tikken, en allebei over te slaan — een
 * invoerder die achterloopt op het spel is erger dan een aanval zonder tempo.
 *
 * Het tempo blijft staan als je het kiest; het blok brengt je door naar de
 * kwalificatie. Zo is het bij twee tikken klaar.
 */
function AttackStep({
  state,
  dispatch,
}: {
  state: EntryState;
  dispatch: (event: EntryEvent) => void;
}): ReactElement {
  return (
    <StepCard
      title="Hoe ging de aanval?"
      hint="Tempo, en hoeveel blok ertegenover stond. Overslaan mag."
    >
      <div className="grid grid--tempo" role="group" aria-label="Tempo">
        {ATTACK_TEMPOS.map((tempo) => (
          <button
            key={tempo}
            type="button"
            className={`tile tile--type ${state.tempo === tempo ? 'tile--selected' : ''}`}
            aria-label={ATTACK_TEMPO_LABELS[tempo]}
            aria-pressed={state.tempo === tempo}
            onClick={() => dispatch({ kind: 'tempo', tempo })}
          >
            <span className="tile__name">{ATTACK_TEMPO_LABELS[tempo]}</span>
            <span className="tile__hint">{ATTACK_TEMPO_HINTS[tempo]}</span>
          </button>
        ))}
      </div>

      <div className="grid grid--block" role="group" aria-label="Blok">
        {BLOCK_COUNTS.map((blockers) => (
          <button
            key={blockers}
            type="button"
            className={`tile tile--type ${state.blockers === blockers ? 'tile--selected' : ''}`}
            aria-label={BLOCK_LABELS[blockers]}
            onClick={() => dispatch({ kind: 'blockers', blockers })}
          >
            <span className="tile__name">{BLOCK_LABELS[blockers]}</span>
          </button>
        ))}
      </div>

      <div className="step__actions">
        <button type="button" className="button" onClick={() => dispatch({ kind: 'skipAttack' })}>
          Overslaan
        </button>
      </div>
    </StepCard>
  );
}

function QualityStep({
  state,
  onCommit,
  onExplain,
}: {
  state: EntryState;
  onCommit: (quality: Quality) => void;
  onExplain: (quality: Quality) => void;
}): ReactElement {
  return (
    <StepCard title="Hoe pakte het uit?" hint="Lang indrukken toont het criterium uit het protocol.">
      <div className="grid grid--qualities">
        {QUALITIES.map((quality) => (
          <QualityButton
            key={quality}
            quality={quality}
            type={state.type}
            onCommit={onCommit}
            onExplain={onExplain}
          />
        ))}
      </div>
    </StepCard>
  );
}

function QualityButton({
  quality,
  type,
  onCommit,
  onExplain,
}: {
  quality: Quality;
  type: EntryState['type'];
  onCommit: (quality: Quality) => void;
  onExplain: (quality: Quality) => void;
}): ReactElement {
  const longPress = useLongPress(() => onExplain(quality));
  const criterion = type ? tooltipFor(type, quality).criterion : undefined;

  return (
    <button
      type="button"
      className={`quality quality--${quality}`}
      title={criterion}
      onClick={() => onCommit(quality)}
      {...longPress}
    >
      <span className="quality__label">{QUALITY_LABELS[quality]}</span>
      {criterion && <span className="quality__criterion">{criterion}</span>}
    </button>
  );
}

/**
 * Op wie er geserveerd is.
 *
 * Hun helft, in de volgorde waarin je hem voor je ziet: hun voorlijn aan het
 * net, en hun zone 4 voor jou rechts. Staat hun opstelling erin, dan staat het
 * rugnummer in het vak — dan tik je op #38 en niet op 'positie 5'.
 *
 * Overslaan mag. Maar het is één tik, en het is de tik waar het serveeradvies
 * op rust én waar hun pass aan wordt opgehangen: die leidt de app hieruit af in
 * plaats van er apart om te vragen.
 */
function ServeTargetStep({
  state,
  dispatch,
  opponentPositions,
}: {
  state: EntryState;
  dispatch: (event: EntryEvent) => void;
  opponentPositions?: Record<Zone, number | null>;
}): ReactElement {
  return (
    <StepCard
      title="Op wie geserveerd?"
      hint="Hun helft, zoals je hem voor je ziet. Eén tik — hier hangt het serveeradvies aan."
    >
      <div className="court court--them" role="group" aria-label="Helft van de tegenstander">
        {OPPONENT_GRID.map((row, index) => (
          <div className="court__row" key={index}>
            {row.map((zone) => {
              const number = opponentPositions?.[zone] ?? null;
              return (
                <button
                  key={zone}
                  type="button"
                  aria-label={
                    number === null
                      ? `Positie ${zone}`
                      : `Positie ${zone}, rugnummer ${number}`
                  }
                  className={`court__zone ${state.zoneTo === zone ? 'court__zone--to' : ''}`}
                  onClick={() => dispatch({ kind: 'zoneTo', zone })}
                >
                  {number === null ? zone : `#${number}`}
                  {number !== null && <span className="court__zonenr">{zone}</span>}
                </button>
              );
            })}
          </div>
        ))}
        <div className="court__net" aria-hidden="true">
          net
        </div>
      </div>

      <div className="step__actions">
        <button
          type="button"
          className="button"
          onClick={() => dispatch({ kind: 'zoneTo', zone: null })}
        >
          Weet ik niet
        </button>
      </div>
    </StepCard>
  );
}
