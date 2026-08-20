/**
 * Koppelen van twee apparaten.
 *
 * Eenmalig per wedstrijd: de invoerder toont een code, de meelezer plakt hem en
 * geeft een antwoordcode terug. Daarna loopt alles vanzelf. De code kan via
 * elke weg heen en weer — appen, plakken, of het scherm laten zien.
 */

import { useState, type ReactElement } from 'react';
import type { DeviceRole } from '../../domain/types';
import type { PeerSession } from '../hooks/usePeerSession';

export interface PairingSheetProps {
  role: DeviceRole;
  session: PeerSession;
  onClose: () => void;
}

export function PairingSheet({ role, session, onClose }: PairingSheetProps): ReactElement {
  const [input, setInput] = useState('');
  const [copied, setCopied] = useState(false);

  async function copy(): Promise<void> {
    if (!session.code) return;
    try {
      await navigator.clipboard.writeText(session.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2_000);
    } catch {
      // Zonder klembordrechten blijft het tekstvak zelf gewoon te selecteren.
      setCopied(false);
    }
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Apparaten koppelen">
      <div className="sheet__backdrop" onClick={onClose} />
      <div className="sheet__card sheet__card--wide">
        <h3>{role === 'scorer' ? 'Meelezer koppelen' : 'Meelezen met de invoerder'}</h3>
        <p className="sheet__principle">
          Beide apparaten moeten op hetzelfde netwerk zitten — de wifi van de sporthal of een
          hotspot vanaf één van de telefoons. Internet is niet nodig.
        </p>

        {session.status === 'connected' ? (
          <p className="pairing__ok">
            Verbonden. {role === 'scorer' ? 'Alles wat je invoert gaat direct mee.' : 'Je ziet nu live mee.'}
          </p>
        ) : role === 'scorer' ? (
          <>
            <ol className="pairing__steps">
              <li>Maak een koppelcode en geef die aan de meelezer.</li>
              <li>Plak de antwoordcode die je terugkrijgt.</li>
            </ol>

            {!session.code ? (
              <button type="button" className="button button--primary" onClick={() => void session.invite()}>
                Koppelcode maken
              </button>
            ) : (
              <>
                <label className="field">
                  <span>Koppelcode — geef deze aan de meelezer</span>
                  <textarea readOnly value={session.code} rows={4} onFocus={(e) => e.currentTarget.select()} />
                </label>
                <button type="button" className="button" onClick={() => void copy()}>
                  {copied ? 'Gekopieerd' : 'Kopieer code'}
                </button>

                <label className="field">
                  <span>Antwoordcode van de meelezer</span>
                  <textarea
                    value={input}
                    rows={4}
                    placeholder="VS1…"
                    onChange={(event) => setInput(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={input.trim().length === 0}
                  onClick={() => void session.confirm(input)}
                >
                  Verbinden
                </button>
              </>
            )}
          </>
        ) : (
          <>
            <ol className="pairing__steps">
              <li>Plak de koppelcode van de invoerder.</li>
              <li>Geef de antwoordcode terug.</li>
            </ol>

            <label className="field">
              <span>Koppelcode van de invoerder</span>
              <textarea
                value={input}
                rows={4}
                placeholder="VS1…"
                onChange={(event) => setInput(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="button button--primary"
              disabled={input.trim().length === 0}
              onClick={() => void session.answer(input)}
            >
              Antwoordcode maken
            </button>

            {session.code && (
              <>
                <label className="field">
                  <span>Antwoordcode — geef deze terug aan de invoerder</span>
                  <textarea readOnly value={session.code} rows={4} onFocus={(e) => e.currentTarget.select()} />
                </label>
                <button type="button" className="button" onClick={() => void copy()}>
                  {copied ? 'Gekopieerd' : 'Kopieer code'}
                </button>
              </>
            )}
          </>
        )}

        {session.error && <p className="setup__error">{session.error}</p>}

        <div className="sheet__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}
