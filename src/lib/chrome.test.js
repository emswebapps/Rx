// The app's ground colour is declared in four places, and they have to agree.
//
// `--bg` in index.css is what the app actually paints. `ThemeSync` writes the
// same value into the `theme-color` meta once React has mounted. Before that —
// and on an installed cold launch, where the OS draws a splash screen from the
// manifest before any of our code runs — the colour comes from index.html and
// manifest.webmanifest instead.
//
// When those drift, the seam is visible: a band above the app on first paint,
// or a splash screen that changes colour the moment the app takes over. That is
// exactly the defect the runtime `theme-color` sync was written to remove, and
// nothing else in the build would catch the static half of it, so it is checked
// here rather than by opening an installed copy on a phone.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

/** The first `--bg` in index.css: the `:root` one, which is dark mode. */
function darkGround() {
  const m = read('src/index.css').match(/--bg:\s*(#[0-9a-fA-F]{3,8})/);
  assert.ok(m, 'index.css declares a --bg');
  return m[1].toLowerCase();
}

test('the static theme-color matches the ground the app paints', () => {
  const m = read('index.html').match(/<meta name="theme-color" content="(#[0-9a-fA-F]{3,8})"/);
  assert.ok(m, 'index.html declares a theme-color');
  assert.equal(m[1].toLowerCase(), darkGround());
});

test('the manifest launches on the same colour the app paints', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  assert.equal(manifest.theme_color.toLowerCase(), darkGround());
  // The splash screen's ground. A different value here flashes on every cold
  // launch of the installed app, between the splash and the first paint.
  assert.equal(manifest.background_color.toLowerCase(), darkGround());
});

test('the ThemeSync pair is the same dark value, and a real light one', () => {
  const src = read('src/components/AuthGate.jsx');
  const m = src.match(/THEME_COLOR\s*=\s*\{\s*dark:\s*'(#[0-9a-fA-F]{3,8})',\s*light:\s*'(#[0-9a-fA-F]{3,8})'/);
  assert.ok(m, 'AuthGate declares a THEME_COLOR pair');
  assert.equal(m[1].toLowerCase(), darkGround());
  assert.notEqual(m[1].toLowerCase(), m[2].toLowerCase());
});
