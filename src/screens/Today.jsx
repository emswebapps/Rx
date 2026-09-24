import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pill, LifeBuoy, Check, Package, Plus, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
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
import ScheduleRow, { DoseSheet, TimeEditor, MedNotesSheet } from '../components/ScheduleRow.jsx';
import { notesForMed } from '../lib/notes.js';
import { checkInsDue } from '../lib/effects.js';
import EffectCheckIn from '../components/EffectCheckIn.jsx';
import NowCard from '../components/NowCard.jsx';
import { groupSettled as dosesSettled, afterDoseOpen, formatUntil } from '../lib/next.js';
import { effectiveWindow } from '../lib/meds.js';
import { mergeWater, glassesOnDay } from '../lib/water.js';
import WindowTimeline from '../components/WindowTimeline.jsx';
import QuietRow from '../components/QuietRow.jsx';
import InstallCard from '../components/InstallCard.jsx';
import Sheet from '../components/Sheet.jsx';
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
    rxRoutineRuns, checkRoutineStep, setRoutineAte, rxWater, addWater, undoWater,
    rxNotes, addRxNote, rxEffects, addEffect, rxMeals,
  } = useApp();
  // A check-in started by hand from the dose sheet, for one medication.
  const [manualCheckIn, setManualCheckIn] = useState(null);
  // What's folded away: finished dose times, and the details under the tiles.
  const [showDone, setShowDone] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(null);
  const [notesFor, setNotesFor] = useState(null);
  const noteCount = (med) => notesForMed(rxNotes, med.id).length + (med.rules || []).filter((r) => String(r?.text || '').trim()).length;
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
  // Finished means the doses are settled AND nothing in their routines is
  // still to do — a meal eaten after the dose keeps its group open until
  // it's ticked.
  // Only what comes after the dose, and only for a couple of hours: a meal
  // skipped before it is history, and so is one after it by mid-afternoon.
  const groupSettled = (entries) => dosesSettled(entries)
    && entries.every((e) => !afterDoseOpen(routines.get(e.key), now));
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

  const take = (e, at) => {
    logCrashDose(e.medId, at ?? loggedAt(e), { slotId: e.slotId, amount: e.amount });
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
        <Header
          day={day}
          today={shiftDay(now, 0)}
          onPick={(ts) => setOffset(daysBetween(shiftDay(now, 0), ts))}
          onAdd={() => navigate('/meds/new')}
        />
      </div>

      <div style={{ padding: '0 1rem' }}>
        {/* A live session outranks everything. */}
        {isToday && active && (
          <button
            onClick={() => navigate('/crash/run')}
            style={{
              width: '100%', borderRadius: '1rem', border: 'none', marginTop: '0.75rem',
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

        {/* ── The one thing to look at now ── */}
        {isToday && tracking && groups.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <NowCard
              meds={crashMeds}
              doses={crashDoses}
              runs={rxRoutineRuns}
              kit={kit}
              savedMeals={rxMeals}
              onStep={(entry, stepId, ate) => (
                // null clears any "ate instead" from an earlier tap.
                checkRoutineStep(day, entry.medId, entry.slotId, stepId, Date.now(), ate ?? null)
              )}
              onOpenDose={(key) => setOpenKey(key)}
              onCrash={() => navigate('/crash')}
              onCheckIn={() => checkInCrash()}
            />
          </div>
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
              width: '100%', marginTop: '0.75rem', padding: '0.875rem 1rem', textAlign: 'left',
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

        {/* ── How's it working? ──
            Only the newest one open; an older one still unanswered is
            already stale by the time the next is due. */}
        {isToday && tracking && (() => {
          const due = checkInsDue(crashMeds, crashDoses, rxEffects, now)[0];
          if (!due) return null;
          // One line, not the whole form: it's a prompt, not the point of
          // the screen. Tapping opens the form in a sheet.
          return (
            <div style={{
              marginTop: '0.75rem', padding: '0.625rem 0.75rem 0.625rem 1rem', borderRadius: '0.875rem',
              backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', gap: '0.5rem',
            }}>
              <button
                onClick={() => setCheckInOpen(due)}
                style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ display: 'block', fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>{due.label}</span>
                <span style={{ display: 'block', fontSize: '0.8125rem', color: 'var(--subtle)' }}>
                  {due.med.name || 'Your dose'} · a few taps
                </span>
              </button>
              <button onClick={() => setCheckInOpen(due)} className="app-btn-primary" style={{ width: 'auto', flex: 'none', padding: '0.5rem 0.875rem', fontSize: '0.875rem' }}>
                Check in
              </button>
              <button
                onClick={() => addEffect({ doseId: due.doseId, medId: due.medId, phase: due.phase, dismissed: true })}
                aria-label="Not now"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: '0.375rem' }}
              >
                <X size={16} />
              </button>
            </div>
          );
        })()}

        {/* ── The doses, by the time they're due ── */}
        {/* Finished dose times fold into one line on today — the screen is
            for what's left, not a record of what's done. */}
        {isToday && tracking && (() => {
          const done = groups.filter((g) => groupSettled(g.entries));
          if (done.length === 0) return null;
          const entries = done.flatMap((g) => g.entries);
          const taken = entries.filter((e) => e.state === 'taken').length;
          return (
            <button
              onClick={() => setShowDone((v) => !v)}
              aria-expanded={showDone}
              style={{
                width: '100%', marginTop: '0.75rem', padding: '0.75rem 1rem', borderRadius: '0.875rem',
                cursor: 'pointer', backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'left',
              }}
            >
              <Check size={16} style={{ color: 'var(--positive)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
                {taken} of {entries.length} done earlier
                <span style={{ fontWeight: 400, color: 'var(--subtle)' }}>
                  {' · '}{entries.map((e) => (e.dose ? formatClock(e.dose.takenAt) : e.state === 'skipped' ? 'missed' : 'skipped')).join(', ')}
                </span>
              </span>
              <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)' }}>{showDone ? 'Hide' : 'Show'}</span>
            </button>
          );
        })()}

        {tracking && (groups.length > 0 ? (
          groups.filter((g) => !isToday || showDone || !groupSettled(g.entries)).map((g) => (
            <section key={g.key} style={{ marginTop: '1rem' }}>
              <h2 style={{
                fontSize: '1.125rem', fontWeight: 800, letterSpacing: '-0.01em',
                color: g === currentGroup ? 'var(--accent-text)' : 'var(--text)',
                margin: '0 0 0.375rem 0.25rem',
              }}>
                {g.label}
              </h2>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {g.entries.map((entry) => {
                  const routine = routines.get(entry.key);
                  return (
                    <div key={entry.key} style={{ display: 'grid', gap: '0.5rem' }}>
                      {/* On today only the routine in play is open; the rest
                          show up when their dose comes round. */}
                      {routine && (!isToday || g === currentGroup
                        || routine.steps.some((st) => st.state === 'waiting')
                        || afterDoseOpen(routine, now)) && (
                        <RoutineCard
                          routine={routine}
                          when={when}
                          onToggleStep={(stepId, at) => checkRoutineStep(day, entry.medId, entry.slotId, stepId, at)}
                          onOpenDose={() => setOpenKey(entry.key)}
                        />
                      )}
                      <ScheduleRow
                        entry={entry}
                        now={now}
                        onOpen={(e) => setOpenKey(e.key)}
                        onNotes={(med) => setNotesFor(med.id)}
                        noteCount={noteCount(entry.med)}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          ))
        ) : isToday ? (
          <div style={{ marginTop: '1rem' }}>
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
            {/* ── At a glance ── three small tiles instead of three cards;
                the details are one tap away under "More". */}
            {tracking && (
              <GlanceTiles
                water={mergeWater(kit.water)}
                glasses={glassesOnDay(rxWater, now).length}
                onWater={() => addWater()}
                window={effectiveWindow(crashMeds, crashDoses, kit, now)}
                score={todayCompliance?.score ?? null}
                now={now}
                open={showMore}
                onToggle={() => setShowMore((v) => !v)}
              />
            )}

            {tracking && showMore && (
              <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
                <WaterRow
                  log={rxWater}
                  doses={crashDoses}
                  config={kit.water}
                  now={now}
                  onAdd={() => addWater()}
                  onUndo={() => undoWater()}
                />
                <WindowTimeline
                  meds={crashMeds}
                  doses={crashDoses}
                  kit={kit}
                  now={now}
                  behaviors={crashBehaviors}
                  sessions={crashSessions}
                  onCheckIn={() => checkInCrash()}
                />
                {todayCompliance && todayCompliance.score != null && (
                  <ComplianceCard day={todayCompliance} summary={complianceWeek} onOpen={() => navigate('/history?tab=score')} />
                )}
                {adherence && (
                  <button
                    onClick={() => navigate('/history')}
                    style={{
                      width: '100%', padding: '0.25rem 0.5rem', textAlign: 'left', background: 'none', border: 'none',
                      cursor: 'pointer', fontSize: '0.9375rem', fontWeight: 600, color: 'var(--subtle)',
                    }}
                  >
                    {adherence}
                  </button>
                )}
              </div>
            )}

            <div style={{ marginTop: '1rem' }}>
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

            {/* ── The tool, one tap away and no closer ── */}
            <div style={{ marginTop: '1rem' }}>
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
          onCheckIn={isToday ? (medId) => { setOpenKey(null); setManualCheckIn(medId); } : null}
        />
      )}

      {checkInOpen && (
        <Sheet onClose={() => setCheckInOpen(null)} label="Check in">
          <EffectCheckIn
            title={checkInOpen.label}
            subtitle={`${checkInOpen.med.name || 'Your dose'} · taken ${formatClock(crashDoses.find((d) => d.id === checkInOpen.doseId)?.takenAt ?? checkInOpen.at)}`}
            onSave={(v) => {
              addEffect({ ...v, doseId: checkInOpen.doseId, medId: checkInOpen.medId, phase: checkInOpen.phase });
              setCheckInOpen(null);
            }}
          />
        </Sheet>
      )}

      {manualCheckIn && (
        <Sheet onClose={() => setManualCheckIn(null)} label="Check in">
          <EffectCheckIn
            title="How’s it working?"
            subtitle={crashMeds.find((m) => m.id === manualCheckIn)?.name}
            onSave={(v) => { addEffect({ ...v, medId: manualCheckIn }); setManualCheckIn(null); }}
          />
        </Sheet>
      )}

      {notesFor && (() => {
        const med = schedule.find((e) => e.medId === notesFor)?.med;
        if (!med) return null;
        return (
          <MedNotesSheet
            med={med}
            notes={notesForMed(rxNotes, med.id)}
            onClose={() => setNotesFor(null)}
            onAdd={() => {
              const note = addRxNote({ text: '', kind: 'timing', medId: med.id });
              setNotesFor(null);
              navigate(`/notes?open=${note.id}`);
            }}
            onOpenNote={(n) => { setNotesFor(null); navigate(`/notes?open=${n.id}`); }}
            onEditRules={() => { setNotesFor(null); navigate(`/meds/${med.id}`); }}
          />
        );
      })()}

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
 * The header: the date and a + on one line, the week under it, in one navy
 * block about a third the height of the old name bar and strip together. On a
 * phone every line up here is a line of doses pushed off the bottom.
 *
 * It runs up under the status bar on an installed iPhone — the body is padded
 * by the safe area, and this pulls itself back up over that padding so the
 * colour reaches the top edge rather than stopping short of it.
 */
function Header({ day, today, onPick, onAdd }) {
  const touch = useRef(null);
  const sunday = shiftDay(day, -new Date(day).getDay());
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(sunday, i));
  const isToday = day === today;
  const label = new Date(day).toLocaleDateString(undefined, { weekday: isToday ? undefined : 'short', month: 'short', day: 'numeric' });

  return (
    <div
      style={{
        backgroundColor: 'var(--header)',
        marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.375rem)',
        paddingBottom: '0.5rem',
      }}
      onTouchStart={(e) => { touch.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touch.current == null) return;
        const dx = e.changedTouches[0].clientX - touch.current;
        touch.current = null;
        if (Math.abs(dx) > 50) onPick(shiftDay(day, dx < 0 ? 7 : -7));
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 0.5rem 0 1rem', minHeight: '2.5rem' }}>
        <button
          onClick={() => onPick(today)}
          disabled={isToday}
          style={{
            flex: 1, textAlign: 'left', background: 'none', border: 'none', padding: 0,
            cursor: isToday ? 'default' : 'pointer', color: '#fff',
            fontSize: '1.125rem', fontWeight: 800, letterSpacing: '-0.01em',
          }}
        >
          {isToday ? `Today, ${label}` : label}
          {!isToday && (
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)', marginLeft: '0.5rem' }}>
              ← Back to today
            </span>
          )}
        </button>
        <button
          onClick={onAdd}
          aria-label="Add a medication"
          style={{
            width: '2.5rem', height: '2.5rem', background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
          }}
        >
          <Plus size={24} strokeWidth={2} />
        </button>
      </div>

      <div style={{ display: 'flex', padding: '0 0.375rem' }}>
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
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.125rem',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: current ? 'var(--accent-text)' : 'rgba(255,255,255,0.7)' }}>
                {DAY_LETTERS[new Date(d).getDay()]}
              </span>
              <span style={{
                width: '2rem', height: '2rem', borderRadius: '9999px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.9375rem', fontWeight: 700, fontVariantNumeric: 'tabular-nums',
                backgroundColor: selected ? 'var(--accent)' : 'transparent',
                color: selected ? '#fff' : current ? 'var(--accent-text)' : '#fff',
              }}>
                {new Date(d).getDate()}
              </span>
            </button>
          );
        })}
      </div>
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

/**
 * Water, the crash, and the score, as three small tiles. Water's + logs a
 * glass straight from here; the other two open the details underneath.
 */
function GlanceTiles({ water, glasses, onWater, window: w, score, now, open, onToggle }) {
  const crash = !w ? '—'
    : now < w.start ? formatUntil(w.start - now)
      : now < w.end ? 'now' : 'passed';
  const tile = {
    flex: 1, minWidth: 0, padding: '0.5rem 0.625rem', borderRadius: '0.75rem', textAlign: 'left',
    backgroundColor: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer',
  };
  const label = { display: 'block', fontSize: '0.6875rem', fontWeight: 800, letterSpacing: '0.05em', color: 'var(--muted)' };
  const value = { display: 'block', fontSize: '0.9375rem', fontWeight: 800, whiteSpace: 'nowrap', color: 'var(--text)', marginTop: '0.125rem', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ marginTop: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {water.enabled && (
          <button onClick={onWater} style={{ ...tile, display: 'flex', alignItems: 'center', gap: '0.5rem' }}
            aria-label={`Water ${glasses} of ${water.goal}. Tap to log a glass.`}>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={label}>WATER</span>
              <span style={value}>{glasses}/{water.goal}</span>
            </span>
            <span style={{
              width: '1.5rem', height: '1.5rem', borderRadius: '9999px', backgroundColor: 'var(--accent)',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Plus size={16} strokeWidth={3} />
            </span>
          </button>
        )}
        <button onClick={onToggle} style={tile}>
          <span style={label}>CRASH</span>
          <span style={{ ...value, color: crash === 'now' ? 'var(--warn)' : 'var(--text)' }}>{crash}</span>
        </button>
        <button onClick={onToggle} style={tile}>
          <span style={label}>SCORE</span>
          <span style={value}>{score ?? '—'}</span>
        </button>
      </div>
      <button
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: 'block', margin: '0.5rem auto 0', background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)', padding: '0.25rem 0.5rem',
        }}
      >
        {open ? 'Less' : 'More details'}
      </button>
    </div>
  );
}

