import { defineConfig } from '@playwright/test';

/**
 * MV3 extensions need a persistent context with the unpacked build loaded.
 * Tests run against `dist/`, so `npm run build` must run first.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
