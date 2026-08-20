/**
 * Koppeling tussen twee apparaten, vanuit React bekeken.
 *
 * De invoerder draait een `PeerHost` die deelt wat hij vastlegt; de meelezer
 * draait de gewone sync-engine met een `PeerClient` als transport. Alle logica
 * voor opnieuw proberen en niet-blokkeren zit dus al in code die er lag.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SyncEngine } from '../../sync/engine';
import type { PeerChannel } from '../../sync/peer/channel';
import { PeerClient } from '../../sync/peer/client';
import { PeerHost } from '../../sync/peer/host';
import { acceptInvite, createInvite, isWebRtcSupported } from '../../sync/peer/webrtc';
import type { DeviceRole } from '../../domain/types';
import { useStore } from '../StoreProvider';

export type PeerStatus = 'idle' | 'waiting' | 'connected' | 'error';

export interface PeerSession {
  supported: boolean;
  status: PeerStatus;
  /** Aantal gekoppelde apparaten (kant van de invoerder). */
  peers: number;
  /** Wanneer er voor het laatst iets binnenkwam (kant van de meelezer). */
  lastUpdateAt: string | null;
  error: string | null;
  /** Code die het andere apparaat moet krijgen. */
  code: string | null;
  /** Invoerder: maak een uitnodiging. */
  invite: () => Promise<void>;
  /** Invoerder: verwerk de antwoordcode van de meelezer. */
  confirm: (answerCode: string) => Promise<void>;
  /** Meelezer: beantwoord een uitnodiging. */
  answer: (inviteCode: string) => Promise<void>;
  disconnect: () => void;
}

/**
 * `matchId` mag null zijn: een meelezer die nog niets heeft, koppelt vanaf het
 * startscherm en haalt de hele wedstrijd pas daarna binnen.
 */
export function usePeerSession(matchId: string | null, role: DeviceRole): PeerSession {
  const store = useStore();
  const [status, setStatus] = useState<PeerStatus>('idle');
  const [peers, setPeers] = useState(0);
  const [lastUpdateAt, setLastUpdateAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);

  const hostRef = useRef<PeerHost | null>(null);
  const clientRef = useRef<PeerClient | null>(null);
  const engineRef = useRef<SyncEngine | null>(null);
  const pendingRef = useRef<{ complete?: (answer: string) => Promise<void>; cancel: () => void } | null>(null);

  // De host bestaat zolang dit apparaat invoert: ook zonder gekoppeld apparaat,
  // zodat een meelezer op elk moment kan aanhaken.
  useEffect(() => {
    if (role !== 'scorer' || matchId === null) return;
    const host = new PeerHost(store, { matchId });
    hostRef.current = host;
    const unsubscribe = host.subscribe((state) => {
      setPeers(state.peers);
      setStatus(state.peers > 0 ? 'connected' : 'idle');
    });
    return () => {
      unsubscribe();
      host.stop();
      hostRef.current = null;
    };
  }, [store, matchId, role]);

  const cleanupPending = useCallback(() => {
    pendingRef.current?.cancel();
    pendingRef.current = null;
  }, []);

  const disconnect = useCallback(() => {
    cleanupPending();
    engineRef.current?.stop();
    engineRef.current = null;
    clientRef.current?.close();
    clientRef.current = null;
    setCode(null);
    setStatus('idle');
  }, [cleanupPending]);

  useEffect(() => disconnect, [disconnect]);

  // De verbinding blijft staan als de meelezer naar een ander scherm gaat; alleen
  // waar hij naar kijkt verandert mee.
  useEffect(() => {
    engineRef.current?.setMatchScope(matchId);
  }, [matchId]);

  const attachAsViewer = useCallback(
    (channel: PeerChannel) => {
      const client = new PeerClient(store, channel, { matchId });
      const engine = new SyncEngine(store, client, { matchId, intervalMs: 20_000 });
      clientRef.current = client;
      engineRef.current = engine;

      client.onUpdate((at) => setLastUpdateAt(at));
      channel.onClose(() => setStatus('idle'));
      engine.start();
      setStatus('connected');
      setPeers(1);
    },
    [store, matchId],
  );

  const invite = useCallback(async () => {
    setError(null);
    if (!isWebRtcSupported()) {
      setError('Deze browser kan geen rechtstreekse verbinding maken.');
      setStatus('error');
      return;
    }
    try {
      cleanupPending();
      setStatus('waiting');
      const created = await createInvite();
      pendingRef.current = { complete: created.complete, cancel: created.cancel };
      setCode(created.code);
      void created.channel.then((channel) => {
        hostRef.current?.attach(channel);
        pendingRef.current = null;
        setCode(null);
      });
    } catch (cause) {
      setError(message(cause));
      setStatus('error');
    }
  }, [cleanupPending]);

  const confirm = useCallback(async (answerCode: string) => {
    setError(null);
    try {
      await pendingRef.current?.complete?.(answerCode);
    } catch (cause) {
      setError(message(cause));
      setStatus('error');
    }
  }, []);

  const answer = useCallback(
    async (inviteCode: string) => {
      setError(null);
      if (!isWebRtcSupported()) {
        setError('Deze browser kan geen rechtstreekse verbinding maken.');
        setStatus('error');
        return;
      }
      try {
        cleanupPending();
        setStatus('waiting');
        const accepted = await acceptInvite(inviteCode);
        pendingRef.current = { cancel: accepted.cancel };
        setCode(accepted.code);
        void accepted.channel.then((channel) => {
          attachAsViewer(channel);
          pendingRef.current = null;
        });
      } catch (cause) {
        setError(message(cause));
        setStatus('error');
      }
    },
    [attachAsViewer, cleanupPending],
  );

  return {
    supported: isWebRtcSupported(),
    status,
    peers,
    lastUpdateAt,
    error,
    code,
    invite,
    confirm,
    answer,
    disconnect,
  };
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
