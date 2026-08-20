/**
 * Lang indrukken. Gebruikt voor de kwalificatieknoppen: kort tikken legt vast,
 * lang indrukken toont het criterium uit het protocol (schermontwerp A).
 */

import { useCallback, useRef, type PointerEvent } from 'react';

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void;
  onPointerUp: () => void;
  onPointerLeave: () => void;
  onPointerCancel: () => void;
  onContextMenu: (event: { preventDefault: () => void }) => void;
}

export function useLongPress(onLongPress: () => void, ms = 450): LongPressHandlers {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  return {
    onPointerDown: () => {
      fired.current = false;
      clear();
      timer.current = setTimeout(() => {
        fired.current = true;
        onLongPress();
      }, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    // Op tablets opent lang indrukken anders het selectiemenu van de browser.
    onContextMenu: (event) => event.preventDefault(),
  };
}
