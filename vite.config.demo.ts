/**
 * Bouw voor een demo in één bestand: alles inline, geen service worker.
 *
 * Bedoeld om de app te laten zien zonder installeren. De echte build
 * (`vite.config.ts`) blijft de PWA met service worker en manifest.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // De PWA-plugin staat uit, maar blijft wel geladen: hij levert de module die
  // main.tsx importeert, nu als lege huls.
  plugins: [react(), VitePWA({ disable: true })],
  define: { __DEMO__: 'true' },
  build: {
    target: 'es2022',
    outDir: 'dist-demo',
    assetsInlineLimit: 0,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
