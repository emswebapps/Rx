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
        // The Firebase messaging worker is a service worker of its own,
        // registered separately at its own scope. Precaching it would hand
        // Workbox's cache a second worker to serve stale copies of, which is
        // exactly the file that must always come from the network.
        globIgnores: ['**/firebase-messaging-sw.js'],
      },
      // Precached explicitly, because an installed app that is opened offline
      // needs all of these and none of them is reachable from index.html's
      // module graph:
      //
      //   manifest.webmanifest  — without it a cold offline launch has no name,
      //                           no theme colour and no icons, and the browser
      //                           can report the app as no longer installable.
      //   the icons             — the 512s are what the install dialogue and
      //                           the Android splash screen draw from; the
      //                           maskable pair is what a launcher crops.
      //   apple-touch.png       — iOS reads it at add-to-home-screen time.
      includeAssets: [
        'manifest.webmanifest',
        'icon-192.png',
        'icon-192-maskable.png',
        'icon-512.png',
        'icon-512-maskable.png',
        'apple-touch.png',
      ],
    }),
  ],
});
