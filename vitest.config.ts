import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // De worker van de deelserver hoort er ook bij: dat is gewone JavaScript
    // die met een nep-database te draaien is, en het is het stuk waar een fout
    // 'iedereen kan naar binnen' betekent.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'server/**/*.test.js'],
  },
});
