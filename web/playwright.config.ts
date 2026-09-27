import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests against the built app with a live service worker.
 *
 * These must run against `vite preview`, never the dev server: the service worker
 * is disabled in development, and the service worker is the whole point here.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173/meenvazhi/',
    ...devices['Pixel 7'],
  },
  webServer: {
    command: 'npm run build:full && npx vite preview --port 4173',
    url: 'http://localhost:4173/meenvazhi/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
