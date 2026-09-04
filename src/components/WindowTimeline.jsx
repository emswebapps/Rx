import { Pill } from 'lucide-react';
import { formatClock } from '../lib/time.js';
import { windowState } from '../lib/window.js';
import { effectiveWindow, normalizeMed } from '../lib/meds.js';

/**
 * Tonight's window, drawn from the times you logged.
 *
 * A plain flex bar rather than a chart library — this sits on the crisis path,
 * and pulling recharts in here would put a heavier bundle between the user and
 * the panic button. The pattern chart in History can afford it; this can't.
 *
 * When the window is provisional the fill is drawn to where it *could* extend
 * to, in a lighter tone, so "this might move" is visible rather than only
 * written underneath.
 */
function Bar({ w, now }) {
  const far = w.provisional && w.wouldBecome ? w.wouldBecome.end : w.end;
  const total = far - w.takenAt;
  const pct = (t) => Math.min(100, Math.max(0, ((t - w.takenAt) / total) * 100));
  const inside = now >= w.start && now < w.end;

  return (
    <div style={{ marginTop: '0.875rem' }}>
      <div style={{
        position: 'relative', height: '0.625rem', borderRadius: '9999px',
        backgroundColor: 'var(--surface2)', overflow: 'hidden',
      }}>
        {w.provisional && w.wouldBecome && (
          <div style={{
            position: 'absolute', top: 0, bottom: 0,
            left: `${pct(w.wouldBecome.start)}%`, right: 0,
            backgroundColor: 'var(--surface2)',
            borderTop: '2px dashed var(--accent-soft)',
            borderBottom: '2px dashed var(--accent-soft)',
          }} />
        )}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${pct(w.start)}%`, right: `${100 - pct(w.end)}%`,
          backgroundColor: inside ? 'var(--accent)' : 'var(--accent-soft)',
        }} />
      </div>

      {now >= w.takenAt && now <= far && (
        <div style={{ position: 'relative', height: 0 }}>
          <div style={{
            position: 'absolute', top: '-0.9375rem', left: `${pct(now)}%`,
            width: '2px', height: '1rem', marginLeft: '-1px',
            backgroundColor: 'var(--text)', borderRadius: '1px',
          }} />
        </div>
      )}

      <div style={{
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.6875rem', color: 'var(--subtle)', marginTop: '0.5rem',
        fontVariantNumeric: 'tabular-nums',
      }}>
        <span>{formatClock(w.takenAt)}</span>
        <span>{formatClock(w.start)}</span>
        <span>{formatClock(far)}</span>
      </div>
    </div>
  );
}

/**
 * The window card for the Today page.
 *
 * Renders nothing at all when there's no dose to compute from, so an empty
 * install isn't given a card explaining a concept it can't demonstrate.
 */
export default function WindowTimeline({ meds, doses, kit, now }) {
  const w = effectiveWindow(meds, doses, kit, now);
  if (!w) return null;

  const state = windowState(w, now);
  const pending = w.pendingMedId
    ? normalizeMed(meds.find((m) => m.id === w.pendingMedId))
    : null;

  // What the window is saying right now. While it's provisional the honest
  // answer names the condition rather than a single time — the whole point of
  // knowing about the second dose is that it changes the answer.
  const line = w.provisional && w.wouldBecome
    ? `About ${formatClock(w.start)} as things stand${
      pending && pending.name ? ` — take your ${pending.name} and it moves to about ${formatClock(w.wouldBecome.start)}.` : `, or about ${formatClock(w.wouldBecome.start)} if you take the next one.`}`
    : {
      before: `Your window: about ${formatClock(w.start)} to ${formatClock(w.end)}.`,
      soon: `Starts around ${formatClock(w.start)}. If there’s anything hard to say, now’s the better time.`,
      inside: `You’re in it until about ${formatClock(w.end)}.`,
      past: 'Tonight’s window has passed.',
      none: null,
    }[state];

  const urgent = state === 'soon' && !w.provisional;

  return (
    <div className="app-card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
        <Pill size={16} style={{ color: 'var(--muted)', flexShrink: 0 }} />
        <p style={{ fontSize: '0.8125rem', fontWeight: 800, letterSpacing: '0.04em', color: 'var(--muted)' }}>
          TONIGHT
        </p>
      </div>

      <Bar w={w} now={now} />

      {line && (
        <p style={{
          fontSize: '0.8125rem', lineHeight: 1.45, marginTop: '0.75rem',
          color: urgent ? 'var(--accent-text)' : 'var(--subtle)',
          fontWeight: urgent ? 600 : 400,
        }}>
          {line}
        </p>
      )}
    </div>
  );
}
