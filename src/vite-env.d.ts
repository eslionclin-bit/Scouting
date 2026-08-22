/// <reference types="vite/client" />

/**
 * De twee waarden waarmee de online koppeling wordt ingebouwd. Allebei
 * optioneel: zonder blijft de app puur lokaal werken.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
