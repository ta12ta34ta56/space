import { useState } from 'react';
import { useAuthStore } from '../../stores/auth-store';
import { Icon } from '../Icon';
import { markUnlocked } from '../../services/admin-access';

/**
 * Stands in front of the admin panel.
 *
 * Three states:
 *  - **unclaimed** — first run, so offer to set the owner
 *  - **claimed, not the owner** — refuse, and offer the recovery code
 *  - **claimed and owner** — this component never renders
 *
 * The recovery code exists because locking yourself out of your own admin
 * panel, on a product where the owner is the only administrator, is a failure
 * with no way back.
 */
export function OwnerGate({ onClose }: { onClose: () => void }) {
  const { owner, claim, tryRecovery, user } = useAuthStore();
  const claimed = !!owner?.configured;

  const [email, setEmail] = useState(user()?.email ?? '');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const doClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const err = await claim(email, code);
    setBusy(false);
    if (err) { setError(err); return; }
    markUnlocked();
    onClose();
  };

  const doRecover = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const ok = await tryRecovery(recovery);
    setBusy(false);
    if (!ok) { setError('That recovery code is not right.'); return; }
    markUnlocked();
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={busy ? undefined : onClose}>
      <div className="modal owner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span>
            <Icon name="shield" size={14} />{' '}
            {claimed ? 'Owner only' : 'Set up owner access'}
          </span>
          {!busy && (
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <div className="modal-body">
          {!claimed ? (
            <form onSubmit={doClaim}>
              <p className="hint" style={{ marginBottom: 14 }}>
                The admin panel controls pricing and what every user can reach.
                Claim it now so nobody else can.
              </p>

              <span className="label">Your email</span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                disabled={busy}
              />
              <p className="hint" style={{ marginTop: 5 }}>
                The account with this email gets the admin panel.
              </p>

              <span className="label" style={{ marginTop: 12 }}>Recovery code</span>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="At least 8 characters"
                required
                disabled={busy}
              />
              <p className="hint" style={{ marginTop: 5 }}>
                Gets you back in if you lose access to that email.
                <strong> Write it down — it cannot be shown again.</strong>
              </p>

              {error && <div className="auth-error">{error}</div>}

              <button
                className="btn primary lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                disabled={busy}
                type="submit"
              >
                {busy ? 'Saving…' : 'Claim ownership'}
              </button>
            </form>
          ) : (
            <form onSubmit={doRecover}>
              <p className="hint" style={{ marginBottom: 14 }}>
                The admin panel is limited to the owner account
                {user() ? <> — you are signed in as <strong>{user()?.email}</strong></> : ' — you are not signed in'}.
                Sign in as the owner, or use your recovery code.
              </p>

              <span className="label">Recovery code</span>
              <input
                type="password"
                value={recovery}
                onChange={(e) => setRecovery(e.target.value)}
                autoComplete="one-time-code"
                required
                disabled={busy}
              />

              {error && <div className="auth-error">{error}</div>}

              <button
                className="btn primary lg"
                style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
                disabled={busy}
                type="submit"
              >
                {busy ? 'Checking…' : 'Unlock admin'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
