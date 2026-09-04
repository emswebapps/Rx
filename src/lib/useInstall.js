// The install offer, wired to the browser.
//
// `install.js` decides *what* to offer from a bag of plain values; this holds
// the one piece of state that can't be derived — the `beforeinstallprompt`
// event, which is fired once, must be captured before its default is prevented,
// and can only be replayed from the same object.
//
// The listener is attached at module load rather than in an effect on purpose.
// Chromium fires the event during the first load, often before React has
// mounted anything, and an effect that arrives afterwards catches nothing at
// all — which is why an install button wired the obvious way never appears.

import { useCallback, useEffect, useState } from 'react';
import { installState } from './install.js';

// Device-specific, so it is deliberately not in `settings`: that slice is
// synced through Firestore and shared with the finance app, and "I dismissed
// this on my laptop" must not silence the banner on the phone that could
// actually install it.
const DISMISS_KEY = 'rx_install_dismissed_at';

let deferred = null;
const listeners = new Set();

function announce() {
  for (const fn of listeners) fn();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Without this Chromium shows its own mini-infobar, and the event cannot be
    // replayed later from a button of ours.
    e.preventDefault();
    deferred = e;
    announce();
  });

  // Installed from our button, from the browser menu, or on another tab. Either
  // way the offer is spent and must stop being made.
  window.addEventListener('appinstalled', () => {
    deferred = null;
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* blocked store */ }
    announce();
  });
}

function readDismissed() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function matches(query) {
  try {
    return window.matchMedia(query).matches;
  } catch {
    return false;
  }
}

function currentDisplayMode() {
  if (matches('(display-mode: standalone)')) return 'standalone';
  if (matches('(display-mode: fullscreen)')) return 'fullscreen';
  if (matches('(display-mode: minimal-ui)')) return 'minimal-ui';
  return 'browser';
}

/**
 * @returns {{
 *   installed: boolean,
 *   method: 'prompt'|'ios-share'|'none',
 *   showBanner: boolean,
 *   install: () => Promise<boolean>,
 *   dismiss: () => void,
 * }}
 *   `install()` resolves true if the browser reported an accepted install. On
 *   iOS there is nothing to call — read `method` and show the words instead.
 */
export function useInstall() {
  const [tick, setTick] = useState(0);
  const [dismissedAt, setDismissedAt] = useState(readDismissed);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    listeners.add(bump);
    return () => { listeners.delete(bump); };
  }, []);

  const dismiss = useCallback(() => {
    const now = Date.now();
    try { localStorage.setItem(DISMISS_KEY, String(now)); } catch { /* blocked store */ }
    setDismissedAt(now);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return false;
    const event = deferred;
    // Spent either way: a dismissed prompt cannot be replayed, and holding on
    // to it would leave a button that silently does nothing.
    deferred = null;
    announce();
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      return outcome === 'accepted';
    } catch {
      return false;
    }
  }, []);

  const nav = typeof navigator === 'undefined' ? {} : navigator;
  const state = installState({
    ua: nav.userAgent || '',
    platform: nav.platform || '',
    maxTouchPoints: nav.maxTouchPoints || 0,
    displayMode: typeof window === 'undefined' ? 'browser' : currentDisplayMode(),
    navigatorStandalone: nav.standalone === true,
    canPrompt: deferred !== null,
    dismissedAt,
  });

  // `tick` is read so the memo-free recompute above is not optimised away by a
  // future refactor: the deferred event lives outside React and only a render
  // triggered by `announce` picks it up.
  void tick;

  return { ...state, install, dismiss };
}
