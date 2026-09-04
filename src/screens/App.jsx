import { useEffect, useMemo } from 'react';
import { Routes, Route, Navigate, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { activeSession, staleSessions, isTimerDone } from '../lib/protocol.js';
import { mergeKit } from '../lib/kit.js';
import { sendNotification } from '../utils/notifications';
import { useBack } from '../lib/useBack.js';

import RxHome from './Today.jsx';
import RxNav from './Nav.jsx';
import MedsView from './Meds.jsx';
import MedPage from './MedPage.jsx';
import SupplyView from './Supply.jsx';
import HistoryView from './History.jsx';
import SettingsView from './Settings.jsx';
import Notebook from './Notebook.jsx';
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
      <Routes>
        <Route path="/" element={<RxHome />} />
        <Route path="/meds" element={<MedsView />} />
        <Route path="/meds/new" element={<MedPage />} />
        <Route path="/meds/:id" element={<MedPage />} />
        <Route path="/supply" element={<SupplyView />} />
        <Route path="/history" element={<HistoryView />} />
        <Route path="/notes" element={<Notebook />} />
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
