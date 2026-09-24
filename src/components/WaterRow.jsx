import { useRef } from 'react';
import { Droplet, Plus } from 'lucide-react';
import { formatClock } from '../lib/time.js';
import { glassesOnDay, nextWaterDue, mergeWater } from '../lib/water.js';

/**
 * Glasses today against the goal, and when the next one is due.
 *
 * The + is the whole interaction: one tap per glass. Holding it takes the last
 * one back, for the tap that landed twice.
 */
export default function WaterRow({ log, doses, config, now, onAdd, onUndo }) {
  const cfg = mergeWater(config);
  const hold = useRef(null);
  if (!cfg.enabled) return null;

  const count = glassesOnDay(log, now).length;
  const due = nextWaterDue(log, doses, cfg, now);
  const met = count >= cfg.goal;
  const overdue = due != null && now >= due;

  const sub = met ? 'Goal met for today'
    : due == null ? 'Starts with your first dose'
      : overdue ? 'Time for a glass'
        : `Next around ${formatClock(due)}`;

  // Holding takes the last glass back; the click that ends a hold is eaten.
  const startHold = () => {
    hold.current = setTimeout(() => { hold.current = 'fired'; onUndo(); }, 600);
  };
  const cancelHold = () => {
    if (hold.current && hold.current !== 'fired') { clearTimeout(hold.current); hold.current = null; }
  };
  const click = () => {
    if (hold.current === 'fired') { hold.current = null; return; }
    onAdd();
  };

  return (
    <div
      className="app-card"
      style={{
        display: 'flex', alignItems: 'center', gap: '0.875rem', padding: '0.875rem 1rem',
        borderColor: overdue ? 'var(--accent)' : undefined,
      }}
    >
      <Droplet size={22} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
          Water · {count} of {cfg.goal}
        </p>
        <div aria-hidden="true" style={{ display: 'flex', gap: '0.1875rem', margin: '0.375rem 0 0.25rem' }}>
          {Array.from({ length: cfg.goal }, (_, i) => (
            <span key={i} style={{
              flex: 1, height: '0.3125rem', borderRadius: '9999px', maxWidth: '1.5rem',
              backgroundColor: i < count ? 'var(--accent)' : 'var(--surface2)',
            }} />
          ))}
        </div>
        <p style={{ fontSize: '0.8125rem', color: overdue ? 'var(--accent-text)' : 'var(--subtle)', fontWeight: overdue ? 700 : 400 }}>
          {sub}
        </p>
      </div>
      <button
        aria-label="Log a glass of water (hold to undo the last one)"
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onClick={click}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          width: '3rem', height: '3rem', borderRadius: '9999px', flexShrink: 0, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--accent)', color: '#fff', border: 'none',
          WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation',
        }}
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  );
}
