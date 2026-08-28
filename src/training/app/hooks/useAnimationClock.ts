/**
 * De klok achter een animatie.
 *
 * Staat apart omdat er twee schermen zijn die hem nodig hebben: de speler op de
 * oefeningpagina en de bewerker waarin je hem maakt. Wat je tijdens het tekenen
 * ziet, moet precies zijn wat er later afspeelt — dus mag het niet twee keer
 * geschreven worden.
 */

import { useEffect, useRef, useState } from 'react';
import { totalDuration } from '../../domain/animation';
import type { Animation } from '../../domain/types';

export interface ClockOptions {
  playing: boolean;
  speed?: number;
  /** Aangeroepen als een animatie die niet herhaalt aan het eind komt. */
  onEnd?: () => void;
}

export function useAnimationClock(
  animation: Animation,
  { playing, speed = 1, onEnd }: ClockOptions,
): [number, (time: number) => void] {
  const [time, setTime] = useState(0);
  const frame = useRef<number | null>(null);
  const previous = useRef<number | null>(null);
  const ended = useRef(onEnd);
  ended.current = onEnd;
  const duration = totalDuration(animation);

  useEffect(() => {
    if (!playing || duration === 0) {
      previous.current = null;
      return;
    }

    const step = (now: number) => {
      const last = previous.current ?? now;
      previous.current = now;
      setTime((current) => {
        const next = current + (now - last) * speed;
        if (next < duration) return next;
        if (animation.loop) return next % duration;
        ended.current?.();
        return duration;
      });
      frame.current = requestAnimationFrame(step);
    };

    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      previous.current = null;
    };
  }, [animation.loop, duration, playing, speed]);

  return [time, setTime];
}

/** Tijdstip waarop een fase begint; om ernaartoe te springen. */
export function startOfPhase(animation: Animation, index: number): number {
  return animation.phases
    .slice(0, Math.max(0, index))
    .reduce((sum, phase) => sum + Math.max(1, phase.durationMs), 0);
}
