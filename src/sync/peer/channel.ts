/**
 * Een verbinding waarover berichten gaan.
 *
 * Wat eronder zit doet er niet toe: een WebRTC-datakanaal tussen twee tablets in
 * de sporthal, of een paar functies in het geheugen tijdens een test. Daardoor
 * is de meeleeslogica te testen zonder ooit een echt netwerk aan te raken.
 */

import { isPeerMessage, type PeerMessage } from './protocol';

export interface PeerChannel {
  readonly name: string;
  isOpen(): boolean;
  send(message: PeerMessage): void;
  onMessage(handler: (message: PeerMessage) => void): () => void;
  onClose(handler: () => void): () => void;
  close(): void;
}

/** Twee kanalen die aan elkaar geknoopt zijn; voor tests en voor één apparaat met twee vensters. */
export function createMemoryChannelPair(): [PeerChannel, PeerChannel] {
  const a = new MemoryChannel('a');
  const b = new MemoryChannel('b');
  a.connect(b);
  b.connect(a);
  return [a, b];
}

class MemoryChannel implements PeerChannel {
  private peer: MemoryChannel | null = null;
  private open = true;
  private readonly handlers = new Set<(message: PeerMessage) => void>();
  private readonly closeHandlers = new Set<() => void>();

  constructor(readonly name: string) {}

  connect(peer: MemoryChannel): void {
    this.peer = peer;
  }

  isOpen(): boolean {
    return this.open && this.peer !== null;
  }

  send(message: PeerMessage): void {
    if (!this.isOpen()) throw new Error('Kanaal is gesloten.');
    // Over een echte verbinding komt een bericht nooit synchroon aan; dat hier
    // nabootsen voorkomt tests die alleen slagen dankzij toevallige volgorde.
    const copy = JSON.parse(JSON.stringify(message)) as unknown;
    queueMicrotask(() => {
      if (this.peer?.open && isPeerMessage(copy)) this.peer.receive(copy);
    });
  }

  onMessage(handler: (message: PeerMessage) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onClose(handler: () => void): () => void {
    this.closeHandlers.add(handler);
    return () => this.closeHandlers.delete(handler);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    for (const handler of this.closeHandlers) handler();
    this.peer?.close();
  }

  private receive(message: PeerMessage): void {
    for (const handler of this.handlers) handler(message);
  }
}
