// Whether Rx can be put on a home screen, and how to say so.
//
// "Install" is three different things depending on the browser, and the
// difference is not cosmetic:
//
//   - Chromium fires `beforeinstallprompt`, which can be held and replayed
//     later from a button of our own. That is the only case where the app can
//     install itself.
//   - iOS Safari fires nothing and exposes no API at all. The only route is
//     Share → Add to Home Screen, so the honest thing is to say those words
//     rather than show a button that cannot work.
//   - Everywhere else — an in-app webview, Firefox on the desktop, an already
//     installed copy — there is nothing useful to offer, and a prompt that
//     leads nowhere is worse than silence.
//
// Pure and DOM-free so `node --test` can cover the branching, which is the part
// that is easy to get wrong and impossible to check by opening one browser.

/** Two weeks. Long enough that "not now" is respected, short enough to re-ask. */
export const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * iPhones and iPads, including the iPad that reports itself as a Mac.
 *
 * iPadOS 13+ sends a desktop Safari user agent. The touch count is what gives
 * it away, and getting this wrong means iPad users are told nothing at all.
 */
export function isIos({ ua = '', platform = '', maxTouchPoints = 0 } = {}) {
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return /Mac/.test(ua + platform) && maxTouchPoints > 1;
}

/**
 * Already on a home screen?
 *
 * `display-mode: standalone` covers everything modern; `navigator.standalone`
 * is the iOS-only flag that predates it and is still the only signal there on
 * older versions.
 */
export function isInstalled({ displayMode = 'browser', navigatorStandalone = false } = {}) {
  return displayMode === 'standalone'
    || displayMode === 'fullscreen'
    || displayMode === 'minimal-ui'
    || navigatorStandalone === true;
}

/**
 * What, if anything, to offer.
 *
 * @returns {{ installed: boolean, method: 'prompt'|'ios-share'|'none', showBanner: boolean }}
 *   `method` is what the button does. `showBanner` is whether to raise it
 *   unasked — a snoozed or impossible install stays out of the way, but the
 *   Settings row still renders so it is findable when it is wanted.
 */
export function installState({
  ua = '',
  platform = '',
  maxTouchPoints = 0,
  displayMode = 'browser',
  navigatorStandalone = false,
  canPrompt = false,
  dismissedAt = null,
  now = Date.now(),
} = {}) {
  const installed = isInstalled({ displayMode, navigatorStandalone });
  if (installed) return { installed: true, method: 'none', showBanner: false };

  let method = 'none';
  if (canPrompt) method = 'prompt';
  else if (isIos({ ua, platform, maxTouchPoints })) method = 'ios-share';

  const snoozed = Number.isFinite(Number(dismissedAt))
    && dismissedAt !== null
    && now - Number(dismissedAt) < SNOOZE_MS;

  return { installed: false, method, showBanner: method !== 'none' && !snoozed };
}
