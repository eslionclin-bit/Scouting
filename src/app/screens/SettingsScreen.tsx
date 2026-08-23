/**
 * Instellingen van dit apparaat.
 *
 * Vier knoppen, en bij elke staat wat hij kost en wat hij oplevert. Dat is geen
 * franje: de keuzes hier bepalen hoeveel tikken een rally kost, en dat is het
 * enige wat er tijdens een wedstrijd echt toe doet.
 */

import { useEffect, useState, type ReactElement } from 'react';
import { useCloudSync } from '../hooks/useCloudSync';
import { generateTeamCode, normalizeTeamCode, MIN_CODE_LENGTH } from '../../sync/cloudConfig';
import { OPPONENT_DETAILS, type AppSettings, type OpponentDetail } from '../../domain/settings';
import { useQuery, useStore } from '../StoreProvider';

export interface SettingsScreenProps {
  onExit: () => void;
  onOpenReference: () => void;
}

/** Alleen de ja/nee-instellingen; de tegenstander heeft drie standen. */
type BooleanKey = {
  [K in keyof AppSettings]: AppSettings[K] extends boolean ? K : never;
}[keyof AppSettings];

interface Toggle {
  key: BooleanKey;
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
    key: 'showOpponentNumbers',
    title: 'Rugnummers van de tegenstander tonen',
    hint: 'Zijn ze ingevuld, dan staan ze in het veld en kun je een actie aan een speler hangen in plaats van aan een zone.',
    on: 'in het veld',
    off: 'alleen zones',
  },
];

/** Hoeveel van de tegenstander de app vóórstelt om vast te leggen. */
const DETAILS: Record<OpponentDetail, { title: string; hint: string }> = {
  kern: {
    title: 'Alleen wat op ons afkomt',
    hint: 'Hun service en hun aanval. Hun verdediging staat al in de kwalificatie van onze eigen aanval — die hoeft er niet nog eens apart bij.',
  },
  pass: {
    title: 'Ook hun pass',
    hint: 'Twee tikken per ontvangen rally, en het levert op wie van hen slecht past. Daar serveer je de volgende keer naartoe.',
  },
  volledig: {
    title: 'Alles van hen',
    hint: 'Ook hun set-up en verdediging. Voor wie een dossier opbouwt en de tikken ervoor over heeft.',
  },
};

