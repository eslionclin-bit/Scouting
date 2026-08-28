/// <reference types="vite/client" />

/**
 * Het adres van de sync-server. Optioneel: zonder blijft de app puur lokaal
 * werken, en zegt het instellingenscherm dat ook.
 */
interface ImportMetaEnv {
  readonly VITE_SYNC_URL?: string;
  /**
   * Het adres van de deelserver van de trainingsapp. Staat het er, dan vraagt
   * die app om inloggen; staat het er niet, dan blijft hij puur lokaal.
   */
  readonly VITE_TRAINING_SHARE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
