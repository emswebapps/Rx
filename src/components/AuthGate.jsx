import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AppProvider, useApp } from '../context/AppContext';
import Login from './Login';

// The ground each theme paints, matching --bg in index.css. Installed, this is
// the colour the OS draws behind the status bar and around a rubber-band
// scroll, so a stale value shows as a dark band above a light app.
const THEME_COLOR = { dark: '#09090b', light: '#f9fafb' };

function ThemeSync() {
  const { settings } = useApp();
  useEffect(() => {
    const html = document.documentElement;
    const light = Boolean(settings.lightMode);
    html.classList.toggle('light', light);
    html.classList.toggle('dark', !light);
    html.style.colorScheme = light ? 'light' : 'dark';

    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLOR[light ? 'light' : 'dark']);
  }, [settings.lightMode]);
  return null;
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--bg)',
    }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: '2.5rem', height: '2.5rem', borderRadius: '50%',
          border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.8s linear infinite', margin: '0 auto',
        }} />
        <p style={{ color: 'var(--subtle)', fontSize: '0.875rem', marginTop: '1rem' }}>Loading…</p>
      </div>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}

/** Waits for auth, shows the login screen when signed out, mounts the app when in. */
export default function AuthGate({ children }) {
  const { user } = useAuth();

  if (user === undefined) return <LoadingScreen />;
  if (!user) return <Login />;

  return (
    <AppProvider uid={user.uid}>
      <ThemeSync />
      {children}
    </AppProvider>
  );
}
