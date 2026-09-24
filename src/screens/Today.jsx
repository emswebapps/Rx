import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, LifeBuoy, Check, Package, Plus } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import { useNow } from '../lib/useCountdown.js';
import { mergeKit } from '../lib/kit.js';
import { activeSession, timerRemaining, formatRemaining } from '../lib/protocol.js';
import {
  expectedDosesOnDay, supplyStatus, activeMeds, startOfDay, sameLocalDay as sameDay,
} from '../lib/meds.js';
import { adherenceDays, adherenceSentence } from '../lib/adherence.js';
import { routinesForDay, formatCountdown } from '../lib/routine.js';
import { complianceDays, complianceSummary } from '../lib/compliance.js';
import { formatClock } from '../lib/time.js';
import ScheduleRow, { DoseSheet, TimeEditor } from '../components/ScheduleRow.jsx';
import WindowTimeline from '../components/WindowTimeline.jsx';
import QuietRow from '../components/QuietRow.jsx';
import InstallCard from '../components/InstallCard.jsx';
import { formatRunOut } from '../components/medsUi.jsx';
import RoutineCard from '../components/RoutineCard.jsx';
import WaterRow from '../components/WaterRow.jsx';
import ComplianceCard from '../components/ComplianceRing.jsx';

const DAY_LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** The local midnight `offset` days from `ts`, safe across a clock change. */
function shiftDay(ts, offset) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() + offset);
  return d.getTime();
}

/**
 * Today.
 *
 * A week along the top, and under it the day's doses grouped by the time
 * they're due — the shape every easy medication app has settled on, because it
 * answers "what do I take now?" before anything else is read.
 *
 * Any day in the week can be picked: a past one to fill in what was missed, a
 * coming one to see what's ahead. Everything that isn't a dose — the crash
 * protocol, supply warnings, tonight's window — only shows on today itself.
 */
