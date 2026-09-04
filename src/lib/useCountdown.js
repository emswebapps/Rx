import { useEffect, useState } from 'react';

/**
 * A ticking `Date.now()`.
 *
 * The interval alone is not enough. Round 6 of the protocol explicitly tells
 * you to put the phone down and go do something, and iOS Safari throttles or
 * suspends timers in a backgrounded tab — so on return the interval has
 * drifted or stopped entirely. Recomputing on `visibilitychange`, `focus` and
 * `pageshow` is what makes the number correct the moment you look at it again.
 */
export function useNow({ tick = 1000, active = true, syncKey = null } = {}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), tick);
    const resync = () => setNow(Date.now());
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('pageshow', resync);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('pageshow', resync);
    };
    // `syncKey` forces an immediate recompute when the data being timed
    // changes. Without it a slow ticker can still be holding a `now` from
    // before the user's action — and something they just logged reads as being
    // in the future, so it renders as nothing at all.
  }, [tick, active, syncKey]);

  return now;
}

/**
 * Live clock for a countdown. Deliberately does NOT take `endsAt` as an effect
 * dependency — a caller passing a freshly computed timestamp would otherwise
 * re-arm the interval on every render and spin.
 */
export function useCountdown(endsAt, { tick = 1000 } = {}) {
  return useNow({ tick, active: !!endsAt });
}
