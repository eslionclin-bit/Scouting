/**
 * Voorkeuren van dit apparaat.
 *
 * Bewust apparaatgebonden en niet gesynchroniseerd: of het veld links of rechts
 * staat is een eigenschap van de tablet en van wie hem vasthoudt, niet van de
 * wedstrijd. Ze reizen dus ook niet mee naar de meelezer.
 */

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
  /** Passes van de tegenstander vastleggen: levert een lijstje op wie er slecht past. */
  trackOpponentReception: boolean;
  /** Rugnummers van de tegenstander tonen in het veld, als ze bekend zijn. */
  showOpponentNumbers: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  mirrored: false,
  askSetup: false,
  trackOpponentReception: true,
  showOpponentNumbers: true,
};

export function withDefaults(stored: Partial<AppSettings> | undefined): AppSettings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}
