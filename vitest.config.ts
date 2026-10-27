import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: ['src/storage/**', 'src/ai/**', 'src/export/**'],
      exclude: ['src/**/*.test.ts', 'src/tests/**'],
      // The plan's P5-T3 target. `npm run test:coverage` fails below these, so the number
      // cannot quietly rot.
      thresholds: {
        'src/storage/**': { statements: 80, lines: 80 },
        'src/ai/**': { statements: 80, lines: 80 },
        'src/export/**': { statements: 80, lines: 80 },
      },
    },
  },
});
