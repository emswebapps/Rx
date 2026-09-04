import { useState } from 'react';
import { Download, Share, X, Check, Plus } from 'lucide-react';
import { useInstall } from '../lib/useInstall.js';

/**
 * "Put Rx on your home screen."
 *
 * Worth its own component because an installed copy is not a nicety here. Dose
 * reminders arrive as push notifications, and on iOS a web app gets no push at
 * all until it has been added to the home screen — so an uninstalled Rx is an
 * Rx that silently never buzzes. Saying so once, plainly, is the difference
 * between a tracker that works and one that appears to.
 *
 * Two shapes, one behind one hook:
 *
 *   banner — raised unasked on Today, dismissible, and quiet for a fortnight
 *            once dismissed.
 *   row    — always in Settings while the app is in a browser tab, so someone
 *            who dismissed the banner and changed their mind can find it.
 */
export default function InstallCard({ variant = 'banner' }) {
  const { installed, method, showBanner, install, dismiss } = useInstall();
  const [showSteps, setShowSteps] = useState(false);

  if (installed || method === 'none') return null;
  if (variant === 'banner' && !showBanner) return null;

  const act = () => {
    if (method === 'prompt') install();
    else setShowSteps((v) => !v);
  };

  const label = method === 'prompt' ? 'Install Rx' : 'Add Rx to your home screen';

  if (variant === 'row') {
    return (
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={act}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.875rem 1rem', borderRadius: '0.875rem', cursor: 'pointer', textAlign: 'left',
            backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
          }}
        >
          {method === 'prompt'
            ? <Download size={17} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />
            : <Share size={17} style={{ color: 'var(--accent-text)', flexShrink: 0 }} />}
          <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 700, color: 'var(--text)' }}>
            {label}
          </span>
          <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-text)' }}>
            {method === 'prompt' ? 'Install' : (showSteps ? 'Hide' : 'How')}
          </span>
        </button>
        {showSteps && <IosSteps />}
      </div>
    );
  }

  return (
    <div
      className="app-card"
      style={{ padding: '1rem', marginTop: '1rem', border: '1px solid var(--accent)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
        {method === 'prompt'
          ? <Download size={17} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '0.125rem' }} />
          : <Share size={17} style={{ color: 'var(--accent-text)', flexShrink: 0, marginTop: '0.125rem' }} />}
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--text)' }}>
            {label}
          </p>
          <p style={{ fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5, marginTop: '0.25rem' }}>
            It opens without a browser bar, works with no signal, and it’s what
            lets your dose reminders reach your lock screen.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Not now"
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem',
            color: 'var(--muted)', flexShrink: 0,
          }}
        >
          <X size={15} />
        </button>
      </div>

      <button
        onClick={act}
        className="app-btn-primary"
        style={{ marginTop: '0.875rem' }}
      >
        {method === 'prompt' ? <Download size={16} /> : <Share size={16} />}
        {method === 'prompt' ? 'Install' : (showSteps ? 'Hide the steps' : 'Show me how')}
      </button>

      {showSteps && <IosSteps />}
    </div>
  );
}

/**
 * The three taps, in Safari's own words.
 *
 * There is no API for this — iOS fires no `beforeinstallprompt` and exposes no
 * way to ask — so the only honest thing an app can do is name the buttons.
 */
function IosSteps() {
  const steps = [
    { Icon: Share, text: 'Tap the Share button in Safari’s toolbar.' },
    { Icon: Plus, text: 'Scroll down and choose “Add to Home Screen”.' },
    { Icon: Check, text: 'Tap Add. Open Rx from the icon from now on.' },
  ];

  return (
    <ol style={{ display: 'grid', gap: '0.625rem', marginTop: '0.875rem', listStyle: 'none' }}>
      {steps.map(({ Icon, text }, i) => (
        <li key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
          <span style={{
            width: '1.375rem', height: '1.375rem', borderRadius: '9999px', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            backgroundColor: 'var(--surface2)', color: 'var(--accent-text)',
            fontSize: '0.6875rem', fontWeight: 800,
          }}>
            {i + 1}
          </span>
          <span style={{ flex: 1, fontSize: '0.8125rem', color: 'var(--subtle)', lineHeight: 1.5 }}>
            {text}
          </span>
          <Icon size={14} style={{ color: 'var(--muted)', flexShrink: 0, marginTop: '0.1875rem' }} />
        </li>
      ))}
    </ol>
  );
}
