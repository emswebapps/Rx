// Generates the home-screen icons and the install-dialogue screenshots for the
// standalone "Rx" app.
//
// Run with: npm run icons
// Outputs are committed to public/, so CI never has to run this.
//
// The glyph is the lucide "pill" used for the Meds tab — this is a medication
// tracker, and the icon should say so at a glance on a home screen full of
// other icons. The ground stays the same calm indigo the Reset icon used, so
// it remains obviously distinct from the finance app's icon.

import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(OUT, { recursive: true });

const GROUND_TOP = '#1e1b4b';
const GROUND_BOTTOM = '#0f172a';
const GLYPH = '#c4b5fd';

// The app's own tokens, so a screenshot looks like the app rather than like a
// drawing of it.
const SURFACE = '#1e293b';
const BORDER = '#334155';
const TEXT = '#f1f5f9';
const SUBTLE = '#94a3b8';
const MUTED = '#64748b';
const ACCENT = '#6366f1';

/** The lucide "pill", as path data in its own 24-unit box. */
const PILL_PATHS = `<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/>
    <path d="m8.5 8.5 7 7"/>`;

/**
 * @param size    pixel size of the square
 * @param inset   fraction of the canvas left as padding around the glyph.
 *                Maskable icons get a bigger inset so the launcher can crop to
 *                a circle without clipping the glyph.
 * @param radius  corner radius; maskable icons are full-bleed squares.
 */
function svg(size, { inset = 0.24, radius = size * 0.22 } = {}) {
  const box = size * (1 - inset * 2);
  const scale = box / 24;
  const off = size * inset;
  // stroke-width is in glyph units — the scale transform does the rest, so this
  // is simply lucide's own weight, nudged up to stay solid at 192px.
  const stroke = 2.2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GROUND_TOP}"/>
      <stop offset="100%" stop-color="${GROUND_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)"/>
  <g transform="translate(${off} ${off}) scale(${scale})"
     fill="none" stroke="${GLYPH}" stroke-width="${stroke}"
     stroke-linecap="round" stroke-linejoin="round">
    ${PILL_PATHS}
  </g>
</svg>`;
}

/**
 * The screen a person actually sees on first launch, drawn to scale.
 *
 * Manifest screenshots are what Chromium shows in the richer install dialogue,
 * and without at least one narrow and one wide the dialogue falls back to the
 * one-line mini-infobar. Nothing here is invented: the wording is the app's own
 * first-run copy, and there are no medication names in it because a new install
 * has none.
 */
function screenPanel({ x, y, w, h, radius = 40 }) {
  const pad = w * 0.075;
  const cardTop = y + h * 0.2;
  const cardH = h * 0.42;
  const navH = h * 0.105;
  const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const tabs = ['Today', 'Meds', 'Supply', 'History', 'Settings'];

  const tabW = w / tabs.length;
  const nav = tabs.map((label, i) => {
    const cx = x + tabW * (i + 0.5);
    const on = i === 0;
    return `
    <circle cx="${cx}" cy="${y + h - navH * 0.62}" r="${w * 0.026}"
            fill="none" stroke="${on ? '#a5b4fc' : MUTED}" stroke-width="${w * 0.008}"/>
    <text x="${cx}" y="${y + h - navH * 0.2}" font-family="${font}" font-size="${w * 0.031}"
          font-weight="600" fill="${on ? '#a5b4fc' : MUTED}" text-anchor="middle">${label}</text>`;
  }).join('');

  return `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${GROUND_BOTTOM}"
        stroke="${radius ? BORDER : 'none'}" stroke-width="${radius ? 3 : 0}"/>

  <text x="${x + pad}" y="${y + h * 0.115}" font-family="${font}" font-size="${w * 0.088}"
        font-weight="800" fill="${TEXT}">Today</text>
  <text x="${x + pad}" y="${y + h * 0.155}" font-family="${font}" font-size="${w * 0.042}"
        fill="${SUBTLE}">Monday, 4 May</text>

  <rect x="${x + pad}" y="${cardTop}" width="${w - pad * 2}" height="${cardH}" rx="${w * 0.05}"
        fill="${SURFACE}" stroke="${BORDER}" stroke-width="2"/>

  <g transform="translate(${x + w / 2 - w * 0.045} ${cardTop + cardH * 0.1}) scale(${(w * 0.09) / 24})"
     fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    ${PILL_PATHS}
  </g>

  <text x="${x + w / 2}" y="${cardTop + cardH * 0.33}" font-family="${font}" font-size="${w * 0.039}"
        fill="${SUBTLE}" text-anchor="middle">Add what you take and when you</text>
  <text x="${x + w / 2}" y="${cardTop + cardH * 0.42}" font-family="${font}" font-size="${w * 0.039}"
        fill="${SUBTLE}" text-anchor="middle">take it, and this becomes a list</text>
  <text x="${x + w / 2}" y="${cardTop + cardH * 0.51}" font-family="${font}" font-size="${w * 0.039}"
        fill="${SUBTLE}" text-anchor="middle">you tick off each morning.</text>

  <rect x="${x + pad * 1.8}" y="${cardTop + cardH * 0.62}" width="${w - pad * 3.6}" height="${cardH * 0.15}"
        rx="${cardH * 0.05}" fill="${ACCENT}"/>
  <text x="${x + w / 2}" y="${cardTop + cardH * 0.725}" font-family="${font}" font-size="${w * 0.045}"
        font-weight="700" fill="#ffffff" text-anchor="middle">Add a medication</text>

  <rect x="${x + pad * 1.8}" y="${cardTop + cardH * 0.81}" width="${w - pad * 3.6}" height="${cardH * 0.15}"
        rx="${cardH * 0.05}" fill="${SURFACE}" stroke="${BORDER}" stroke-width="2"/>
  <text x="${x + w / 2}" y="${cardTop + cardH * 0.915}" font-family="${font}" font-size="${w * 0.036}"
        font-weight="700" fill="${TEXT}" text-anchor="middle">Just log that I took something</text>

  <line x1="${x}" y1="${y + h - navH}" x2="${x + w}" y2="${y + h - navH}" stroke="${BORDER}" stroke-width="2"/>
  ${nav}`;
}

/** Portrait: the phone screen, full bleed. */
function narrowScreenshot(w, h) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${GROUND_BOTTOM}"/>
  ${screenPanel({ x: 0, y: 0, w, h, radius: 0 })}
</svg>`;
}

