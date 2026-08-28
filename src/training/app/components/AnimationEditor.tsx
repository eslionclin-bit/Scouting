/**
 * De animatiebewerker: een oefening laten bewegen.
 *
 * Twee dingen maken het verschil met een tekenprogramma. Ten eerste kun je hier
 * afspelen wat je maakt, op het veld waar je aan het werk bent — een animatie
 * die je niet ziet lopen, kun je ook niet beoordelen. Ten tweede is slepen
 * genoeg: in 'neerzetten' sleep je iemand naar zijn plek, in 'bewegen' sleep je
 * hem naar waar hij heen gaat en tekent de app de lijn.
 *
 * Het model eronder blijft fases: je zet iedereen neer, zegt wat er in die fase
 * gebeurt, en maakt dan de volgende. Wat je niet aanraakt, blijft staan waar het
 * stond — bij een oefening van zes fases hoef je dus niet zes keer alles in te
 * tikken.
 */

import { useEffect, useState } from 'react';
import { newId } from '../../../domain/ids';
import {
  addPhase,
  clampToField,
  clearMovement,
  defaultPathKind,
  duplicatePhase,
  emptyAnimation,
  frameAt,
  phaseStarts,
  removeMarker,
  removePhase,
  setMovement,
  setPathKind,
  freeSpot,
  totalDuration,
} from '../../domain/animation';
import { startOfPhase, useAnimationClock } from '../hooks/useAnimationClock';
import type { Animation, Marker, MarkerKind, PathKind, Phase, Point } from '../../domain/types';
import { Court } from './Court';

const MARKER_LABELS: Record<MarkerKind, string> = {
  player: 'Speler',
  opponent: 'Tegenstander',
  ball: 'Bal',
  cone: 'Pion',
  coach: 'Trainer',
  cart: 'Ballenkar',
  target: 'Doelvak',
};

const PATH_LABELS: Record<PathKind, string> = {
  run: 'Loopt',
  pass: 'Pass',
  set: 'Set-up',
  attack: 'Aanval',
  serve: 'Service',
  dribble: 'Bal meenemen',
};

type Mode = 'place' | 'move';

