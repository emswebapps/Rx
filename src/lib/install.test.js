import test from 'node:test';
import assert from 'node:assert/strict';

import { installState, isInstalled, isIos, SNOOZE_MS } from './install.js';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120';

test('an iPhone is an iPhone', () => {
  assert.equal(isIos({ ua: IPHONE }), true);
});

test('an iPad reporting itself as a Mac is still an iPad', () => {
  assert.equal(isIos({ ua: IPAD_AS_MAC, maxTouchPoints: 5 }), true);
});

test('an actual Mac is not an iPad', () => {
  assert.equal(isIos({ ua: IPAD_AS_MAC, maxTouchPoints: 0 }), false);
});

test('standalone display means it is already on a home screen', () => {
  assert.equal(isInstalled({ displayMode: 'standalone' }), true);
  assert.equal(isInstalled({ displayMode: 'browser' }), false);
});

test('iOS before display-mode still reports itself through navigator.standalone', () => {
  assert.equal(isInstalled({ displayMode: 'browser', navigatorStandalone: true }), true);
});

test('an installed copy is never asked to install again', () => {
  const s = installState({ ua: ANDROID, displayMode: 'standalone', canPrompt: true });
  assert.deepEqual(s, { installed: true, method: 'none', showBanner: false });
});

test('a held beforeinstallprompt is offered as a button', () => {
  const s = installState({ ua: ANDROID, canPrompt: true });
  assert.equal(s.method, 'prompt');
  assert.equal(s.showBanner, true);
});

test('iOS gets the share-sheet wording, because there is no API to offer', () => {
  const s = installState({ ua: IPHONE });
  assert.equal(s.method, 'ios-share');
  assert.equal(s.showBanner, true);
});

test('a browser that can neither prompt nor be told how is left alone', () => {
  const s = installState({ ua: ANDROID, canPrompt: false });
  assert.equal(s.method, 'none');
  assert.equal(s.showBanner, false);
});

test('"not now" is respected for a fortnight, then asked once more', () => {
  const now = 1_000_000_000_000;
  const fresh = installState({ ua: IPHONE, dismissedAt: now - 1000, now });
  assert.equal(fresh.showBanner, false);
  assert.equal(fresh.method, 'ios-share', 'still installable — just not shouting about it');

  const stale = installState({ ua: IPHONE, dismissedAt: now - SNOOZE_MS - 1, now });
  assert.equal(stale.showBanner, true);
});

test('a corrupt dismissal date does not suppress the banner for ever', () => {
  const s = installState({ ua: IPHONE, dismissedAt: 'yesterday' });
  assert.equal(s.showBanner, true);
});
