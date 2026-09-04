import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * "Back" that knows when there's nowhere to go back to.
 *
 * Most screens in Rx are reached by tapping through from home, so history is
 * the honest answer — it lands you where you actually came from, which is the
 * thing the old `cameFromRunner` flag in CrashProtocol.jsx was hand-rolling.
 *
 * But several screens are also opened cold from a push notification or a
 * home-screen shortcut, and there `navigate(-1)` walks out of the app entirely.
 * When the history index says this is the first entry, go to the fallback route
 * instead.
 */
export function useBack(fallback = '/') {
  const navigate = useNavigate();
  return useCallback(() => {
    const idx = window.history.state?.idx;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [navigate, fallback]);
}
