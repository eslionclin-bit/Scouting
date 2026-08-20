/** Korte meldingen met automatische afloop. */

import { useCallback, useRef, useState } from 'react';
import type { ToastMessage } from '../components/Toasts';

export function useToasts(timeoutMs = 4_000) {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setMessages((current) => current.filter((message) => message.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastMessage['tone'], text: string) => {
      const id = `toast-${counter.current++}`;
      setMessages((current) => [...current, { id, tone, text }]);
      setTimeout(() => dismiss(id), timeoutMs);
    },
    [dismiss, timeoutMs],
  );

  return { messages, push, dismiss };
}
