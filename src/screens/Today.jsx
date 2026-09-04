import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, LifeBuoy, Check, Package } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useNow } from '../lib/useCountdown.js';
import { mergeKit } from '../lib/kit.js';
import { activeSession, timerRemaining, formatRemaining } from '../lib/protocol.js';
import { expectedDosesToday, supplyStatus, activeMeds, sameLocalDay as sameDay } from '../lib/meds.js';
import { adherenceDays, adherenceSentence } from '../lib/adherence.js';
import { formatClock, formatDayLong } from '../lib/time.js';
import ScheduleRow, { TimeEditor } from '../components/ScheduleRow.jsx';
import WindowTimeline from '../components/WindowTimeline.jsx';
import QuietRow from '../components/QuietRow.jsx';
import { pageStyle } from '../components/medsUi.jsx';

/**
 * Today.
 *
 * Doses first, and doses biggest. On an ordinary morning this screen has one
 * job — say what's due and take one tap to log it — and everything else on it
 * is arranged to stay out of the way of that.
 *
 * The crash protocol is one row near the bottom. The exception is a session
 * already running, which goes to the top: at that moment it is the only thing
 * on this screen that matters.
 */
export default function RxHome() {
  const {
    crashMeds, crashDoses, crashKit, crashSessions,
    logCrashDose, skipCrashDose, addCrashDose, updateCrashDose,
  } = useApp();
  const navigate = useNavigate();

  // Keyed on the doses themselves so logging or editing one updates the clock
  // straight away rather than at the next minute boundary.
  const syncKey = `${crashMeds.length}:${crashDoses.length}:${
    crashDoses.length ? Math.max(...crashDoses.map((d) => d.takenAt)) : 0}`;
  const now = useNow({ tick: 60_000, syncKey });

  const kit = mergeKit(crashKit);
  const active = activeSession(crashSessions);
  const [editingDose, setEditingDose] = useState(null);
  const [justLogged, setJustLogged] = useState(false);

  const schedule = expectedDosesToday(crashMeds, crashDoses, now);
  const tracking = kit.doseTracking !== false;

  const needsAttention = activeMeds(crashMeds)
    .map((m) => ({ med: m, supply: supplyStatus(m, now) }))
    .filter(({ supply }) => supply.low || supply.refillOpen);

  const adherence = adherenceSentence(adherenceDays(crashMeds, crashDoses, { now }));

  const logPlain = () => {
    addCrashDose(Date.now());
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 2000);
  };

  const editable = crashDoses.find((d) => d.id === editingDose) || null;

  return (
    <div className="app-page" style={pageStyle}>
      <div style={{ paddingTop: '1.5rem', paddingBottom: '1.25rem' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>
          Today
        </h1>
        <p style={{ color: 'var(--subtle)', fontSize: '0.875rem', marginTop: '0.25rem' }}>
          {formatDayLong(now)}
        </p>
      </div>

      {/* A live session outranks everything. */}
      {active && (
        <button
          onClick={() => navigate('/crash/run')}
          style={{
            width: '100%', borderRadius: '1rem', border: 'none', marginBottom: '1.25rem',
            backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: '0.25rem', padding: '1.25rem',
          }}
        >
          <span style={{ fontSize: '1.125rem', fontWeight: 800 }}>Pick it back up</span>
          <span style={{ fontSize: '0.875rem', opacity: 0.9, fontVariantNumeric: 'tabular-nums' }}>
            {timerRemaining(active, now) > 0
              ? `${formatRemaining(timerRemaining(active, now))} left`
              : 'The 30 minutes are up'}
          </span>
        </button>
      )}

      {/* ── The doses ── */}
      {tracking && (schedule.length > 0 ? (
        <div style={{ display: 'grid', gap: '0.625rem' }}>
          {schedule.map((entry) => (
            <ScheduleRow
              key={entry.key}
              entry={entry}
              now={now}
              onLog={(e) => logCrashDose(e.medId, Date.now(), { slotId: e.slotId, amount: e.amount })}
              onSkip={(e) => skipCrashDose(e.medId, Date.now(), { slotId: e.slotId })}
              onEdit={(medId) => navigate(`/meds/${medId}`)}
            />
          ))}
        </div>
      ) : (
        <>
          <EmptyToday
            onAdd={() => navigate('/meds/new')}
            onLogPlain={logPlain}
            justLogged={justLogged}
          />
          <PlainDoses doses={crashDoses} now={now} onEdit={setEditingDose} />
        </>
      ))}

      {/* ── Needs sorting ── */}
      {needsAttention.length > 0 && (
        <button
          onClick={() => navigate('/supply')}
          style={{
            width: '100%', marginTop: '1rem', padding: '0.875rem 1rem', textAlign: 'left',
            borderRadius: '0.875rem', cursor: 'pointer',
            backgroundColor: 'var(--warn-soft, var(--surface2))',
            border: '1px solid var(--warn)',
            display: 'flex', alignItems: 'center', gap: '0.75rem',
          }}
        >
          <Package size={17} style={{ color: 'var(--warn)', flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
            {needsAttention.length === 1
              ? `${needsAttention[0].med.name || 'One medication'} needs sorting`
              : `${needsAttention.length} need sorting`}
          </span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--warn)' }}>Supply</span>
        </button>
      )}

      {/* ── Tonight ── */}
      {tracking && (
        <div style={{ marginTop: '1.25rem' }}>
          <WindowTimeline meds={crashMeds} doses={crashDoses} kit={kit} now={now} />
        </div>
      )}

      {/* ── How it's been going ── */}
      {adherence && (
        <button
          onClick={() => navigate('/history')}
          style={{
            width: '100%', marginTop: '1rem', padding: '0.875rem 1rem', textAlign: 'left',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.875rem', fontWeight: 600, color: 'var(--subtle)',
          }}
        >
          {adherence}
        </button>
      )}

      {/* ── The tool, one tap away and no closer ── */}
      <div style={{ marginTop: '1.5rem' }}>
        <QuietRow
          Icon={LifeBuoy}
          label={active ? 'Back to the crash protocol' : 'I’m crashing'}
          tone="accent"
          onClick={() => navigate('/crash')}
        />
      </div>

      {editable && (
        <TimeEditor
          dose={editable}
          onSave={(takenAt) => { updateCrashDose(editable.id, { takenAt }); setEditingDose(null); }}
          onClose={() => setEditingDose(null)}
        />
      )}
    </div>
  );
}

/**
 * Doses logged today with no medication behind them.
 *
 * Someone with no list yet can still tap "just log that I took something", and
 * having done so needs to be able to correct the time — remembering at 3 PM
 * that it was actually 8 is the single most common correction there is.
 */
function PlainDoses({ doses, now, onEdit }) {
  const today = doses.filter((d) => d.status !== 'skipped' && sameDay(d.takenAt, now));
  if (today.length === 0) return null;

  return (
    <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.375rem' }}>
      {today
        .slice()
        .sort((a, b) => b.takenAt - a.takenAt)
        .map((d) => (
          <button
            key={d.id}
            onClick={() => onEdit(d.id)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.75rem 1rem', borderRadius: '0.75rem', cursor: 'pointer', textAlign: 'left',
              backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
            }}
          >
            <Check size={15} style={{ color: 'var(--positive)', flexShrink: 0 }} />
            <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: 'var(--text)' }}>
              Logged {formatClock(d.takenAt)}
            </span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--accent-text)' }}>Change</span>
          </button>
        ))}
    </div>
  );
}

