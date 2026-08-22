/**
 * Instellingen van dit apparaat.
 *
 * Vier knoppen, en bij elke staat wat hij kost en wat hij oplevert. Dat is geen
 * franje: de keuzes hier bepalen hoeveel tikken een rally kost, en dat is het
 * enige wat er tijdens een wedstrijd echt toe doet.
 */

import { useState, type ReactElement } from 'react';
import type { AppSettings } from '../../domain/settings';
import { useQuery, useStore } from '../StoreProvider';

export interface SettingsScreenProps {
  onExit: () => void;
  onOpenReference: () => void;
}

interface Toggle {
  key: keyof AppSettings;
  title: string;
  hint: string;
  /** Wat er gebeurt als hij aanstaat, in de woorden van de invoerder. */
  on: string;
  off: string;
}

const TOGGLES: readonly Toggle[] = [
  {
    key: 'mirrored',
    title: 'Veld rechts, knoppen links',
    hint: 'Voor wie de tablet met links bedient.',
    on: 'veld rechts',
    off: 'veld links',
  },
  {
    key: 'askSetup',
    title: 'Set-up altijd vragen',
    hint: 'De toets kost ongeveer een derde van alle tikken. Staat dit uit, dan blijft hij met één tik te kiezen wanneer hij ertoe doet — en een setfout verdwijnt nooit, want die beëindigt de rally.',
    on: 'wordt gevraagd',
    off: 'alleen als je hem kiest',
  },
  {
    key: 'trackOpponentReception',
    title: 'Pass van de tegenstander vastleggen',
    hint: 'Kost twee tikken per ontvangen rally en levert op wie van hen slecht passt — dat is waar je de volgende keer naartoe serveert.',
    on: 'wordt gevraagd',
    off: 'overgeslagen',
  },
  {
    key: 'showOpponentNumbers',
    title: 'Rugnummers van de tegenstander tonen',
    hint: 'Zijn ze ingevuld, dan staan ze in het veld en kun je een actie aan een speler hangen in plaats van aan een zone.',
    on: 'in het veld',
    off: 'alleen zones',
  },
];

export function SettingsScreen({ onExit, onOpenReference }: SettingsScreenProps): ReactElement {
  const store = useStore();
  const { data } = useQuery(async (instance) => instance.getSettings(), []);
  const [busy, setBusy] = useState(false);

  async function toggle(key: keyof AppSettings, value: boolean): Promise<void> {
    setBusy(true);
    try {
      await store.updateSettings({ [key]: value });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <button type="button" className="button button--ghost" onClick={onExit}>
          ← Terug
        </button>
        <div>
          <h1>Instellingen</h1>
          <p className="dashboard__sub">
            Gelden voor deze tablet, niet voor de wedstrijd. Een tweede apparaat heeft dus zijn
            eigen keuzes.
          </p>
        </div>
      </header>

      <section className="card">
        <h2>Invoeren</h2>
        <ul className="settings">
          {TOGGLES.map((entry) => {
            const value = data?.[entry.key] ?? false;
            return (
              <li key={entry.key} className="settings__item">
                <div className="settings__text">
                  <strong>{entry.title}</strong>
                  <span className="settings__hint">{entry.hint}</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={value}
                  aria-label={entry.title}
                  disabled={busy || data === undefined}
                  className={`switch ${value ? 'switch--on' : ''}`}
                  onClick={() => void toggle(entry.key, !value)}
                >
                  <span className="switch__knob" aria-hidden="true" />
                  <span className="switch__label">{value ? entry.on : entry.off}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card">
        <h2>Referentiemateriaal</h2>
        <p className="card__hint">
          Wedstrijden van andere ploegen, ingelezen uit scoutbestanden. Ze bepalen waar de
          referentiekolom in de cijfertabellen op berust — en je zet ze één keer klaar, niet elke
          wedstrijd opnieuw. Daarom staat het hier en niet op het startscherm.
        </p>
        <button type="button" className="button button--primary" onClick={onOpenReference}>
          Referentiemateriaal beheren
        </button>
      </section>
    </div>
  );
}
