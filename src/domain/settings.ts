/**
 * Voorkeuren van dit apparaat.
 *
 * Bewust apparaatgebonden en niet gesynchroniseerd: of het veld links of rechts
 * staat is een eigenschap van de tablet en van wie hem vasthoudt, niet van de
 * wedstrijd. Ze reizen dus ook niet mee naar de meelezer.
 */

/**
 * Hoeveel van de tegenstander leg je vast?
 *
 * De invoer is er om ons eigen spel te sturen. Wat de tegenstander doet telt
 * alleen mee voor zover wij er iets mee kunnen, en dat is minder dan het lijkt:
 *
 *  - **kern** — hun service en hun aanval. Meer heb je niet nodig: die twee
 *    komen op ons af, en de rest van hun rally staat al in de kwalificatie van
 *    onze eigen bal. Zeggen wij dat onze aanval de tegenstander in de problemen
 *    bracht, dan hoeft hun verdediging niet nog eens apart beoordeeld te worden.
 *  - **pass** — daarbovenop hun receptie. Kost twee tikken per ontvangen rally
 *    en levert op wie van hen slecht past; dat is waar je de volgende keer
 *    naartoe serveert.
 *  - **volledig** — ook hun set-up en verdediging. Voor wie een dossier over de
 *    tegenstander opbouwt en de tikken ervoor over heeft.
 *
 * Overslaan betekent alleen dat de app het niet vóórstelt: elke actie blijft met
 * één tik te kiezen, en een fout van hen kan sowieso niet verdwijnen — die
 * beëindigt de rally.
 */
export type OpponentDetail = 'kern' | 'pass' | 'volledig';

export const OPPONENT_DETAILS: readonly OpponentDetail[] = ['kern', 'pass', 'volledig'] as const;

export interface AppSettings {
  /** Veld links en de knoppen rechts (standaard), of omgekeerd voor linkshandigen. */
  mirrored: boolean;
  /**
   * Vraagt de app om de set-up?
   *
   * Standaard niet: de toets kost een derde van alle tikken en zegt weinig
   * zolang hij gewoon goed is. Hij blijft altijd met één tik te kiezen, en een
   * setfout kan sowieso niet verdwijnen — die beëindigt de rally.
   */
  askSetup: boolean;
  /** Hoeveel van de tegenstander de app vóórstelt om vast te leggen. */
  opponentDetail: OpponentDetail;
  /** Rugnummers van de tegenstander tonen in het veld, als ze bekend zijn. */
  showOpponentNumbers: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  mirrored: false,
  askSetup: false,
  opponentDetail: 'pass',
  showOpponentNumbers: true,
};

/**
 * Oudere opslag kende één ja/nee-vraag over de receptie van de tegenstander.
 * Die wordt hier vertaald, zodat een tablet die al ingesteld stond niet stilletjes
 * terugvalt op de standaard.
 */
interface LegacySettings {
  trackOpponentReception?: boolean;
}

export function withDefaults(stored: Partial<AppSettings> | undefined): AppSettings {
  const legacy = stored as (Partial<AppSettings> & LegacySettings) | undefined;
  const fromLegacy: Partial<AppSettings> =
    legacy?.opponentDetail === undefined && legacy?.trackOpponentReception !== undefined
      ? { opponentDetail: legacy.trackOpponentReception ? 'pass' : 'kern' }
      : {};
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}), ...fromLegacy };
}
