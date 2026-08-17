import { useState } from 'react';
import { auth } from '../../services/auth';

interface AdminAuthGateProps {
  authStatus: 'unauthenticated' | 'forbidden' | 'network_error' | 'loading';
  errorMessage?: string | null;
  currentEmail?: string | null;
  onLoginSuccess: (token: string, email: string) => void;
  onRetry: () => void;
  onSignOut: () => void;
}

export function AdminAuthGate({
  authStatus,
  errorMessage,
  currentEmail,
  onLoginSuccess,
  onRetry,
  onSignOut,
}: AdminAuthGateProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBusy(true);
      setLoginError(null);
      const res = await auth.signIn(email.trim(), password.trim());

      if (!res.ok || !res.session) {
        setLoginError(res.error || 'Authentication failed. Invalid email or password.');
        return;
      }

      onLoginSuccess(res.session.token, res.session.user.email || email.trim());
    } catch (err: unknown) {
      const e = err as { message?: string };
      setLoginError(e.message || 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  if (authStatus === 'loading') {
    return (
      <div className="adm-auth-box">
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Verifying Owner Authorization…</div>
          <p className="adm-subtitle" style={{ marginTop: 8 }}>Validating credentials with server requireOwner guard…</p>
        </div>
      </div>
    );
  }

  if (authStatus === 'forbidden') {
    return (
      <div className="adm-auth-box">
        <div className="adm-alert adm-alert-danger" style={{ marginBottom: 20 }}>
          <div>
            <strong>403 Forbidden: Access Denied</strong>
            <p style={{ marginTop: 6, fontSize: 12 }}>
              Account <strong>{currentEmail}</strong> is authenticated, but is not designated as an owner (<code>is_owner === true</code>) in the database.
            </p>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--adm-text-secondary)', marginBottom: 20 }}>
          Server authority strictly rejects non-owner accounts from accessing the control plane.
        </p>

        <button
          className="adm-btn adm-btn-primary"
          style={{ width: '100%' }}
          onClick={onSignOut}
        >
          Sign In with Owner Account
        </button>
      </div>
    );
  }

  if (authStatus === 'network_error') {
    return (
      <div className="adm-auth-box">
        <div className="adm-alert adm-alert-warn" style={{ marginBottom: 20 }}>
          <div>
            <strong>Server Unavailable</strong>
            <p style={{ marginTop: 6, fontSize: 12 }}>
              {errorMessage || 'Cannot connect to the Novelka API server. Please check backend status.'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="adm-btn adm-btn-primary" style={{ flex: 1 }} onClick={onRetry}>
            Retry Connection
          </button>
          <button className="adm-btn adm-btn-secondary" onClick={onSignOut}>
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="adm-auth-box">
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Novelka Control Plane</h2>
        <p className="adm-subtitle">Owner Authentication & Backend Administration</p>
      </div>

      <form onSubmit={handlePasswordLogin}>
        <div style={{ marginBottom: 14 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Owner Email
          </label>
          <input
            type="email"
            className="adm-input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@domain.com"
            required
            disabled={busy}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
            Password
          </label>
          <input
            type="password"
            className="adm-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••••••"
            required
            disabled={busy}
          />
        </div>

        {loginError && (
          <div className="adm-alert adm-alert-danger" style={{ marginBottom: 16 }}>
            {loginError}
          </div>
        )}

        <button
          type="submit"
          className="adm-btn adm-btn-primary"
          style={{ width: '100%', padding: '10px 0' }}
          disabled={busy}
        >
          {busy ? 'Authenticating…' : 'Sign in as Owner'}
        </button>
      </form>
    </div>
  );
}
