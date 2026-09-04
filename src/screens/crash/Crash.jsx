import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Feather, Images, TrendingDown, Inbox, Activity } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useCountdown } from '../../lib/useCountdown.js';
import { timerRemaining, formatRemaining, isReleased } from '../../lib/protocol.js';
import { useBack } from '../../lib/useBack.js';
import { ViewHeader, pageStyle } from '../../components/medsUi.jsx';
import QuietRow from '../../components/QuietRow.jsx';
import ParkThought from './ParkThought.jsx';
import BehaviorCheck from './BehaviorCheck.jsx';

/**
 * The crash protocol, on its own screen.
 *
 * This used to be the home screen of the whole app, which put a panic button in
 * front of the person every morning when what they actually came to do was log
 * a dose. It is a tool now — one tap from home, and no further away than that,
 * because the moment it's needed is not a moment for navigating.
 *
 * Everything reachable from here is crash-specific. The medication screens are
 * deliberately not repeated: going back is one tap.
 */
export default function CrashScreen({ active }) {
  const { crashDrafts, crashAnchors, crashSessions, startCrashSession } = useApp();
  const navigate = useNavigate();
  const back = useBack('/');
  const now = useCountdown(active?.timerEndsAt);
  const [params, setParams] = useSearchParams();
  const [parking, setParking] = useState(false);
  const [checking, setChecking] = useState(false);

  const held = crashDrafts.filter((d) => d.status === 'held');
  const ready = held.filter((d) => isReleased(d, now));
  const done = crashSessions.filter((s) => s.endedAt).length;

  const start = () => { startCrashSession(); navigate('/crash/run'); };

  // The home-screen shortcut and the old push links land here with ?start=1 and
  // go straight in. Resuming rather than starting when something is already
  // open — a second session on top of a live one loses the first one's facts.
  useEffect(() => {
    if (params.get('start') !== '1') return;
    setParams({}, { replace: true });
    if (active) navigate('/crash/run', { replace: true });
    else start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  return (
    <div className="app-page" style={pageStyle}>
      <ViewHeader title="Crash protocol" onBack={back} />

      {active ? (
        <button
          onClick={() => navigate('/crash/run')}
          style={{
            width: '100%', minHeight: '8.75rem', borderRadius: '1.25rem', border: 'none',
            backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '0.375rem', padding: '1.5rem',
          }}
        >
          <span style={{ fontSize: '1.375rem', fontWeight: 800 }}>Pick it back up</span>
          <span style={{ fontSize: '1rem', opacity: 0.9, fontVariantNumeric: 'tabular-nums' }}>
            {timerRemaining(active, now) > 0
              ? `${formatRemaining(timerRemaining(active, now))} left`
              : 'The 30 minutes are up'}
          </span>
        </button>
      ) : (
        <button
          onClick={start}
          style={{
            width: '100%', minHeight: '8.75rem', borderRadius: '1.25rem', border: 'none',
            backgroundColor: 'var(--accent)', color: '#fff', cursor: 'pointer',
            fontSize: '1.625rem', fontWeight: 800, letterSpacing: '-0.01em', padding: '1.5rem',
          }}
        >
          I’m crashing
        </button>
      )}

      <div style={{ display: 'grid', gap: '0.5rem', marginTop: '1.25rem' }}>
        <QuietRow Icon={Feather} label="Just get the thought out" onClick={() => setParking(true)} />
        <QuietRow Icon={Activity} label="How am I doing?" onClick={() => setChecking(true)} />
        <QuietRow
          Icon={Images}
          label="Read my anchors"
          detail={crashAnchors.length || null}
          onClick={() => navigate('/anchors')}
        />
        <QuietRow
          Icon={Inbox}
          label="Held until tomorrow"
          detail={held.length ? `${held.length}${ready.length ? ` · ${ready.length} ready` : ''}` : null}
          onClick={() => navigate('/held')}
        />
        <QuietRow
          Icon={TrendingDown}
          label="What usually happens"
          detail={done || null}
          onClick={() => navigate('/history?tab=sessions')}
        />
      </div>

      {parking && <ParkThought onClose={() => setParking(false)} />}
      {checking && <BehaviorCheck onClose={() => setChecking(false)} />}
    </div>
  );
}
