/**
 * Het veld met alles wat erop staat.
 *
 * Eén component voor drie dingen: de animatie die speelt, de bewerker waarin je
 * poppetjes versleept, en het stilstaande plaatje op het trainingsblad en op
 * papier. Ze tekenen hetzelfde, dus ze horen hier bij elkaar te staan — anders
 * gaan ze uit elkaar lopen.
 *
 * De maten zijn meters. Een echt veld is 9 bij 18 met het net op 9; de ruimte
 * eromheen is de uitloop waar de service vandaan komt.
 */

import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { pointOn } from '../../domain/animation';
import type { Animation, Marker, Path, Point } from '../../domain/types';

export interface CourtProps {
  view: Animation['view'];
  markers: readonly Marker[];
  positions: Record<string, Point>;
  /** Lijnen die getekend worden: de paden van de lopende fase. */
  paths?: readonly Path[];
  /** Waar de paden vandaan komen; bij een animatie de beginposities. */
  pathOrigins?: Record<string, Point>;
  /** Sleepbaar maken, voor de bewerker. */
  onMove?: (markerId: string, point: Point) => void;
  selectedMarkerId?: string | null;
  onSelect?: (markerId: string) => void;
  className?: string;
}

interface Bounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function boundsFor(view: Animation['view']): Bounds {
  return view === 'half'
    ? { minX: -3.5, minY: -3.5, width: 16, height: 14 }
    : { minX: -2.5, minY: -3.5, width: 14, height: 25 };
}

export function Court({
  view,
  markers,
  positions,
  paths = [],
  pathOrigins,
  onMove,
  selectedMarkerId = null,
  onSelect,
  className,
}: CourtProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragging = useRef<string | null>(null);
  const bounds = boundsFor(view);

  const toField = useCallback((event: { clientX: number; clientY: number }): Point | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const box = svg.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    // Het viewBox schaalt met 'meet': de kleinste kant bepaalt, en wat overblijft
    // is marge aan weerszijden. Zonder die correctie loopt het slepen scheef.
    const scale = Math.min(box.width / bounds.width, box.height / bounds.height);
    const offsetX = (box.width - bounds.width * scale) / 2;
    const offsetY = (box.height - bounds.height * scale) / 2;
    return {
      x: (event.clientX - box.left - offsetX) / scale + bounds.minX,
      // Op het scherm loopt y naar beneden, op het veld naar het net toe.
      y: bounds.minY + bounds.height - (event.clientY - box.top - offsetY) / scale,
    };
  }, [bounds]);

  function startDrag(markerId: string) {
    return (event: ReactPointerEvent<SVGGElement>) => {
      onSelect?.(markerId);
      if (!onMove) return;
      dragging.current = markerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
    };
  }

  function onPointerMove(event: ReactPointerEvent<SVGGElement>) {
    const markerId = dragging.current;
    if (!markerId || !onMove) return;
    const point = toField(event);
    if (point) onMove(markerId, point);
  }

  function endDrag() {
    dragging.current = null;
  }

  return (
    <svg
      ref={svgRef}
      className={`court ${className ?? ''}`}
      viewBox={`${bounds.minX} ${-(bounds.minY + bounds.height)} ${bounds.width} ${bounds.height}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Veldopstelling"
    >
      {/* De y-as wordt gespiegeld zodat 'verder van ons vandaan' omhoog is. */}
      <g transform="scale(1,-1)">
        <rect
          x={bounds.minX}
          y={bounds.minY}
          width={bounds.width}
          height={bounds.height}
          className="court__floor"
        />
        <rect x={0} y={0} width={9} height={view === 'half' ? 9 : 18} className="court__lines" />
        <line x1={0} y1={6} x2={9} y2={6} className="court__line" />
        {view === 'full' && <line x1={0} y1={12} x2={9} y2={12} className="court__line" />}
        <line x1={-0.6} y1={9} x2={9.6} y2={9} className="court__net" />

        {paths.map((path, index) => {
          const from = pathOrigins?.[path.markerId] ?? positions[path.markerId];
          if (!from) return null;
          return <PathLine key={`${path.markerId}-${index}`} from={from} path={path} />;
        })}

        {markers.map((marker) => {
          const point = positions[marker.id];
          if (!point) return null;
          return (
            <g
              key={marker.id}
              className={`court__marker court__marker--${marker.kind} ${
                selectedMarkerId === marker.id ? 'is-selected' : ''
              } ${onMove ? 'is-draggable' : ''}`}
              transform={`translate(${point.x} ${point.y})`}
              onPointerDown={startDrag(marker.id)}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              <MarkerShape marker={marker} />
            </g>
          );
        })}
      </g>
    </svg>
  );
}

function MarkerShape({ marker }: { marker: Marker }) {
  const label = marker.label ? (
    // Terugdraaien, anders staat het bijschrift op zijn kop door de spiegeling.
    <text className="court__label" transform="scale(1,-1)" y={0.18}>
      {marker.label}
    </text>
  ) : null;

  switch (marker.kind) {
    case 'ball':
      return <circle r={0.32} className="court__ball" />;
    case 'target':
      return (
        <>
          <circle r={0.45} className="court__target" />
          {label}
        </>
      );
    case 'cone':
      return (
        <>
          <polygon points="-0.4,-0.35 0.4,-0.35 0,0.45" className="court__cone" />
          {label}
        </>
      );
    case 'opponent':
      return (
        <>
          <rect x={-0.55} y={-0.55} width={1.1} height={1.1} rx={0.2} className="court__body" />
          {label}
        </>
      );
    case 'coach':
      return (
        <>
          <circle r={0.6} className="court__body" />
          {label}
        </>
      );
    case 'cart':
      return (
        <>
          <rect x={-0.7} y={-0.45} width={1.4} height={0.9} rx={0.15} className="court__body" />
          {label}
        </>
      );
    default:
      return (
        <>
          <circle r={0.6} className="court__body" />
          {label}
        </>
      );
  }
}

function PathLine({ from, path }: { from: Point; path: Path }) {
  const points = [0, 0.25, 0.5, 0.75, 1].map((t) => pointOn(from, path, t));
  const d = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');
  return <path d={d} className={`court__path court__path--${path.kind}`} fill="none" />;
}
