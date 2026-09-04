import { useState, useEffect, useCallback, useMemo } from 'react';
import { Feather } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StepFrame, BigButton, SkipButton } from '../../components/stepUi.jsx';
import CountdownPill from './CountdownPill.jsx';
import ParkThought from './ParkThought.jsx';
import { nextStep, isLastStep, extendedEnd, isTimerDone } from '../../lib/protocol.js';
import { mergeKit } from '../../lib/kit.js';
import StepCheckIn from './steps/StepCheckIn.jsx';
import StepBrake from './steps/StepBrake.jsx';
import StepFactsStory from './steps/StepFactsStory.jsx';
import StepRate from './steps/StepRate.jsx';
import StepTomorrow from './steps/StepTomorrow.jsx';
import StepMove from './steps/StepMove.jsx';
import StepClose from './steps/StepClose.jsx';

export default function ProtocolRunner({ session, onExit, onOpenAnchors }) {
  const { settings, crashKit, updateCrashSession, endCrashSession, flushCrashSync } = useApp();
  const [parking, setParking] = useState(false);
  const kit = useMemo(() => mergeKit(crashKit), [crashKit]);
  const partnerName = kit.partnerName || settings.spouseName || '';

  const patch = useCallback((p) => updateCrashSession(session.id, p), [session.id, updateCrashSession]);

  // Round 6 sends you out of the app seconds after a step advances — right
  // inside the debounced cloud write. Flush on the way out so another device
  // doesn't resume a step behind.
  useEffect(() => {
    const flush = () => { if (document.visibilityState === 'hidden') flushCrashSync(); };
    const flushNow = () => flushCrashSync();
    window.addEventListener('pagehide', flushNow);
    document.addEventListener('visibilitychange', flush);
    return () => {
      window.removeEventListener('pagehide', flushNow);
      document.removeEventListener('visibilitychange', flush);
    };
  }, [flushCrashSync]);

  const goTo = (step) => patch({ step });
  const advance = () => {
    if (isLastStep(session.step)) {
      endCrashSession(session.id);
      onExit();
      return;
    }
    goTo(nextStep(session.step));
  };

  const extend = () => patch({ timerEndsAt: extendedEnd(session, 10) });

  const common = { session, kit, onPatch: patch };
  const screens = {
    checkin: <StepCheckIn {...common} />,
    brake: <StepBrake {...common} partnerName={partnerName} />,
    facts: <StepFactsStory {...common} />,
    rate: <StepRate {...common} onAdvance={advance} />,
    tomorrow: <StepTomorrow {...common} />,
    move: (
      <StepMove
        {...common}
        onOpenAnchors={onOpenAnchors}
        onOpenPark={() => setParking(true)}
        onGoTo={goTo}
      />
    ),
    close: <StepClose {...common} />,
  };

  const timeUp = isTimerDone(session);
  const primaryLabel =
    session.step === 'close' ? 'Done'
      : session.step === 'move' ? (timeUp ? 'I’m back' : 'I’ll come back when it goes off')
        : 'Next';

  const primary = () => {
    // On the move step the timer is the point: don't let "next" skip past it
    // while it's still running — jump straight to closing out when it isn't.
    if (session.step === 'move' && !timeUp) { onExit(); return; }
    advance();
  };

  return (
    <>
      <StepFrame
        step={session.step}
        onClose={onExit}
        timer={<CountdownPill session={session} onExtend={extend} />}
        footer={
          <>
            <BigButton onClick={primary}>{primaryLabel}</BigButton>
            {session.step !== 'close' && <SkipButton step={session.step} onClick={advance} />}
          </>
        }
      >
        {screens[session.step] || screens.checkin}
      </StepFrame>

      {/* Reachable from every step, because the thought doesn't wait its turn. */}
      <button
        onClick={() => setParking(true)}
        aria-label="Get a thought out"
        style={{
          position: 'fixed', right: '1rem', bottom: 'calc(9.5rem + env(safe-area-inset-bottom, 0px))',
          width: '3.25rem', height: '3.25rem', borderRadius: '9999px', zIndex: 58,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backgroundColor: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--muted)', cursor: 'pointer',
          boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
        }}
      >
        <Feather size={20} />
      </button>

      {parking && <ParkThought sessionId={session.id} onClose={() => setParking(false)} />}
    </>
  );
}
