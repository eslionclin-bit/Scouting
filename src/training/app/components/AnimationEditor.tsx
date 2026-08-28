/**
 * De animatiebewerker.
 *
 * Een animatie tekenen moet met een vinger op een telefoon kunnen, want daar
 * zit je als je een oefening opschrijft die je net bedacht hebt. Vandaar: geen
 * tijdlijn met sleutelframes, maar fases. Je zet iedereen neer, zegt wat er in
 * die fase gebeurt, en maakt dan de volgende fase — wat je niet aanraakt blijft
 * staan waar het stond.
 *
 * De pijlpunten zijn zelf ook te verslepen: een pad is een marker die ergens
 * heen gaat, en dat 'ergens' is een punt dat je pakt en verschuift.
 */

import { useState } from 'react';
import { newId } from '../../../domain/ids';
import { clampToField, emptyAnimation, phaseStarts } from '../../domain/animation';
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

const ARCS: Record<PathKind, number> = {
  run: 0,
  dribble: 0,
  pass: 1,
  set: 1.4,
  serve: 0.8,
  attack: 0.3,
};

export function AnimationEditor({
  animation,
  onChange,
}: {
  animation: Animation | null;
  onChange: (animation: Animation | null) => void;
}) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);

  if (!animation) {
    return (
      <div className="editor">
        <p className="muted">
          Nog geen animatie. Met een paar poppetjes en twee fases is vaak al duidelijk wat de
          bedoeling is.
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

  const index = Math.min(phaseIndex, animation.phases.length - 1);
  const phase = animation.phases[index];
  const starts = phaseStarts(animation);
  const positions = starts[index] ?? {};

  function update(next: Partial<Animation>) {
    onChange({ ...(animation as Animation), ...next });
  }

  function updatePhase(patch: Partial<Phase>) {
    update({
      phases: animation!.phases.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  }

  function addMarker(kind: MarkerKind) {
    const marker: Marker = {
      id: newId(),
      kind,
      label: kind === 'player' ? String(countOf(animation!, 'player') + 1) : '',
      slot: kind === 'player' ? countOf(animation!, 'player') + 1 : null,
    };
    const spot = { x: 4.5 - countOf(animation!, kind) * 0.8, y: 2 };
    update({
      markers: [...animation!.markers, marker],
      phases: animation!.phases.map((item, itemIndex) =>
        itemIndex === index ? { ...item, positions: { ...item.positions, [marker.id]: spot } } : item,
      ),
    });
    setSelected(marker.id);
  }

  function moveMarker(markerId: string, point: Point) {
    const clamped = clampToField(point, animation!.view);
    if (markerId.startsWith('doel:')) {
      const target = markerId.slice(5);
      updatePhase({
        paths: (phase?.paths ?? []).map((path) =>
          path.markerId === target ? { ...path, to: clamped } : path,
        ),
      });
      return;
    }
    updatePhase({ positions: { ...(phase?.positions ?? {}), [markerId]: clamped } });
  }

  const selectedMarker = animation.markers.find((marker) => marker.id === selected) ?? null;
  const selectedPath = phase?.paths.find((path) => path.markerId === selected) ?? null;

  // Pijlpunten als losse, sleepbare punten. Ze horen niet in de animatie zelf:
  // ze bestaan alleen zolang je aan het tekenen bent.
  const handles: Marker[] = (phase?.paths ?? []).map((path) => ({
    id: `doel:${path.markerId}`,
    kind: 'target',
    label: '',
    slot: null,
  }));
  const handlePositions = Object.fromEntries(
    (phase?.paths ?? []).map((path) => [`doel:${path.markerId}`, path.to]),
  );

  return (
    <div className="editor">
      <Court
        view={animation.view}
        markers={[...animation.markers, ...handles]}
        positions={{ ...positions, ...handlePositions }}
        paths={phase?.paths ?? []}
        pathOrigins={positions}
        onMove={moveMarker}
        selectedMarkerId={selected}
        onSelect={(markerId) => setSelected(markerId.replace(/^doel:/, ''))}
      />

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

      {selectedMarker && (
        <div className="editor__row editor__selected">
          <span className="filters__label">{MARKER_LABELS[selectedMarker.kind]}</span>
          <input
            className="input input--tiny"
            value={selectedMarker.label}
            aria-label="Opschrift"
            onChange={(event) =>
              update({
                markers: animation.markers.map((marker) =>
                  marker.id === selectedMarker.id ? { ...marker, label: event.target.value } : marker,
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
                onChange={(event) => {
                  const kind = event.target.value as PathKind;
                  updatePhase({
                    paths: (phase?.paths ?? []).map((path) =>
                      path.markerId === selectedMarker.id
                        ? { ...path, kind, arc: ARCS[kind] }
                        : path,
                    ),
                  });
                }}
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
                onClick={() =>
                  updatePhase({
                    paths: (phase?.paths ?? []).filter((path) => path.markerId !== selectedMarker.id),
                  })
                }
              >
                Beweging weg
              </button>
            </>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => {
                const from = positions[selectedMarker.id] ?? { x: 4.5, y: 3 };
                const kind: PathKind = selectedMarker.kind === 'ball' ? 'pass' : 'run';
                updatePhase({
                  paths: [
                    ...(phase?.paths ?? []),
                    { markerId: selectedMarker.id, to: { x: from.x, y: from.y + 3 }, kind, arc: ARCS[kind] },
                  ],
                });
              }}
            >
              Laat bewegen
            </button>
          )}
          <button
            type="button"
            className="button button--ghost"
            onClick={() => {
              update({
                markers: animation.markers.filter((marker) => marker.id !== selectedMarker.id),
                phases: animation.phases.map((item) => ({
                  ...item,
                  positions: Object.fromEntries(
                    Object.entries(item.positions).filter(([key]) => key !== selectedMarker.id),
                  ),
                  paths: item.paths.filter((path) => path.markerId !== selectedMarker.id),
                })),
              });
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
          >
            {itemIndex + 1}
          </button>
        ))}
        <button
          type="button"
          className="chip"
          onClick={() => {
            update({
              phases: [
                ...animation.phases,
                { id: newId(), caption: '', durationMs: 1000, positions: {}, paths: [] },
              ],
            });
            setPhaseIndex(animation.phases.length);
          }}
        >
          + fase
        </button>
      </div>

      {phase && (
        <div className="editor__row">
          <input
            className="input"
            placeholder="Wat gebeurt er in deze fase?"
            value={phase.caption}
            aria-label="Bijschrift"
            onChange={(event) => updatePhase({ caption: event.target.value })}
          />
          <input
            type="number"
            className="input input--tiny"
            min={200}
            max={5000}
            step={100}
            value={phase.durationMs}
            aria-label="Duur in milliseconden"
            onChange={(event) => updatePhase({ durationMs: Number(event.target.value) })}
          />
          <button
            type="button"
            className="button button--ghost"
            disabled={animation.phases.length <= 1}
            onClick={() => {
              update({ phases: animation.phases.filter((_, i) => i !== index) });
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
            onChange={(event) => update({ view: event.target.checked ? 'full' : 'half' })}
          />
          Heel veld (anders alleen onze helft)
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
    </div>
  );
}

function countOf(animation: Animation, kind: MarkerKind): number {
  return animation.markers.filter((marker) => marker.kind === kind).length;
}
