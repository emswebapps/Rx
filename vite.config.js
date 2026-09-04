import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// Rx ships to GitHub Pages at https://emswebapps.github.io/Rx/, which is the
// same ORIGIN as the finance app at /ExpenseTracker/. That is what lets the
// two share a Firebase Auth session, a localStorage cache and one Firestore
// document while living in separate repositories — the split cost no data.
//
// Manifest generation is off: public/manifest.webmanifest is a plain file that
// index.html links explicitly, which is far easier to reason about than an
// injected one.
export default defineConfig({
  base: '/Rx/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        // Rx is a single-page app on a path shared with another app's service
        // worker. Scoping the fallback keeps an offline launch inside Rx.
        navigateFallback: '/Rx/index.html',
        navigateFallbackDenylist: [/^\/ExpenseTracker\//],
      },
      includeAssets: ['icon-192.png', 'apple-touch.png'],
    }),
  ],
});
