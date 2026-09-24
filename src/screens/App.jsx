import { useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { activeSession, staleSessions, isTimerDone } from '../lib/protocol.js';
import { mergeKit } from '../lib/kit.js';
import { sendNotification, closeNotifications } from '../utils/notifications';
import { formatClock } from '../lib/time.js';
import { useBack } from '../lib/useBack.js';
import { useNow } from '../lib/useCountdown.js';
import { expectedDosesToday, normalizeMed } from '../lib/meds.js';
import { nextWaitEnd, waitTag, dayKey, routinesForDay, runId } from '../lib/routine.js';
import { nextWaterDue, waterReminderTag } from '../lib/water.js';
import { suggestedOnsetForMed } from '../lib/window.js';

import RxHome from './Today.jsx';
import RxNav from './Nav.jsx';
import MedsView from './Meds.jsx';
import MedPage from './MedPage.jsx';
import SupplyView from './Supply.jsx';
import HistoryView from './History.jsx';
import SettingsView from './Settings.jsx';
import Notebook from './Notebook.jsx';
import Report from './Report.jsx';
import CrashScreen from './crash/Crash.jsx';
import ProtocolRunner from './crash/ProtocolRunner.jsx';
import AnchorsView from './crash/AnchorsView.jsx';
import DraftsView from './crash/DraftsView.jsx';

/**
 * Rx — the medication app.
 *
 * What this is for, day to day, is knowing what to take, when, whether it
 * happened, and how much is left. The crash protocol is a tool inside it rather
 * than the shape of it: it lives on its own route, reachable in one tap from
 * home, and it does not get to be the first thing on screen on an ordinary
 * Tuesday.
 *
 * Every screen is a real route. It used to be a `useState('home')` switch in
 * CrashProtocol.jsx, which meant the phone's back gesture left the app from any
 * sub-view and every deep link had to arrive as a `?open=` query parameter.
 */
export default function RxApp() {
  const { crashSessions, crashKit, notifPrefs, endCrashSession } = useApp();
  const kit = mergeKit(crashKit);
  const active = useMemo(() => activeSession(crashSessions), [crashSessions]);

  // A session left open overnight isn't live any more; close it out quietly so
  // it stops offering to resume. App-level rather than screen-level, because it
  // has to happen wherever the app is reopened.
  useEffect(() => {
    for (const s of staleSessions(crashSessions)) {
      endCrashSession(s.id, { outcome: s.outcome || null });
    }
  }, [crashSessions, endCrashSession]);

  // One buzz when the 30 minutes are up, saying only that.
  useEffect(() => {
    if (!active || !kit.notifyOnTimerEnd || notifPrefs.crash?.timerEnd === false) return undefined;
    const left = active.timerEndsAt - Date.now();
    if (left <= 0) return undefined;
    const id = setTimeout(() => {
      sendNotification('Your time is up', {
        body: 'Come back when you’re ready. Nothing had to be solved before now.',
        tag: `crash-${active.id}`,
      });
    }, left);
    return () => clearTimeout(id);
  }, [active, kit.notifyOnTimerEnd, notifPrefs.crash?.timerEnd]);

  // The pushed sub-pages take a back arrow; the five tabs don't, because the
  // nav is how you leave them. All of them fall back to home when there's no
  // history — which is what a notification tap or a shortcut looks like.
  const back = useBack('/');

  return (
    <>
      <LegacyLinks />
      <DailyReminders />
      <LearnedOnset />
      <Routes>
        <Route path="/" element={<RxHome />} />
        <Route path="/meds" element={<MedsView />} />
        <Route path="/meds/new" element={<MedPage />} />
        <Route path="/meds/:id" element={<MedPage />} />
        <Route path="/supply" element={<SupplyView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/notes" element={<Notebook />} />
        <Route path="/report" element={<Report />} />
        <Route path="/setup" element={<SettingsView />} />
        <Route path="/anchors" element={<AnchorsView onBack={back} />} />
        <Route path="/held" element={<DraftsView onBack={back} />} />
        <Route path="/crash" element={<CrashScreen active={active} />} />
        <Route path="/crash/run" element={<RunnerRoute active={active} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <NavUnlessRunning />
    </>
  );
}

/**
 * The tab bar, everywhere except inside a live protocol session.
 *
 * The runner is full-bleed and one-thing-at-a-time by design. Putting five
 * destinations along the bottom of it would undo the only thing that screen is
 * trying to do.
 */
function NavUnlessRunning() {
  const { pathname } = useLocation();
  if (pathname === '/crash/run') return null;
  return <RxNav />;
}

/**
 * The live protocol.
 *
 * Coming back after the timer ran out lands on closing the loop, not on
 * whichever step was open when the phone got put down.
 */
function RunnerRoute({ active }) {
  const { updateCrashSession } = useApp();
  const navigate = useNavigate();

  useEffect(() => {
    if (active && isTimerDone(active) && active.step !== 'close') {
      updateCrashSession(active.id, { step: 'close' });
    }
  }, [active, updateCrashSession]);

  if (!active) return <Navigate to="/crash" replace />;

  return (
    <ProtocolRunner
      session={active}
      onExit={() => navigate('/crash', { replace: true })}
      onOpenAnchors={() => navigate('/anchors')}
    />
  );
}

/**
 * The routine's waits and the water reminders, to the second while the app is
 * open.
 *
 * The scheduler covers the app being closed, but it only looks every few
 * minutes; a thirty-minute wait that buzzes at thirty-four is the kind of
 * drift that makes a routine stop feeling exact. Each timer here is armed for
 * the exact moment and, when it fires, records its tag so the scheduler
 * doesn't send the same thing again.
 *
 * Same privacy rule as the pushed ones: fixed words, never a step or a name.
 */
function DailyReminders() {
  const {
    crashMeds, crashDoses, crashKit, notifPrefs, rxRoutineRuns, rxWater, rxClientSent, markClientSent,
  } = useApp();
  const now = useNow({ tick: 60_000, syncKey: `${rxRoutineRuns.length}:${rxWater.length}:${crashDoses.length}` });
  const kit = mergeKit(crashKit);
  const prefs = notifPrefs.crash || {};
  const tracking = kit.doseTracking !== false;

  const wait = tracking && prefs.routineWait !== false
    ? nextWaitEnd(expectedDosesToday(crashMeds, crashDoses, now), rxRoutineRuns, now, now)
    : null;
  const waitKey = wait ? waitTag(wait.runId, wait.stepId) : null;

  // While a wait runs, a notification stays pinned with the time it ends, so
  // putting the phone down after eating doesn't mean losing track of it. It
  // is silent — the buzz is saved for when the wait is actually up. Shown once
  // per wait per session, so dismissing it isn't undone by reopening the app.
  // (A web notification can't tick, so it carries the end time, not a count.)
  useEffect(() => {
    if (!wait || rxClientSent[waitKey] || wait.endsAt <= Date.now()) return;
    const pinTag = `${waitKey}-pin`;
    try {
      if (sessionStorage.getItem(pinTag)) return;
      sessionStorage.setItem(pinTag, '1');
    } catch { /* private mode: pin anyway */ }
    sendNotification('Timer running', {
      body: `Take it at ${formatClock(wait.endsAt)}. This stays here until then.`,
      tag: pinTag, requireInteraction: true, silent: true, data: { url: '/Rx/' },
    });
  }, [waitKey, wait?.endsAt]);

  useEffect(() => {
    if (!wait || rxClientSent[waitKey]) return undefined;
    const id = setTimeout(() => {
      closeNotifications(`${waitKey}-pin`);
      // Stays on screen until it's dealt with, and buzzes — this is the one
      // that mustn't be missed.
      sendNotification('Your wait is up', {
        body: 'Take it now. Tap to log it.', tag: waitKey, requireInteraction: true,
        renotify: true, vibrate: [250, 120, 250, 120, 250], data: { url: '/Rx/' },
      });
      markClientSent(waitKey);
    }, Math.max(0, wait.endsAt - Date.now()));
    return () => clearTimeout(id);
  }, [waitKey, wait?.endsAt, rxClientSent[waitKey]]);

  // Once a routine's dose is logged, take down its pinned timer and its
  // "wait is up" — whichever of them is still on the lock screen.
  const settledWaits = tracking
    ? routinesForDay(expectedDosesToday(crashMeds, crashDoses, now), rxRoutineRuns, now, now)
      .filter((r) => r.steps.some((st) => st.kind === 'dose' && (st.state === 'done' || st.state === 'skipped')))
      .flatMap((r) => r.steps.filter((st) => st.kind === 'wait').map((st) => waitTag(runId(now, r.medId, r.slotId), st.id)))
    : [];
  const settledKey = settledWaits.join(',');
  useEffect(() => {
    for (const tag of settledWaits) {
      closeNotifications(tag);
      closeNotifications(`${tag}-pin`);
    }
  }, [settledKey]);

  const waterOn = tracking && prefs.water !== false;
  const waterDue = waterOn ? nextWaterDue(rxWater, crashDoses, kit.water, now) : null;

  useEffect(() => {
    if (waterDue == null) return undefined;
    const id = setTimeout(() => {
      const at = Date.now();
      const tag = waterReminderTag(rxWater, crashDoses, kit.water, at, dayKey(at));
      if (!tag || rxClientSent[tag]) return;
      sendNotification('Water', { body: 'Time for a glass.', tag, data: { url: '/Rx/' } });
      markClientSent(tag, at);
    }, Math.max(0, waterDue - Date.now()));
    return () => clearTimeout(id);
  }, [waterDue, rxWater.length]);

  return null;
}

/**
 * Crash timing that sets itself.
 *
 * A medication set to learn its timing has its onset replaced with the median
 * of what actually happened, once there are enough crashes to mean anything.
 * Writing it onto the medication — rather than computing it at read time —
 * is what lets the scheduler's heads-up use the same number without knowing
 * anything about sessions.
 */
function LearnedOnset() {
  const { crashMeds, crashDoses, crashSessions, updateCrashMed } = useApp();

  useEffect(() => {
    for (const raw of crashMeds) {
      const med = normalizeMed(raw);
      if (med.onsetSource !== 'learned' || med.active === false) continue;
      const learned = suggestedOnsetForMed(crashSessions, crashDoses, med.id);
      if (!learned) continue;
      if (Math.abs(learned.hours - med.onsetHours) < 0.05 && med.learnedSamples === learned.samples) continue;
      updateCrashMed(med.id, { onsetHours: learned.hours, learnedSamples: learned.samples });
    }
  }, [crashMeds, crashDoses, crashSessions, updateCrashMed]);

  return null;
}

/**
 * The URLs the old shape used, kept working.
 *
 * Push notifications already delivered carry `/reset/?open=anchors` and
 * `?start=1`, and the scheduler's dedupe map means one can be tapped up to a day
 * after it was sent. The `/reset/` path itself is redirected by a stub page; the
 * query parameters are handled here.
 */
function LegacyLinks() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (location.pathname !== '/') return;
    const open = params.get('open');
    const start = params.get('start');
    const log = params.get('log');
    if (!open && !start && !log) return;

    setParams({}, { replace: true });
    if (open === 'anchors') navigate('/anchors');
    else if (open === 'meds' || log === '1') navigate('/meds');
    else if (start === '1') navigate('/crash?start=1');
  }, [params, setParams, navigate, location.pathname]);

  return null;
}