/**
 * Nothing set up yet.
 *
 * Offers the plain one-tap log as well as the setup path, because someone who
 * has just swallowed something and opened the app should be able to record that
 * before being asked to fill in a form.
 */
function EmptyToday({ onAdd, onLogPlain, justLogged }) {
  return (
    <div className="app-card" style={{ padding: '1.5rem', textAlign: 'center' }}>
      <Pill size={28} style={{ color: 'var(--muted)', marginBottom: '0.875rem' }} />
      <p style={{ color: 'var(--subtle)', fontSize: '0.9375rem', lineHeight: 1.6, marginBottom: '1.25rem' }}>
        Add what you take and when you take it, and this becomes a list you tick
        off each morning.
      </p>
      <button onClick={onAdd} className="app-btn-primary" style={{ width: '100%', marginBottom: '0.625rem' }}>
        Add a medication
      </button>
      <button
        onClick={onLogPlain}
        style={{
          width: '100%', padding: '0.75rem', borderRadius: '0.75rem', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.375rem',
          backgroundColor: justLogged ? 'var(--positive-soft)' : 'var(--surface2)',
          border: `1px solid ${justLogged ? 'var(--positive)' : 'var(--border)'}`,
          color: justLogged ? 'var(--positive-text)' : 'var(--text)',
          fontSize: '0.875rem', fontWeight: 700,
        }}
      >
        {justLogged ? <Check size={15} /> : null}
        {justLogged ? 'Logged' : 'Just log that I took something'}
      </button>
    </div>
  );
}
