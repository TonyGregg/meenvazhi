import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';
import { localData } from './vite-plugin-local-data';

// The Android app is served from the root of the WebView's local origin, so it
// needs base '/'. The website is a project Pages site under /meenvazhi/.
const isNative = process.env.BUILD_TARGET === 'native';
const base = isNative ? '/' : (process.env.VITE_BASE ?? '/meenvazhi/');

export default defineConfig({
  base,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  plugins: [
    react(),
    localData(),
    VitePWA({
      // The native apps already carry the whole app shell, so the service worker
      // and manifest are only built for the website.
      disable: isNative,
      // Never swap the running app out from under someone mid-trip. The update
      // is offered; the person chooses when to take it.
      registerType: 'prompt',
      strategies: 'generateSW',
      includeAssets: ['icons/*.png', 'fonts/OFL.txt', 'geo/*.json'],
      manifest: {
        id: base,
        name: 'Meenvazhi',
        short_name: 'Meenvazhi',
        description:
          'INCOIS Potential Fishing Zone advisories as waypoints, with bearing and distance from your home port. Works offline at sea. Malayalam, Tamil and English.',
        lang: 'en',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#04283c',
        theme_color: '#04283c',
        categories: ['navigation', 'utilities', 'weather'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Zones', short_name: 'Zones', url: './?tab=zones' },
          { name: 'Compass', short_name: 'Compass', url: './?tab=compass' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,json}'],
        navigateFallback: 'index.html',
        // The coastline outline is part of the app shell, not data, so it is
        // precached rather than fetched.
        runtimeCaching: [
          {
            // NetworkFirst with a short timeout, deliberately not
            // StaleWhileRevalidate. At sea there is no network, so it should fail
            // fast to cache. In harbour we want genuinely today's advisory before
            // leaving. Silently rendering stale data is the wrong default when the
            // stale thing is a forecast someone steers by.
            urlPattern: /\/data\/pfz-latest\.(json|gpx|txt)$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pfz-data',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            urlPattern: /\/data\/history\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pfz-history',
              expiration: { maxEntries: 30, maxAgeSeconds: 400 * 24 * 60 * 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // Deliberate: map tiles are never cached. Bulk-caching OpenStreetMap
            // tiles for offline use is against the tile usage policy, and a
            // 350 nautical mile radius of open water is hundreds of megabytes of
            // featureless blue. NetworkOnly makes that impossible by accident.
            urlPattern: /^https:\/\/[a-c]?\.?tile\.openstreetmap\.org\//,
            handler: 'NetworkOnly',
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