export function AnimationEditor({
  animation,
  onChange,
}: {
  animation: Animation | null;
  onChange: (animation: Animation | null) => void;
}) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('place');
  const [playing, setPlaying] = useState(false);

  const current = animation ?? emptyAnimation();
  const [time, setTime] = useAnimationClock(current, {
    playing,
    onEnd: () => setPlaying(false),
  });

  // Bij het bewerken springt de klok mee naar de fase waar je aan werkt, zodat
  // het veld laat zien wat je aanpast en niet waar de animatie toevallig stond.
  const index = Math.min(phaseIndex, Math.max(0, current.phases.length - 1));
  useEffect(() => {
    if (!playing) setTime(startOfPhase(current, index));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, playing, current.phases.length]);

  if (!animation) {
    return (
      <div className="editor">
        <p className="muted">
          Nog geen animatie. Met een paar poppetjes en twee fases is vaak al duidelijk wat de
          bedoeling is — en je ziet hem hier meteen lopen.
        </p>
        <button
          type="button"
          className="button button--primary"
          onClick={() =>
            onChange({
              ...emptyAnimation('half'),
              phases: [
                { id: newId(), caption: 'Beginopstelling', durationMs: 1200, positions: {}, paths: [] },
              ],
            })
          }
        >
          Animatie beginnen
        </button>
      </div>
    );
  }

  const phase = animation.phases[index];
  const starts = phaseStarts(animation);
  const editPositions = starts[index] ?? {};
  const frame = frameAt({ ...animation, loop: false }, time);
  const playingPhase = animation.phases[frame.phaseIndex];
  const positions = playing ? frame.positions : editPositions;
  const shownPaths = playing ? playingPhase?.paths ?? [] : phase?.paths ?? [];
  const pathOrigins = playing ? starts[frame.phaseIndex] ?? {} : editPositions;

  function update(next: Animation) {
    onChange(next);
  }

  function updatePhase(patch: Partial<Phase>) {
    if (!phase) return;
    update({
      ...animation!,
      phases: animation!.phases.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  function replacePhase(next: Phase) {
    update({
      ...animation!,
      phases: animation!.phases.map((item, i) => (i === index ? next : item)),
    });
  }

  function addMarker(kind: MarkerKind) {
    const players = animation!.markers.filter((item) => item.kind === 'player').length;
    const marker: Marker = {
      id: newId(),
      kind,
      label: kind === 'player' ? String(players + 1) : '',
      slot: kind === 'player' ? players + 1 : null,
    };
    const spot = freeSpot(Object.values(editPositions));
    update({
      ...animation!,
      markers: [...animation!.markers, marker],
      phases: animation!.phases.map((item, i) =>
        i === index ? { ...item, positions: { ...item.positions, [marker.id]: spot } } : item,
      ),
    });
    setSelected(marker.id);
  }

  /**
   * Wat slepen betekent, hangt af van de stand van de schakelaar: een poppetje
   * neerzetten waar hij begint, of hem naar zijn eindpunt trekken. De pijlpunt
   * zelf verschuiven mag altijd — die kán niets anders betekenen.
   */
  function onDrag(markerId: string, point: Point) {
    if (!phase) return;
    const spot = clampToField(point, animation!.view);

    if (markerId.startsWith('doel:')) {
      replacePhase(setMovement(phase, markerId.slice(5), spot));
      return;
    }

    if (mode === 'move') {
      const marker = animation!.markers.find((item) => item.id === markerId);
      replacePhase(
        setMovement(phase, markerId, spot, marker ? defaultPathKind(marker.kind) : undefined),
      );
      return;
    }

    updatePhase({ positions: { ...phase.positions, [markerId]: spot } });
  }

  const selectedMarker = animation.markers.find((marker) => marker.id === selected) ?? null;
  const selectedPath = phase?.paths.find((path) => path.markerId === selected) ?? null;

  // Pijlpunten als losse, sleepbare punten. Ze horen niet in de animatie zelf:
  // ze bestaan alleen zolang je aan het tekenen bent, en tijdens het afspelen
  // horen ze weg — dan kijk je naar de oefening, niet naar het gereedschap.
  const handles: Marker[] = playing
    ? []
    : (phase?.paths ?? []).map((path) => ({
        id: `doel:${path.markerId}`,
        kind: 'target',
        label: '',
        slot: null,
      }));
  const handlePositions = playing
    ? {}
    : Object.fromEntries((phase?.paths ?? []).map((path) => [`doel:${path.markerId}`, path.to]));

  const duration = totalDuration(animation);

  return (
    <div className="editor">
      <Court
        view={animation.view}
        markers={[...animation.markers, ...handles]}
        positions={{ ...positions, ...handlePositions }}
        paths={shownPaths}
        pathOrigins={pathOrigins}
        {...(playing ? {} : { onMove: onDrag })}
        selectedMarkerId={playing ? null : selected}
        onSelect={(markerId) => setSelected(markerId.replace(/^doel:/, ''))}
      />

      <div className="editor__play">
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            if (!playing) setTime(0);
            setPlaying(!playing);
          }}
          disabled={duration === 0}
        >
          {playing ? 'Pauze' : 'Afspelen'}
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            setPlaying(false);
            setTime(startOfPhase(animation, index));
          }}
          disabled={playing}
        >
          Fase tonen
        </button>
        <span className="muted">
          {playing
            ? `${frame.phaseIndex + 1}/${animation.phases.length} · ${playingPhase?.caption ?? ''}`
            : `${Math.round(duration / 100) / 10} sec in totaal`}
        </span>
      </div>

      {!playing && (
        <>
          <div className="editor__modes" role="group" aria-label="Wat slepen doet">
            <button
              type="button"
              className={`chip ${mode === 'place' ? 'is-active' : ''}`}
              onClick={() => setMode('place')}
              aria-pressed={mode === 'place'}
            >
              Neerzetten
            </button>
            <button
              type="button"
              className={`chip ${mode === 'move' ? 'is-active' : ''}`}
              onClick={() => setMode('move')}
              aria-pressed={mode === 'move'}
            >
              Laten bewegen
            </button>
            <span className="muted">
              {mode === 'place'
                ? 'Sleep iemand naar de plek waar hij in deze fase begint.'
                : 'Sleep iemand naar waar hij in deze fase heen gaat; de lijn komt vanzelf.'}
            </span>
          </div>

          <div className="editor__row">
            <span className="filters__label">Erbij</span>
            <div className="chips">
              {(Object.keys(MARKER_LABELS) as MarkerKind[]).map((kind) => (
                <button key={kind} type="button" className="chip" onClick={() => addMarker(kind)}>
                  + {MARKER_LABELS[kind]}
                </button>
              ))}
            </div>
          </div>

          {selectedMarker && phase && (
            <div className="editor__row editor__selected">
              <span className="filters__label">{MARKER_LABELS[selectedMarker.kind]}</span>
              <input
                className="input input--tiny"
                value={selectedMarker.label}
                aria-label="Opschrift"
                onChange={(event) =>
                  update({
                    ...animation,
                    markers: animation.markers.map((marker) =>
                      marker.id === selectedMarker.id
                        ? { ...marker, label: event.target.value }
                        : marker,
                    ),
                  })
                }
              />
              {selectedPath ? (
                <>
                  <select
                    className="input input--small"
                    value={selectedPath.kind}
                    aria-label="Soort beweging"
                    onChange={(event) =>
                      replacePhase(setPathKind(phase, selectedMarker.id, event.target.value as PathKind))
                    }
                  >
                    {(Object.keys(PATH_LABELS) as PathKind[]).map((kind) => (
                      <option key={kind} value={kind}>
                        {PATH_LABELS[kind]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="button button--ghost"
                    onClick={() => replacePhase(clearMovement(phase, selectedMarker.id))}
                  >
                    Blijft staan
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="button"
                  onClick={() => {
                    const from = editPositions[selectedMarker.id] ?? { x: 4.5, y: 3 };
                    replacePhase(
                      setMovement(
                        phase,
                        selectedMarker.id,
                        clampToField({ x: from.x, y: from.y + 3 }, animation.view),
                        defaultPathKind(selectedMarker.kind),
                      ),
                    );
                    setMode('move');
                  }}
                >
                  Laat bewegen
                </button>
              )}
              <button
                type="button"
                className="button button--ghost"
                onClick={() => {
                  update(removeMarker(animation, selectedMarker.id));
                  setSelected(null);
                }}
              >
                Weghalen
              </button>
            </div>
          )}

          <div className="editor__phases">
            {animation.phases.map((item, itemIndex) => (
              <button
                key={item.id}
                type="button"
                className={`chip ${itemIndex === index ? 'is-active' : ''}`}
                onClick={() => setPhaseIndex(itemIndex)}
                title={item.caption}
              >
                {itemIndex + 1}
              </button>
            ))}
            <button
              type="button"
              className="chip"
              onClick={() => {
                update(addPhase(animation, index, newId()));
                setPhaseIndex(index + 1);
              }}
            >
              + fase
            </button>
            <button
              type="button"
              className="chip"
              onClick={() => {
                update(duplicatePhase(animation, index, newId()));
                setPhaseIndex(index + 1);
              }}
            >
              Fase kopiëren
            </button>
          </div>

          {phase && (
            <div className="editor__row">
              <input
                className="input"
                placeholder={`Wat gebeurt er in fase ${index + 1}?`}
                value={phase.caption}
                aria-label={`Bijschrift van fase ${index + 1}`}
                onChange={(event) => updatePhase({ caption: event.target.value })}
              />
              <label className="filters__number">
                Duurt
                <input
                  type="number"
                  className="input input--tiny"
                  min={0.2}
                  max={6}
                  step={0.1}
                  value={Math.round(phase.durationMs / 100) / 10}
                  aria-label={`Duur van fase ${index + 1} in seconden`}
                  onChange={(event) =>
                    updatePhase({ durationMs: Math.round(Number(event.target.value) * 1000) })
                  }
                />
                sec
              </label>
              <button
                type="button"
                className="button button--ghost"
                disabled={animation.phases.length <= 1}
                onClick={() => {
                  update(removePhase(animation, index));
                  setPhaseIndex(Math.max(0, index - 1));
                }}
              >
                Fase weg
              </button>
            </div>
          )}

          <div className="editor__row">
            <label className="checkline">
              <input
                type="checkbox"
                checked={animation.view === 'full'}
                onChange={(event) =>
                  update({ ...animation, view: event.target.checked ? 'full' : 'half' })
                }
              />
              Heel veld (anders alleen onze helft)
            </label>
            <label className="checkline">
              <input
                type="checkbox"
                checked={animation.loop}
                onChange={(event) => update({ ...animation, loop: event.target.checked })}
              />
              Blijft herhalen
            </label>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => {
                if (confirm('De hele animatie weghalen?')) onChange(null);
              }}
            >
              Animatie weg
            </button>
          </div>
        </>
      )}
    </div>
  );
}
