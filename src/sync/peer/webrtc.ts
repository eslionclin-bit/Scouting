/**
 * Verbinding tussen twee apparaten op hetzelfde lokale netwerk.
 *
 * Een browser kan geen server zijn, dus twee tablets vinden elkaar niet vanzelf.
 * Wat wél kan: een rechtstreekse WebRTC-verbinding, waarbij de twee apparaten
 * eenmalig een koppelcode uitwisselen. Er komt geen server aan te pas — ook geen
 * STUN-server, want die zou internet vereisen en op een lokaal netwerk niets
 * toevoegen. De kandidaten die overblijven zijn de adressen in het eigen
 * netwerk, precies wat de sporthal-hotspot uit de projectbrief oplevert.
 *
 * Het uitwisselen van de code doen mensen zelf (voorlezen, plakken, appen). Dat
 * is eenmalig per wedstrijd, en het houdt de app vrij van infrastructuur.
 */

import { isPeerMessage, type PeerMessage } from './protocol';
import type { PeerChannel } from './channel';

const CODE_PREFIX = 'VS1.';
const CHANNEL_LABEL = 'scouting';

export interface PeerInvite {
  /** Code voor het andere apparaat. */
  code: string;
  /** Antwoordcode van het andere apparaat verwerken. */
  complete(answerCode: string): Promise<void>;
  /** Wordt vervuld zodra de verbinding er echt is. */
  channel: Promise<PeerChannel>;
  cancel(): void;
}

export function isWebRtcSupported(): boolean {
  return typeof RTCPeerConnection !== 'undefined';
}

/** Kant van de invoerder: maakt de uitnodiging. */
export async function createInvite(): Promise<PeerInvite> {
  const connection = new RTCPeerConnection({ iceServers: [] });
  const dataChannel = connection.createDataChannel(CHANNEL_LABEL, { ordered: true });
  const channel = waitForOpenChannel(connection, dataChannel);

  const offer = await connection.createOffer();
  await connection.setLocalDescription(offer);
  await waitForIceGathering(connection);

  return {
    code: encode(connection.localDescription),
    complete: async (answerCode: string) => {
      await connection.setRemoteDescription(decode(answerCode));
    },
    channel,
    cancel: () => connection.close(),
  };
}

/** Kant van de meelezer: beantwoordt de uitnodiging. */
export async function acceptInvite(inviteCode: string): Promise<{
  code: string;
  channel: Promise<PeerChannel>;
  cancel(): void;
}> {
  const connection = new RTCPeerConnection({ iceServers: [] });
  const channel = new Promise<PeerChannel>((resolve, reject) => {
    connection.ondatachannel = (event) => {
      waitForOpenChannel(connection, event.channel).then(resolve, reject);
    };
  });

  await connection.setRemoteDescription(decode(inviteCode));
  const answer = await connection.createAnswer();
  await connection.setLocalDescription(answer);
  await waitForIceGathering(connection);

  return {
    code: encode(connection.localDescription),
    channel,
    cancel: () => connection.close(),
  };
}

/**
 * Alle kandidaten in één code stoppen ('vanilla ICE') in plaats van ze los na te
 * sturen: er is geen kanaal om ze over na te sturen zolang de verbinding er nog
 * niet is.
 */
function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();

  return new Promise((resolve) => {
    const done = (): void => {
      connection.removeEventListener('icegatheringstatechange', check);
      clearTimeout(timer);
      resolve();
    };
    const check = (): void => {
      if (connection.iceGatheringState === 'complete') done();
    };
    // Op sommige netwerken blijft het verzamelen hangen; wat er dan ligt is
    // meestal genoeg voor een verbinding binnen hetzelfde netwerk.
    const timer = setTimeout(done, 3_000);
    connection.addEventListener('icegatheringstatechange', check);
  });
}

function waitForOpenChannel(
  connection: RTCPeerConnection,
  dataChannel: RTCDataChannel,
): Promise<PeerChannel> {
  return new Promise((resolve, reject) => {
    const wrapped = new DataChannelAdapter(connection, dataChannel);
    if (dataChannel.readyState === 'open') {
      resolve(wrapped);
      return;
    }
    dataChannel.addEventListener('open', () => resolve(wrapped), { once: true });
    dataChannel.addEventListener(
      'error',
      () => reject(new Error('Verbinding met het andere apparaat mislukt.')),
      { once: true },
    );
  });
}

class DataChannelAdapter implements PeerChannel {
  readonly name = 'webrtc';

  private readonly handlers = new Set<(message: PeerMessage) => void>();
  private readonly closeHandlers = new Set<() => void>();

  constructor(
    private readonly connection: RTCPeerConnection,
    private readonly dataChannel: RTCDataChannel,
  ) {
    dataChannel.addEventListener('message', (event: MessageEvent<string>) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data) as unknown;
      } catch {
        return;
      }
      if (!isPeerMessage(parsed)) return;
      for (const handler of this.handlers) handler(parsed);
    });

    const closed = (): void => {
      for (const handler of this.closeHandlers) handler();
    };
    dataChannel.addEventListener('close', closed, { once: true });
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
        closed();
      }
    });
  }

  isOpen(): boolean {
    return this.dataChannel.readyState === 'open';
  }

  send(message: PeerMessage): void {
    if (!this.isOpen()) throw new Error('Verbinding is niet open.');
    this.dataChannel.send(JSON.stringify(message));
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
    this.dataChannel.close();
    this.connection.close();
  }
}

export function encode(description: RTCSessionDescription | RTCSessionDescriptionInit | null): string {
  if (!description) throw new Error('Geen verbindingsgegevens om te delen.');
  const payload = JSON.stringify({ type: description.type, sdp: description.sdp });
  return CODE_PREFIX + toBase64(payload);
}

export function decode(code: string): RTCSessionDescriptionInit {
  const trimmed = code.trim();
  if (!trimmed.startsWith(CODE_PREFIX)) throw new Error('Dit is geen geldige koppelcode.');
  try {
    const parsed = JSON.parse(fromBase64(trimmed.slice(CODE_PREFIX.length))) as {
      type?: string;
      sdp?: string;
    };
    if (parsed.type !== 'offer' && parsed.type !== 'answer') {
      throw new Error('Onbekend type koppelcode.');
    }
    return { type: parsed.type, sdp: parsed.sdp };
  } catch {
    throw new Error('De koppelcode is onvolledig of beschadigd.');
  }
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