/** Landscape: the same screen, sat on the brand ground beside the name. */
function wideScreenshot(w, h) {
  const font = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
  const panelH = h * 0.86;
  const panelW = panelH * (9 / 19.5);
  const panelX = w * 0.62;
  const panelY = (h - panelH) / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${GROUND_TOP}"/>
      <stop offset="100%" stop-color="${GROUND_BOTTOM}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>

  <g transform="translate(${w * 0.08} ${h * 0.3}) scale(${(h * 0.11) / 24})"
     fill="none" stroke="${GLYPH}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    ${PILL_PATHS}
  </g>
  <text x="${w * 0.08}" y="${h * 0.58}" font-family="${font}" font-size="${h * 0.1}"
        font-weight="900" fill="${TEXT}">Rx</text>
  <text x="${w * 0.08}" y="${h * 0.67}" font-family="${font}" font-size="${h * 0.036}"
        fill="${SUBTLE}">What you take, when you took it,</text>
  <text x="${w * 0.08}" y="${h * 0.72}" font-family="${font}" font-size="${h * 0.036}"
        fill="${SUBTLE}">and how much is left.</text>

  ${screenPanel({ x: panelX, y: panelY, w: panelW, h: panelH, radius: panelW * 0.09 })}
</svg>`;
}

const targets = [
  { file: 'icon-192.png', svg: svg(192, { radius: 192 * 0.22 }) },
  { file: 'icon-512.png', svg: svg(512, { radius: 512 * 0.22 }) },
  // Full-bleed squares with the glyph pulled well inside the safe zone. Both
  // sizes, because a launcher that only reads the 192 entry gets a maskable
  // one rather than falling back to a rounded square inside a circle.
  { file: 'icon-192-maskable.png', svg: svg(192, { inset: 0.3, radius: 0 }) },
  { file: 'icon-512-maskable.png', svg: svg(512, { inset: 0.3, radius: 0 }) },
  // iOS applies its own rounding and does not honour transparency.
  { file: 'apple-touch.png', svg: svg(180, { radius: 0 }) },
  { file: 'screenshot-narrow.png', svg: narrowScreenshot(1080, 1920) },
  { file: 'screenshot-wide.png', svg: wideScreenshot(1920, 1080) },
];

for (const { file, svg: source } of targets) {
  await sharp(Buffer.from(source))
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, file));
  console.log(`wrote public/${file}`);
}
