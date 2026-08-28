/**
 * De animatie afspelen.
 *
 * Twee manieren om ernaar te kijken, want ze horen bij twee momenten. Afspelen
 * is voor thuis: je wil zien hoe de oefening loopt. Stap voor stap is voor in de
 * zaal: je staat met een telefoon in je hand uit te leggen wat er gebeurt, en
 * dan wil je zelf bepalen wanneer de bal verder gaat.
 */

import { useState } from 'react';
import { frameAt, phaseStarts, totalDuration } from '../../domain/animation';
import { startOfPhase, useAnimationClock } from '../hooks/useAnimationClock';
import type { Animation } from '../../domain/types';
import { Court } from './Court';

export interface AnimationPlayerProps {
  animation: Animation;
  /** Begin meteen met afspelen; op een detailpagina prettig, in een lijst niet. */
  autoPlay?: boolean;
  compact?: boolean;
}

export function AnimationPlayer({ animation, autoPlay = false, compact = false }: AnimationPlayerProps) {
  const [playing, setPlaying] = useState(autoPlay);
  const [speed, setSpeed] = useState(1);
  const duration = totalDuration(animation);
  const [time, setTime] = useAnimationClock(animation, {
    playing,
    speed,
    onEnd: () => setPlaying(false),
  });

  const frame = frameAt({ ...animation, loop: false }, time);
  const starts = phaseStarts(animation);
  const phase = animation.phases[frame.phaseIndex];

  function goToPhase(index: number) {
    const clamped = Math.max(0, Math.min(animation.phases.length - 1, index));
    setPlaying(false);
    setTime(startOfPhase(animation, clamped));
  }

  return (
    <div className={`animation ${compact ? 'animation--compact' : ''}`}>
      <Court
        view={animation.view}
        markers={animation.markers}
        positions={frame.positions}
        paths={phase?.paths ?? []}
        pathOrigins={starts[frame.phaseIndex] ?? {}}
      />

      <div className="animation__bar">
        <button
          type="button"
          className="button button--icon"
          onClick={() => goToPhase(frame.phaseIndex - 1)}
          aria-label="Vorige fase"
        >
          ◀
        </button>
        <button
          type="button"
          className="button button--primary"
          onClick={() => {
            if (!playing && time >= duration) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? 'Pauze' : 'Afspelen'}
        </button>
        <button
          type="button"
          className="button button--icon"
          onClick={() => goToPhase(frame.phaseIndex + 1)}
          aria-label="Volgende fase"
        >
          ▶
        </button>
        <button
          type="button"
          className="button button--ghost"
          onClick={() => setSpeed(speed === 1 ? 0.5 : 1)}
          aria-label="Snelheid"
        >
          {speed === 1 ? '1×' : '½×'}
        </button>
      </div>

      <p className="animation__caption">
        <span className="animation__step">
          {frame.phaseIndex + 1}/{animation.phases.length}
        </span>{' '}
        {frame.caption}
      </p>
    </div>
  );
}

/**
 * Alle fases naast elkaar als stilstaande plaatjes.
 *
 * Dit is wat er op papier komt: een animatie die je niet kunt afspelen moet nog
 * steeds te lezen zijn, en een rij plaatjes met een regel eronder doet precies
 * wat een oefenboekje ook doet.
 */
export function AnimationStrip({ animation }: { animation: Animation }) {
  const starts = phaseStarts(animation);
  return (
    <ol className="strip">
      {animation.phases.map((phase, index) => (
        <li key={phase.id} className="strip__item">
          <Court
            view={animation.view}
            markers={animation.markers}
            positions={starts[index] ?? {}}
            paths={phase.paths}
            pathOrigins={starts[index] ?? {}}
          />
          <p>
            <span className="strip__number">{index + 1}</span> {phase.caption}
          </p>
        </li>
      ))}
    </ol>
  );
}