export function SettingsScreen({ onExit, onOpenReference }: SettingsScreenProps): ReactElement {
  const store = useStore();
  const { data } = useQuery(async (instance) => instance.getSettings(), []);
  const [busy, setBusy] = useState(false);

  // De ploegcode staat in de meta van dit apparaat; hij reist niet mee.
  const [teamCode, setTeamCode] = useState<string | null>(null);
  const [codeDraft, setCodeDraft] = useState('');
  const cloud = useCloudSync(teamCode);

  useEffect(() => {
    let cancelled = false;
    void store.getTeamCode().then((code) => {
      if (cancelled) return;
      setTeamCode(code);
      setCodeDraft(code ?? '');
    });
    return () => {
      cancelled = true;
    };
  }, [store]);

  async function saveCode(code: string | null): Promise<void> {
    setBusy(true);
    try {
      await store.setTeamCode(code);
      setTeamCode(code);
      setCodeDraft(code ?? '');
    } finally {
      setBusy(false);
    }
  }

  async function choose(patch: Partial<AppSettings>): Promise<void> {
    setBusy(true);
    try {
      await store.updateSettings(patch);
    } finally {
      setBusy(false);
    }
  }

  async function toggle(key: BooleanKey, value: boolean): Promise<void> {
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
        <h2>Online koppeling</h2>
        {!cloud.available ? (
          <p className="card__hint">
            Er is nog geen sync-server ingesteld. Zonder blijft alles op dit apparaat staan en
            koppel je alleen met een tablet in dezelfde zaal.
          </p>
        ) : (
          <>
            <p className="card__hint">
              Vul de ploegcode in en de wedstrijden van dit apparaat lopen vanzelf mee naar de
              andere apparaten van de ploeg, zodra er internet is. Zonder verbinding gaat het
              invoeren gewoon door — wat er nog niet weg is, blijft klaarstaan.
            </p>

            {teamCode === null ? (
              <>
                <label className="field">
                  <span>Ploegcode</span>
                  <input
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={codeDraft}
                    onChange={(event) => setCodeDraft(event.target.value)}
                    placeholder="van de trainer of de eerste tablet"
                  />
                </label>
                <p className="card__hint">
                  Is dit het eerste apparaat? Laat de app er dan een maken en schrijf hem op. Er zijn
                  geen accounts en er is geen wachtwoord-vergeten: de ploeg <em>is</em> de code, en
                  wie hem heeft ziet de wedstrijden. Minstens {MIN_CODE_LENGTH} tekens.
                </p>
                <div className="step__actions">
                  <button
                    type="button"
                    className="button button--primary"
                    disabled={busy || normalizeTeamCode(codeDraft).length < MIN_CODE_LENGTH}
                    onClick={() => void saveCode(normalizeTeamCode(codeDraft))}
                  >
                    Koppelen
                  </button>
                  <button
                    type="button"
                    className="button button--ghost"
                    disabled={busy}
                    onClick={() => setCodeDraft(generateTeamCode())}
                  >
                    Code voor mij maken
                  </button>
                </div>
              </>
            ) : (
              <>
                <ul className="settings">
                  <li className="settings__item">
                    <div className="settings__text">
                      <strong>{cloudLabel(cloud.state.status)}</strong>
                      <span className="settings__hint">
                        {cloud.state.lastSyncAt
                          ? `Laatst bijgewerkt om ${new Date(cloud.state.lastSyncAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}.`
                          : 'Nog niet bijgewerkt sinds het koppelen.'}
                        {cloud.state.pending > 0
                          ? ` ${cloud.state.pending} wijziging${cloud.state.pending === 1 ? '' : 'en'} staat nog klaar.`
                          : ' Alles is weggeschreven.'}
                      </span>
                    </div>
                  </li>
                </ul>
                {cloud.state.lastError && <p className="setup__error">{cloud.state.lastError}</p>}

                {/*
                  Het enige geval dat de server niet zelf kan zien: een typefout
                  in de code levert geen foutmelding op maar een andere, lege
                  ploeg. Dus benoemen we het hier.
                */}
                {cloud.onServer === 0 && (
                  <p className="card__hint">
                    Er staat nog niets onder deze code. Klopt hij? Zo niet, maak de koppeling los en
                    vul hem opnieuw in. Is dit het eerste apparaat van de ploeg, dan is dit precies
                    goed — wat je invoert loopt vanzelf mee.
                  </p>
                )}

                <p className="card__hint">
                  Ploegcode: <code>{teamCode}</code>. Vul dezelfde in op de andere apparaten.
                </p>
                <button
                  type="button"
                  className="button button--ghost"
                  disabled={busy}
                  onClick={() => void saveCode(null)}
                >
                  Koppeling losmaken
                </button>
              </>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h2>Van de tegenstander</h2>
        <p className="card__hint">
          De invoer is er om ons eigen spel te sturen. Wat zij doen telt mee voor zover wij er iets
          mee kunnen — en dat is minder dan het lijkt. Overslaan betekent alleen dat de app het niet
          vóórstelt: kiezen kan altijd, en een fout van hen kan sowieso niet verdwijnen.
        </p>
        <ul className="settings">
          {OPPONENT_DETAILS.map((level) => {
            const picked = (data?.opponentDetail ?? 'pass') === level;
            return (
              <li key={level} className="settings__item">
                <div className="settings__text">
                  <strong>{DETAILS[level].title}</strong>
                  <span className="settings__hint">{DETAILS[level].hint}</span>
                </div>
                <button
                  type="button"
                  role="radio"
                  aria-checked={picked}
                  aria-label={DETAILS[level].title}
                  disabled={busy || data === undefined}
                  className={`switch ${picked ? 'switch--on' : ''}`}
                  onClick={() => void choose({ opponentDetail: level })}
                >
                  <span className="switch__knob" aria-hidden="true" />
                  <span className="switch__label">{picked ? 'gekozen' : 'kiezen'}</span>
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

/** De vier standen van de sync, in gewone taal. */
function cloudLabel(status: string): string {
  switch (status) {
    case 'syncing':
      return 'Bezig met bijwerken';
    case 'offline':
      return 'Geen verbinding — het wacht';
    case 'error':
      return 'Er ging iets mis';
    default:
      return 'Gekoppeld';
  }
}
