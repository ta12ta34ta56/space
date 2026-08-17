import { useState } from 'react';
import { useAccessToken, useAuthStore } from '../../stores/auth-store';
import { isSupabaseConfigured } from '../../services/auth';
import { deleteMyAccount, downloadMyData } from '../../services/payments';
import { TIERS } from '../../services/feature-flags';
import { Icon } from '../Icon';

/**
 * Sign in / create an account / manage the account you are signed in with.
 *
 * Deliberately small: an account exists so a plan can follow the user, not as
 * a wall in front of the editor. Anyone can keep working signed out — the
 * prompt to sign in only appears when a plan is involved.
 *
 * Signed-in users land on the account view: plan, GDPR export (Art. 15/20)
 * and erasure (Art. 17), and sign-out.
 */

type Mode = 'in' | 'up';

export function AuthModal({
  onClose,
  initialMode = 'in',
}: {
  onClose: () => void;
  initialMode?: Mode;
}) {
  const { signIn, signUp, signOut } = useAuthStore();
  const session = useAuthStore((s) => s.session);
  const accessToken = useAccessToken();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [gdprBusy, setGdprBusy] = useState(false);
  const [gdprMessage, setGdprMessage] = useState('');
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = mode === 'in'
      ? await signIn(email, password)
      : await signUp(email, password, name);
    setBusy(false);
    if (err) setError(err);
    else onClose();
  };

  const download = async () => {
    if (!accessToken) return;
    setGdprBusy(true);
    setGdprMessage('');
    try {
      await downloadMyData(accessToken);
      setGdprMessage('Your data is downloading.');
    } catch (e) {
      setGdprMessage(e instanceof Error ? e.message : 'Could not build your export.');
    } finally {
      setGdprBusy(false);
    }
  };

  const removeAccount = async () => {
    if (!accessToken || !session) return;
    setGdprBusy(true);
    setGdprMessage('');
    try {
      const r = await deleteMyAccount(deleteEmail.trim(), accessToken);
      setGdprMessage(r.message);
      setDeleteArmed(false);
      await signOut();
      onClose();
    } catch (e) {
      setGdprMessage(e instanceof Error ? e.message : 'Could not delete the account.');
    } finally {
      setGdprBusy(false);
    }
  };

  // ---- signed in: account view --------------------------------------------
  if (session) {
    const user = session.user;
    const tierName = TIERS.find((t) => t.id === user.tier)?.name ?? user.tier;
    const deleteReady = deleteArmed && deleteEmail.trim().toLowerCase() === user.email.toLowerCase();
    return (
      <div className="modal-backdrop" onClick={busy || gdprBusy ? undefined : onClose}>
        <div className="modal auth-modal" onClick={(e) => e.stopPropagation()}>
          <div className="modal-head">
            <span>Account</span>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="modal-body">
            <div className="account-row">
              <div>
                <strong>{user.displayName}</strong>
                <span className="hint" style={{ display: 'block' }}>{user.email}</span>
              </div>
              <span className="tile-lock pro" style={{ position: 'static' }}>{tierName}</span>
            </div>

            {isSupabaseConfigured() ? (
              <p className="hint" style={{ marginTop: 8 }}>
                Your plan follows this account. Manage billing from the upgrade
                prompt or the billing portal.
              </p>
            ) : (
              <p className="hint" style={{ marginTop: 8 }}>
                Local demo account — accounts live in this browser until the
                server is connected.
              </p>
            )}

            <div className="section" style={{ marginTop: 14 }}>
              <div className="section-title">Your data</div>
              <button className="btn" style={{ width: '100%' }} onClick={download} disabled={gdprBusy || !accessToken}>
                <Icon name="download" size={13} /> Download everything about me
              </button>
              <p className="hint" style={{ marginTop: 6 }}>
                A machine-readable copy of everything this account has stored
                (GDPR Articles 15 &amp; 20).
              </p>

              {!deleteArmed ? (
                <button
                  className="btn danger"
                  style={{ width: '100%', marginTop: 10 }}
                  onClick={() => setDeleteArmed(true)}
                  disabled={gdprBusy}
                >
                  Delete my account…
                </button>
              ) : (
                <div className="stack" style={{ gap: 6, marginTop: 10 }}>
                  <p className="hint">
                    This is permanent. Type <strong>{user.email}</strong> to confirm
                    (GDPR Article 17). Subscriptions are cancelled first; invoice
                    records are kept as the law requires.
                  </p>
                  <input
                    value={deleteEmail}
                    onChange={(e) => setDeleteEmail(e.target.value)}
                    placeholder={user.email}
                    autoComplete="off"
                  />
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      className="btn"
                      style={{ flex: 1 }}
                      onClick={() => { setDeleteArmed(false); setDeleteEmail(''); }}
                      disabled={gdprBusy}
                    >
                      Keep my account
                    </button>
                    <button
                      className="btn danger"
                      style={{ flex: 1 }}
                      onClick={removeAccount}
                      disabled={!deleteReady || gdprBusy}
                    >
                      {gdprBusy ? 'Deleting…' : 'Delete permanently'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {gdprMessage && <p className="hint" style={{ marginTop: 10, color: 'var(--bad)' }}>{gdprMessage}</p>}

            <button
              className="btn"
              style={{ width: '100%', marginTop: 14 }}
              onClick={() => void signOut().then(onClose)}
              disabled={gdprBusy}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- signed out: sign in / create account -------------------------------
  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal auth-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>{mode === 'in' ? 'Sign in' : 'Create an account'}</span>
          {!busy && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <form className="modal-body" onSubmit={submit}>
          <p className="hint" style={{ marginBottom: 14 }}>
            {mode === 'in'
              ? 'Your plan and saved books follow your account.'
              : 'Free to start — no card needed.'}
          </p>

          {mode === 'up' && (
            <>
              <span className="label">Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Optional"
                autoComplete="name"
                disabled={busy}
              />
            </>
          )}

          <span className="label" style={{ marginTop: 10 }}>Email</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            disabled={busy}
          />

          <span className="label" style={{ marginTop: 10 }}>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required
            disabled={busy}
          />
          {mode === 'up' && (
            <p className="hint" style={{ marginTop: 5 }}>At least 8 characters.</p>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button
            className="btn primary lg"
            style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
            disabled={busy}
            type="submit"
          >
            {busy ? 'Working…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>

          <button
            type="button"
            className="auth-switch"
            onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); }}
            disabled={busy}
          >
            {mode === 'in'
              ? "Don't have an account? Create one"
              : 'Already have an account? Sign in'}
          </button>

          <p className="hint auth-note">
            {isSupabaseConfigured()
              ? 'Accounts are verified with the Novelka server.'
              : 'Accounts are stored in this browser for now. Real sign-in arrives with the backend — nothing here is a security boundary yet.'}
          </p>
        </form>
      </div>
    </div>
  );
}
