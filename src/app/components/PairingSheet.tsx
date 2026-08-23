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
        <h3>
          {role === 'scorer' ? 'Meelezer koppelen in de zaal' : 'Meelezen in de zaal'}
        </h3>
        <p className="sheet__principle">
          Voor twee apparaten die náást elkaar staan: de meelezer ziet elke bal meteen. Beide
          moeten op hetzelfde netwerk zitten — de wifi van de sporthal of een hotspot vanaf één van
          de telefoons. Internet is niet nodig.
        </p>
        <p className="step__hint">
          Wil je wedstrijden tussen apparaten laten meelopen die niet tegelijk aan staan? Dat is
          iets anders: dat is de <strong>ploegcode</strong>, onder Instellingen → Online koppeling.
        </p>

        {session.status === 'connected' ? (
          <p className="pairing__ok">
            Verbonden. {role === 'scorer' ? 'Alles wat je invoert gaat direct mee.' : 'Je ziet nu live mee.'}
          </p>
        ) : role === 'scorer' ? (
          <>
            <ol className="pairing__steps">
              <li>Maak een zaalcode en geef die aan de meelezer.</li>
              <li>Plak de antwoordcode die je terugkrijgt.</li>
            </ol>

            {!session.code ? (
              <button type="button" className="button button--primary" onClick={() => void session.invite()}>
                Zaalcode maken
              </button>
            ) : (
              <>
                <label className="field">
                  <span>Zaalcode — geef deze aan de meelezer</span>
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
              <li>Plak de zaalcode van de invoerder.</li>
              <li>Geef de antwoordcode terug.</li>
            </ol>

            <label className="field">
              <span>Zaalcode van de invoerder</span>
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

        {looksLikeTeamCode(input) ? (
          <p className="setup__error">
            Dat is een ploegcode, niet een zaalcode. Die vul je in onder Instellingen → Online
            koppeling; daarmee lopen wedstrijden mee tussen apparaten die niet tegelijk aan staan.
            Dit venster is voor twee apparaten naast elkaar in de zaal, en die code begint met
            'VS1'.
          </p>
        ) : (
          session.error && <p className="setup__error">{session.error}</p>
        )}

        <div className="sheet__actions">
          <button type="button" className="button button--ghost" onClick={onClose}>
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Iemand plakt hier de ploegcode.
 *
 * Dat is geen domme vergissing maar een voorspelbare: het startscherm zei
 * 'koppelen', dit venster zei 'koppelcode', en de online koppeling heet ook
 * koppelen. De namen zijn daarom uit elkaar getrokken — hier heet het een
 * zaalcode — en voor wie de oude gewoonte volgt zegt het scherm waar hij moet
 * zijn, in plaats van 'ongeldig'.
 *
 * Een zaalcode begint met 'VS1'; een ploegcode is een reeks woorden met cijfers
 * erachter. Die twee zijn niet te verwarren zodra je ernaar kijkt.
 */
function looksLikeTeamCode(value: string): boolean {
  return /^[a-z]+(-[a-z]+){2,}-\d{3,}$/i.test(value.trim());
}
