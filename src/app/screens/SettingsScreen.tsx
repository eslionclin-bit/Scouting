/**
 * Instellingen van dit apparaat.
 *
 * Vier knoppen, en bij elke staat wat hij kost en wat hij oplevert. Dat is geen
 * franje: de keuzes hier bepalen hoeveel tikken een rally kost, en dat is het
 * enige wat er tijdens een wedstrijd echt toe doet.
 */

import { useEffect, useState, type ReactElement } from 'react';
import type { CloudSync } from '../hooks/useCloudSync';
import {
  couplingLink,
  generateTeamCode,
  normalizeTeamCode,
  MIN_CODE_LENGTH,
} from '../../sync/cloudConfig';
import { OPPONENT_DETAILS, type AppSettings, type OpponentDetail } from '../../domain/settings';
import { useQuery, useStore } from '../StoreProvider';

export interface SettingsScreenProps {
  onExit: () => void;
  onOpenReference: () => void;
  /**
   * De koppeling wordt buiten dit scherm bijgehouden.
   *
   * Ze hoorde hier eerst thuis, en dat was fout: de sync liep dan alleen zolang
   * je naar de instellingen keek. Zodra je terug was in de wedstrijdenlijst
   * stopte hij, en dan lijkt het alsof er niets wordt overgezet — terecht, want
   * dat gebeurde ook niet.
   */
  cloud: CloudSync;
  teamCode: string | null;
  onSetTeamCode: (code: string | null) => Promise<void>;
  /** Alles wat op dit apparaat staat opnieuw naar de ploeg sturen. */
  onResend: () => Promise<number>;
  /**
   * Het adres van de sync-server.
   *
   * Zichtbaar en in te stellen, want ingebakken bij het bouwen is het
   * onzichtbaar: dan kun je niet zien of het klopt en moet je een bouw
   * afwachten om het te veranderen.
   */
  syncUrl: string | null;
  onSetSyncUrl: (url: string | null) => Promise<void>;
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

export function SettingsScreen({
  onExit,
  onOpenReference,
  cloud,
  teamCode,
  onSetTeamCode,
  onResend,
  syncUrl,
  onSetSyncUrl,
}: SettingsScreenProps): ReactElement {
  const store = useStore();
  const { data } = useQuery(async (instance) => instance.getSettings(), []);
  const [busy, setBusy] = useState(false);
  const [codeDraft, setCodeDraft] = useState(teamCode ?? '');
  const [resent, setResent] = useState<string | null>(null);
  const [urlDraft, setUrlDraft] = useState(syncUrl ?? '');
  /**
   * Het adres wijzigen terwijl er al één staat.
   *
   * Eerst wiste 'ander adres' het opgeslagen adres, waarna het ingebakken adres
   * er meteen voor in de plaats kwam — en dan lijkt de knop stuk, want er
   * verandert niets zichtbaars. Een adres dat je moet kunnen wijzigen, moet je
   * kunnen wijzigen; niet eerst weggooien en hopen.
   */
  const [editingServer, setEditingServer] = useState(false);

  /**
   * De koppeling doorgeven.
   *
   * Delen als het kan (dan kies je gewoon WhatsApp), anders naar het klembord.
   * Wat er níet meer gebeurt is iemand een code laten overtikken: dat ging op
   * een telefoon stil mis, want het klavier verandert er iets aan en de server
   * kan niet zien dat dat niet de bedoeling was.
   */
  const [shared, setShared] = useState<string | null>(null);

  async function shareCoupling(code: string): Promise<void> {
    const link = couplingLink(code, syncUrl ?? '');
    const share = (globalThis.navigator as { share?: (data: unknown) => Promise<void> }).share;

    if (typeof share === 'function') {
      try {
        await share.call(globalThis.navigator, {
          title: 'Volleybal scouting',
          text: 'Tik deze link aan op het andere apparaat; dan hoort het bij de ploeg.',
          url: link,
        });
        return;
      } catch {
        // Delen afgebroken of niet toegestaan: dan het klembord.
      }
    }

    try {
      await globalThis.navigator.clipboard.writeText(link);
      setShared('Link gekopieerd. Plak hem in een bericht aan jezelf of aan het team.');
    } catch {
      setShared(link);
    }
  }

  async function saveCode(code: string | null): Promise<void> {
    setBusy(true);
    try {
      await onSetTeamCode(code);
      setCodeDraft(code ?? '');
      setResent(null);
    } finally {
      setBusy(false);
    }
  }

  async function resend(): Promise<void> {
    setBusy(true);
    try {
      const queued = await onResend();
      setResent(
        queued === 0
          ? 'Er stond niets klaar om te versturen.'
          : `${queued} wijziging${queued === 1 ? '' : 'en'} klaargezet. Ze lopen mee zodra er verbinding is.`,
      );
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
          <>
            <p className="card__hint">
              Er is nog geen sync-server ingesteld. Zonder blijft alles op dit apparaat staan en
              koppel je alleen met een tablet in dezelfde zaal.
            </p>
            <p className="card__hint">
              Heb je een link gekregen van een apparaat dat al gekoppeld is? Tik die aan — dan is
              dit klaar. Ben je de eerste, vul dan het adres van je server in.
            </p>
            <label className="field">
              <span>Adres van de sync-server</span>
              <input
                type="url"
                inputMode="url"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={urlDraft}
                onChange={(event) => setUrlDraft(event.target.value)}
                placeholder="https://…workers.dev"
              />
            </label>
            <button
              type="button"
              className="button button--primary"
              disabled={busy || !/^https?:\/\/\S+$/.test(urlDraft.trim())}
              onClick={() => void onSetSyncUrl(urlDraft.trim())}
            >
              Adres bewaren
            </button>
          </>
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
                {/*
                  Drie getallen, en samen zeggen ze precies waar het hangt.
                  Zonder deze drie is 'het werkt niet' niet te onderscheiden van
                  'het is nog niet klaar', en dat verschil bepaalt volledig wat
                  je eraan moet doen — dat kostte een avond raden.
                */}
                <ul className="settings">
                  <li className="settings__item">
                    <div className="settings__text">
                      <strong>{cloudLabel(cloud.state.status)}</strong>
                      <span className="settings__hint">
                        {cloud.state.lastSyncAt
                          ? `Laatst bijgewerkt om ${new Date(cloud.state.lastSyncAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}.`
                          : 'Nog niet bijgewerkt sinds het koppelen.'}
                      </span>
                    </div>
                  </li>
                  <li className="settings__item">
                    <div className="settings__text">
                      <strong>Hier klaar om te versturen</strong>
                      <span className="settings__hint">
                        {cloud.state.pending === 0
                          ? 'Niets — alles van dit apparaat is weg.'
                          : `${cloud.state.pending} wijziging${cloud.state.pending === 1 ? '' : 'en'}.`}
                      </span>
                    </div>
                  </li>
                  <li className="settings__item">
                    <div className="settings__text">
                      <strong>Bij de ploeg opgeslagen</strong>
                      <span className="settings__hint">
                        {cloud.onServer === null
                          ? 'Nog niet kunnen kijken — geen verbinding gehad.'
                          : cloud.onServer === 0
                            ? 'Niets. Is dit het tweede apparaat, dan klopt de koppeling niet.'
                            : `${cloud.onServer} wijzigingen. Staan ze hier niet, tik dan hieronder op 'Nu synchroniseren'.`}
                      </span>
                    </div>
                  </li>
                </ul>

                <button
                  type="button"
                  className="button"
                  disabled={busy || cloud.state.status === 'syncing'}
                  onClick={() => void cloud.syncNow()}
                >
                  {cloud.state.status === 'syncing' ? 'Bezig…' : 'Nu synchroniseren'}
                </button>
                {/*
                  Een code die niet deugt is een echte fout en staat groot. De
                  rest — 'Failed to fetch' en zijn soortgenoten — is in een
                  sporthal de gewone gang van zaken, maar wel het eerste wat je
                  wilt weten als er iets níet klopt. Dus klein, onderaan.
                */}
                {cloud.state.lastError &&
                  (/code/i.test(cloud.state.lastError) ? (
                    <p className="setup__error">{cloud.state.lastError}</p>
                  ) : (
                    <p className="settings__hint">Laatste melding: {cloud.state.lastError}</p>
                  ))}

                {/*
                  Welk adres de app gebruikt. Zonder dit is 'Failed to fetch'
                  niet te onderscheiden van een adres dat verkeerd is ingesteld,
                  van een browser die het verzoek tegenhoudt, en van een server
                  die er niet is. Het adres is niet geheim — het staat in de
                  gebouwde app — en met dit ene regeltje kun je het zelf openen
                  en zien wat er gebeurt.
                */}
                {editingServer ? (
                  <>
                    <label className="field">
                      <span>Adres van de sync-server</span>
                      <input
                        type="url"
                        inputMode="url"
                        autoComplete="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={urlDraft}
                        onChange={(event) => setUrlDraft(event.target.value)}
                        placeholder="https://…workers.dev"
                      />
                    </label>
                    <div className="step__actions">
                      <button
                        type="button"
                        className="button button--primary"
                        disabled={busy || !/^https?:\/\/\S+$/.test(urlDraft.trim())}
                        onClick={() => {
                          void onSetSyncUrl(urlDraft.trim());
                          setEditingServer(false);
                        }}
                      >
                        Adres bewaren
                      </button>
                      <button
                        type="button"
                        className="button button--ghost"
                        onClick={() => {
                          setUrlDraft(syncUrl ?? '');
                          setEditingServer(false);
                        }}
                      >
                        Annuleren
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="settings__hint">
                    Server:{' '}
                    <a href={syncUrl ?? ''} target="_blank" rel="noreferrer">
                      {syncUrl}
                    </a>{' '}
                    — open dit adres eens in een tabblad; daar hoort te staan dat de sync-server
                    draait.{' '}
                    <button
                      type="button"
                      className="button button--ghost"
                      onClick={() => {
                        setUrlDraft(syncUrl ?? '');
                        setEditingServer(true);
                      }}
                    >
                      Ander adres
                    </button>
                  </p>
                )}

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

                <h3 className="sheet__subtitle">Een apparaat erbij</h3>
                <p className="card__hint">
                  Stuur de link naar jezelf of naar een teamgenoot en tik hem aan op het andere
                  apparaat. Dat is alles — niets over te tikken. Wie de link heeft, ziet de
                  wedstrijden van de ploeg, dus stuur hem niet in een groep waar de tegenstander
                  in zit.
                </p>
                <button
                  type="button"
                  className="button button--primary"
                  onClick={() => void shareCoupling(teamCode)}
                >
                  Koppeling doorsturen
                </button>
                {shared && <p className="card__hint">{shared}</p>}
                <p className="card__hint">
                  Ploegcode, voor als je hem ergens wilt bewaren: <code>{teamCode}</code>
                </p>

                <h3 className="sheet__subtitle">Ziet het andere apparaat niet alles?</h3>
                <p className="card__hint">
                  Wat al een keer verstuurd is, staat niet meer klaar — de app houdt een wachtrij
                  bij, geen kopie. Koppel je later aan een andere ploeg, of ging er ooit iets mis,
                  dan zet dit alles wat op dit apparaat staat opnieuw klaar. Dubbel kan het niet:
                  wat er al is, blijft zoals het is.
                </p>
                <button type="button" className="button" disabled={busy} onClick={() => void resend()}>
                  Alles opnieuw versturen
                </button>
                {resent && <p className="card__hint">{resent}</p>}
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

/**
 * De standen van de sync, in gewone taal.
 *
 * 'Er ging iets mis' stond hier eerst bij een mislukte ronde. Dat is de gewone
 * toestand in een sporthal zonder bereik, en het laat een app die precies doet
 * wat hij hoort te doen — wachten tot er verbinding is — stuk lijken. Er gaat
 * niets verloren zolang de outbox vol staat, en dat is wat er hoort te staan.
 */
function cloudLabel(status: string): string {
  switch (status) {
    case 'syncing':
      return 'Bezig met bijwerken';
    case 'offline':
    case 'error':
      return 'Wacht op verbinding';
    default:
      return 'Gekoppeld';
  }
}
