/// <reference types="vite/client" />

/**
 * Het adres van de sync-server. Optioneel: zonder blijft de app puur lokaal
 * werken, en zegt het instellingenscherm dat ook.
 */
interface ImportMetaEnv {
  readonly VITE_SYNC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
