import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { AppProvider, useApp } from '../context/AppContext';
import Login from './Login';

function ThemeSync() {
  const { settings } = useApp();
  useEffect(() => {
    const html = document.documentElement;
    if (settings.lightMode) {
      html.classList.add('light');
      html.classList.remove('dark');
    } else {
      html.classList.add('dark');
      html.classList.remove('light');
    }
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
