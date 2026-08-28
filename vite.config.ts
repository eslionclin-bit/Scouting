import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Op GitHub Pages draait de app onder /<repo>/; lokaal gewoon op de root.
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // De app-shell wordt bij installatie gecachet; daarna start de app ook op
      // zonder enige verbinding — de wedstrijddata staat toch al in IndexedDB.
      registerType: 'autoUpdate',
      includeAssets: [
        'icon-192.png',
        'icon-512.png',
        'apple-touch-icon.png',
        'training.webmanifest',
      ],
      manifest: {
        name: 'Volleybal scouting',
        short_name: 'Scouting',
        description: 'Rally\'s actie voor actie vastleggen, ook zonder verbinding.',
        lang: 'nl',
        // Relatief, zodat de app ook werkt als hij niet op de root staat.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        // Een tablet ligt tijdens een wedstrijd in de lengte op tafel.
        orientation: 'landscape',
        background_color: '#0f172a',
        theme_color: '#0f172a',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    target: 'es2022',
    // Twee apps in dezelfde repo, elk met een eigen ingang: de scouting-app op
    // de root, de trainingsapp op /training.html. Ze delen de bouwstenen (ids,
    // klok, build, tests) maar verder niets — eigen database, eigen schermen,
    // eigen server.
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        training: fileURLToPath(new URL('./training.html', import.meta.url)),
      },
    },
  },
});
