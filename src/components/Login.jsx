import { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';
import { ArrowRight, Mail, Lock, UserPlus } from 'lucide-react';

/**
 * The signed-out screen.
 *
 * The same Firebase project as the finance app, so signing in here signs you
 * into the same account and finds the dose history already there.
 */
export default function Login({ title = 'Rx', icon = '/Rx/icon-192.png' }) {
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    if (!email || !password) { setError('Enter your email and password.'); return; }
    setLoading(true);
    setError('');
    try {
      if (mode === 'signin') {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        if (password.length < 6) { setError('Password must be at least 6 characters.'); setLoading(false); return; }
        await createUserWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      const msg = {
        'auth/user-not-found': 'No account found. Create one below.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/email-already-in-use': 'An account with this email already exists.',
        'auth/invalid-credential': 'Incorrect email or password.',
        'auth/too-many-requests': 'Too many attempts. Try again later.',
      }[err.code] || 'Something went wrong. Try again.';
      setError(msg);
    }
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: '100svh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      backgroundColor: 'var(--bg)', padding: '1.5rem',
    }}>
      <div style={{ width: '100%', maxWidth: '22rem' }}>

        {/* App icon + title */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <img
            src={icon}
            alt=""
            style={{ width: '5rem', height: '5rem', borderRadius: '1.25rem', margin: '0 auto 1rem', display: 'block', objectFit: 'cover' }}
          />
          <h1 style={{ fontSize: '1.75rem', fontWeight: '900', color: 'var(--text)', letterSpacing: '-0.02em' }}>
            {title}
          </h1>
          <p style={{ fontSize: '0.9375rem', color: 'var(--muted)', marginTop: '0.375rem' }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
          </p>
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: '1.25rem', padding: '1.5rem',
        }}>
          <div style={{ marginBottom: '1rem' }}>
            <label className="app-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Mail size={13} /> Email
            </label>
            <input
              className="app-input"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              autoFocus
            />
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label className="app-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <Lock size={13} /> Password
            </label>
            <input
              className="app-input"
              type="password"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              placeholder={mode === 'signin' ? '••••••••' : 'At least 6 characters'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {error && (
            <p style={{ color: 'var(--danger)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>{error}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="app-btn-primary"
            style={{ opacity: loading ? 0.7 : 1 }}
          >
            {loading ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : (
              <>{mode === 'signin' ? <ArrowRight size={18} /> : <UserPlus size={18} />}
              {mode === 'signin' ? 'Sign In' : 'Create Account'}</>
            )}
          </button>
        </div>

        {/* Toggle mode */}
        <p style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.9rem', color: 'var(--muted)' }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}
            style={{ color: 'var(--accent-text)', fontWeight: '700', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem' }}
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