export default function RxHome() {
  const {
    crashMeds, crashDoses, crashKit, crashSessions,
    logCrashDose, skipCrashDose, unlogCrashDose, addCrashDose, updateCrashDose,
    crashBehaviors, checkInCrash,
    rxRoutineRuns, checkRoutineStep, rxWater, addWater, undoWater,
  } = useApp();
  const navigate = useNavigate();

  // Keyed on the doses themselves so logging or editing one updates the clock
  // straight away rather than at the next minute boundary.
  const syncKey = `${crashMeds.length}:${rxRoutineRuns.length}:${JSON.stringify(rxRoutineRuns[0]?.done || {})}:${crashDoses.length}:${
    crashDoses.length ? Math.max(...crashDoses.map((d) => d.takenAt)) : 0}`;
  const now = useNow({ tick: 60_000, syncKey });

  // Held as an offset from today rather than a date, so an app left open past
  // midnight rolls forward with the day instead of staying on yesterday.
  const [offset, setOffset] = useState(0);
  const day = shiftDay(now, offset);
  const isToday = offset === 0;
  const when = offset < 0 ? 'past' : offset > 0 ? 'future' : 'today';

  const kit = mergeKit(crashKit);
  const active = activeSession(crashSessions);
  const [openKey, setOpenKey] = useState(null);
  const [editingDose, setEditingDose] = useState(null);
  const [justLogged, setJustLogged] = useState(false);

  const schedule = expectedDosesOnDay(crashMeds, crashDoses, day, now);
  const groups = groupByTime(schedule);
  const routines = new Map(routinesForDay(schedule, rxRoutineRuns, day, now).map((r) => [r.key, r]));
  const tracking = kit.doseTracking !== false;

  // The heading picked out in the accent: the first time still waiting on
  // something, which is the one to look at right now.
  const currentGroup = isToday
    ? groups.find((g) => g.entries.some((e) => e.state === 'due'))
      || groups.find((g) => g.entries.some((e) => e.state === 'upcoming'))
    : null;

  const needsAttention = activeMeds(crashMeds)
    .map((m) => ({ med: m, supply: supplyStatus(m, now, crashDoses) }))
    .filter(({ supply }) => supply.low || supply.refillOpen || supply.shortBeforeRefill);
  const short = needsAttention.filter(({ supply }) => supply.shortBeforeRefill);

  const adherence = adherenceSentence(adherenceDays(crashMeds, crashDoses, { now }));

  // Seven days is enough for today's number and the week beside it; History
  // computes the full thirty.
  const complianceData = {
    meds: crashMeds, doses: crashDoses, kit, sessions: crashSessions,
    behaviors: crashBehaviors, runs: rxRoutineRuns, water: rxWater,
  };
  const recentCompliance = isToday ? complianceDays(complianceData, { days: 7, now }) : [];
  const todayCompliance = recentCompliance[recentCompliance.length - 1] || null;
  const complianceWeek = complianceSummary(recentCompliance);

  // A dose logged on a past day is recorded at the time it was due, so it lands
  // on that day and in that slot. Today's is recorded as now, as it always was.
  const loggedAt = (e) => {
    if (isToday) return Date.now();
    return e.expectedAt ?? shiftDay(day, 0) + 12 * 60 * 60 * 1000;
  };

  const take = (e) => {
    logCrashDose(e.medId, loggedAt(e), { slotId: e.slotId, amount: e.amount });
    setOpenKey(null);
  };
  const skip = (e) => {
    skipCrashDose(e.medId, loggedAt(e), { slotId: e.slotId });
    setOpenKey(null);
  };
  const undo = (logged) => {
    unlogCrashDose(logged.id);
    setOpenKey(null);
  };

  const logPlain = () => {
    addCrashDose(Date.now());
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 2000);
  };

  const openEntry = schedule.find((e) => e.key === openKey) || null;
  const editable = crashDoses.find((d) => d.id === editingDose) || null;

  return (
    <div className="app-page" style={{ paddingBottom: '7rem' }}>
      <div style={{ position: 'sticky', top: 0, zIndex: 20 }}>
        <TopBar onAdd={() => navigate('/meds/new')} />
        <WeekStrip day={day} today={shiftDay(now, 0)} onPick={(ts) => setOffset(daysBetween(shiftDay(now, 0), ts))} />
      </div>

      <div style={{ padding: '0 1rem' }}>
        {/* A live session outranks everything. */}
        {isToday && active && (
          <button
            onClick={() => navigate('/crash/run')}
            style={{
              width: '100%', borderRadius: '1rem', border: 'none', marginTop: '1.25rem',
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

        {/* ── Running out before the refill ──
            Above the doses, because it's the one supply problem with a
            deadline: the fix is a phone call that has to happen before the
            bottle is empty, not after. */}
        {isToday && tracking && short.map(({ med, supply }) => (
          <button
            key={med.id}
            onClick={() => navigate('/supply')}
            style={{
              width: '100%', marginTop: '1.25rem', padding: '0.875rem 1rem', textAlign: 'left',
              borderRadius: '1rem', cursor: 'pointer',
              backgroundColor: 'var(--danger-soft)', border: '1px solid var(--danger)',
              display: 'flex', alignItems: 'center', gap: '0.75rem',
            }}
          >
            <Package size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: '0.9375rem', fontWeight: 800, color: 'var(--danger)' }}>
                {med.name || 'A medication'} runs out {supply.coverDays === 0 ? 'today'
                  : supply.coverDays === 1 ? 'tomorrow' : formatRunOut(supply.runOutAt)}
              </span>
              <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--text)', marginTop: '0.125rem' }}>
                Refill opens {formatRunOut(supply.refillAt)} — {supply.gapDays} {supply.gapDays === 1 ? 'day' : 'days'} short
              </span>
            </span>
          </button>
        ))}

        {/* ── The doses, by the time they're due ── */}
        {tracking && (groups.length > 0 ? (
          groups.map((g) => (
            <section key={g.key} style={{ marginTop: '1.5rem' }}>
              <h2 style={{
                fontSize: '1.875rem', fontWeight: 800, letterSpacing: '-0.02em',
                color: g === currentGroup ? 'var(--accent-text)' : 'var(--text)',
                margin: '0 0 0.75rem 0.5rem',
              }}>
                {g.label}
              </h2>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {g.entries.map((entry) => {
                  const routine = routines.get(entry.key);
                  return (
                    <div key={entry.key} style={{ display: 'grid', gap: '0.5rem' }}>
                      {routine && (
                        <RoutineCard
                          routine={routine}
                          when={when}
                          onToggleStep={(stepId, at) => checkRoutineStep(day, entry.medId, entry.slotId, stepId, at)}
                          onTake={() => take(entry)}
                          onOpenDose={() => setOpenKey(entry.key)}
                        />
                      )}
                      <ScheduleRow entry={entry} now={now} onOpen={(e) => setOpenKey(e.key)} />
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        ) : isToday ? (
          <div style={{ marginTop: '1.5rem' }}>
            <EmptyToday
              onAdd={() => navigate('/meds/new')}
              onLogPlain={logPlain}
              justLogged={justLogged}
            />
            <PlainDoses doses={crashDoses} now={now} onEdit={setEditingDose} />
          </div>
        ) : (
          <p style={{ textAlign: 'center', color: 'var(--subtle)', fontSize: '1rem', marginTop: '3rem' }}>
            Nothing scheduled this day.
          </p>
        ))}

        {isToday && (
          <>
            {/* ── On a home screen, or not yet ──
                Below the doses, because nothing outranks what's due this
                morning — but above everything else, because until Rx is
                installed its dose reminders cannot reach a lock screen at all
                on iOS. */}
            {tracking && (
              <div style={{ marginTop: '1.25rem' }}>
                <WaterRow
                  log={rxWater}
                  doses={crashDoses}
                  config={kit.water}
                  now={now}
                  onAdd={() => addWater()}
                  onUndo={() => undoWater()}
                />
              </div>
            )}

            <div style={{ marginTop: '1.5rem' }}>
              <InstallCard />
            </div>

            {/* ── Needs sorting ── */}
            {needsAttention.length > short.length && (
              <button
                onClick={() => navigate('/supply')}
                style={{
                  width: '100%', marginTop: '1rem', padding: '1rem', textAlign: 'left',
                  borderRadius: '1rem', cursor: 'pointer',
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--warn)',
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                }}
              >
                <Package size={18} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
                  {needsAttention.length - short.length === 1
                    ? `${needsAttention.find(({ supply }) => !supply.shortBeforeRefill).med.name || 'One medication'} needs a refill`
                    : `${needsAttention.length - short.length} need a refill`}
                </span>
                <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--warn)' }}>Supply</span>
              </button>
            )}

            {/* ── Tonight ── */}
            {tracking && (
              <div style={{ marginTop: '1.25rem' }}>
                <WindowTimeline
                  meds={crashMeds}
                  doses={crashDoses}
                  kit={kit}
                  now={now}
                  behaviors={crashBehaviors}
                  sessions={crashSessions}
                  onCheckIn={() => checkInCrash()}
                />
              </div>
            )}

            {/* ── How it's been going ── */}
            {tracking && todayCompliance && todayCompliance.score != null && (
              <div style={{ marginTop: '1rem' }}>
                <ComplianceCard day={todayCompliance} summary={complianceWeek} onOpen={() => navigate('/history?tab=score')} />
              </div>
            )}
            {adherence && (
              <button
                onClick={() => navigate('/history')}
                style={{
                  width: '100%', marginTop: '1rem', padding: '0.875rem 0.5rem', textAlign: 'left',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '0.9375rem', fontWeight: 600, color: 'var(--subtle)',
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
          </>
        )}
      </div>

      {openEntry && (
        <DoseSheet
          entry={openEntry}
          when={when}
          routineNote={routineNote(routines.get(openEntry.key), Date.now())}
          onClose={() => setOpenKey(null)}
          onTake={take}
          onSkip={skip}
          onUndo={undo}
          onChangeTime={(dose) => { setOpenKey(null); setEditingDose(dose.id); }}
          onOpenMed={(medId) => navigate(`/meds/${medId}`)}
        />
      )}

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
 * What the dose sheet should say about the routine in front of it, if taking
 * the dose now would jump it. Said once, plainly, and then it gets out of the
 * way — it's your medication.
 */
function routineNote(routine, now) {
  if (!routine) return null;
  const dose = routine.steps.find((s) => s.kind === 'dose');
  if (!dose || dose.state === 'done' || dose.state === 'skipped' || dose.state === 'active') return null;
  if (routine.waitingUntil) {
    return `Your wait has ${formatCountdown(routine.waitingUntil - now)} left. Taking it now counts the routine as not followed.`;
  }
  const next = routine.steps.find((s) => s.state === 'active');
  return next && next.kind === 'task'
    ? `“${next.text}” isn’t checked off yet.`
    : null;
}

function daysBetween(fromDay, toDay) {
  return Math.round((startOfDay(toDay) - startOfDay(fromDay)) / (24 * 60 * 60 * 1000));
}

/** Rows sharing a due time, under one heading; rows with no time go last. */
function groupByTime(schedule) {
  const out = [];
  for (const entry of schedule) {
    const key = entry.expectedAt == null ? 'none' : String(entry.expectedAt);
    let group = out.find((g) => g.key === key);
    if (!group) {
      group = { key, label: entry.expectedAt == null ? 'Any time' : formatClock(entry.expectedAt), entries: [] };
      out.push(group);
    }
    group.entries.push(entry);
  }
  return out;
}

/**
 * The navy bar: who's signed in, and the quickest way to add something.
 *
 * It runs up under the status bar on an installed iPhone — the body is padded
 * by the safe area, and this pulls itself back up over that padding so the
 * colour reaches the top edge rather than stopping short of it.
 */
function TopBar({ onAdd }) {
  const { user } = useAuth();
  const name = (user?.displayName || '').trim().split(/\s+/)[0] || 'Rx';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div style={{
      backgroundColor: 'var(--header)',
      marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
      paddingBottom: '0.75rem', paddingLeft: '1rem', paddingRight: '0.5rem',
      display: 'flex', alignItems: 'center', gap: '0.875rem',
    }}>
      {user?.photoURL ? (
        <img
          src={user.photoURL}
          alt=""
          referrerPolicy="no-referrer"
          style={{ width: '2.75rem', height: '2.75rem', borderRadius: '9999px', objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <span style={{
          width: '2.75rem', height: '2.75rem', borderRadius: '9999px', flexShrink: 0,
          backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.125rem', fontWeight: 700,
        }}>
          {initial}
        </span>
      )}
      <span style={{ flex: 1, fontSize: '1.375rem', fontWeight: 600, color: '#fff', letterSpacing: '-0.01em' }}>
        {name}
      </span>
      <button
        onClick={onAdd}
        aria-label="Add a medication"
        style={{
          width: '2.75rem', height: '2.75rem', background: 'none', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
        }}
      >
        <Plus size={30} strokeWidth={1.75} />
      </button>
    </div>
  );
}

/**
 * Sunday to Saturday around the chosen day. Swipe it sideways for the week
 * before or after; tap the date under it to come back to today.
 */
function WeekStrip({ day, today, onPick }) {
  const touch = useRef(null);
  const sunday = shiftDay(day, -new Date(day).getDay());
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(sunday, i));
  const isToday = day === today;

  const label = new Date(day).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const weekday = new Date(day).toLocaleDateString(undefined, { weekday: 'long' });

  return (
    <div
      style={{ backgroundColor: 'var(--surface)', padding: '0.75rem 0.5rem 0.875rem' }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) onPick(shiftDay(day, dx < 0 ? 7 : -7));
      }}
    >
      <div style={{ display: 'flex' }}>
        {days.map((d) => {
          const selected = d === day;
          const current = d === today;
          return (
            <button
              key={d}
              onClick={() => onPick(d)}
              aria-label={new Date(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
              aria-pressed={selected}
              style={{
                flex: 1, minWidth: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                fontSize: '0.9375rem', fontWeight: 500,
                color: current ? 'var(--accent-text)' : 'var(--text)',
              }}>
                {DAY_LETTERS[new Date(d).getDay()]}
              </span>
              <span style={{
                width: '2.625rem', height: '2.625rem', borderRadius: '9999px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.25rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                backgroundColor: selected ? 'var(--accent)' : 'transparent',
                color: selected ? '#fff' : current ? 'var(--accent-text)' : 'var(--text)',
              }}>
                {new Date(d).getDate()}
              </span>
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onPick(today)}
        disabled={isToday}
        style={{
          display: 'block', margin: '0.625rem auto 0', background: 'none', border: 'none',
          cursor: isToday ? 'default' : 'pointer', padding: '0.125rem 0.5rem',
          fontSize: '1.125rem', fontWeight: 700, color: 'var(--accent-text)',
        }}
      >
        {isToday ? `Today, ${label}` : `${weekday}, ${label}`}
      </button>
      {!isToday && (
        <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--subtle)', marginTop: '0.125rem' }}>
          Tap to go back to today
        </p>
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
