import { useEffect, useState } from 'react';
import { adminApi, type AdminUserRecord } from '../api';

interface AdminUsersProps {
  token: string;
}

export function AdminUsers({ token }: AdminUsersProps) {
  const [users, setUsers] = useState<AdminUserRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(0);
  const limit = 25;

  // Selected user for Tier Override Modal
  const [targetUser, setTargetUser] = useState<AdminUserRecord | null>(null);
  const [selectedTier, setSelectedTier] = useState<'free' | 'basic' | 'pro' | 'enterprise'>('pro');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideBusy, setOverrideBusy] = useState(false);
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [auditMessage, setAuditMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadUsers() {
      try {
        setLoading(true);
        const res = await adminApi.getUsers(token, limit, page * limit, search);
        if (!active) return;
        setUsers(res.users ?? []);
        setTotal(res.total ?? 0);
      } catch (err: unknown) {
        if (!active) return;
        const e = err as { message?: string };
        setOverrideError(e.message ?? 'Failed to load users list.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadUsers();
    return () => { active = false; };
  }, [token, page, search]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const openOverrideModal = (user: AdminUserRecord) => {
    setTargetUser(user);
    setSelectedTier(user.tier);
    setOverrideReason('');
    setOverrideError(null);
  };

  const handleTierOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUser) return;
    if (!overrideReason.trim()) {
      setOverrideError('A specific reason is required for manual tier overrides (recorded in immutable audit logs).');
      return;
    }

    try {
      setOverrideBusy(true);
      setOverrideError(null);
      const res = await adminApi.updateUserTier(token, targetUser.id, selectedTier, overrideReason.trim());
      setAuditMessage(`Tier for ${targetUser.email} updated to '${res.newTier}'. Audit log written.`);
      // Update local state
      setUsers((prev) =>
        prev.map((u) => (u.id === targetUser.id ? { ...u, tier: selectedTier as AdminUserRecord['tier'] } : u)),
      );
      setTargetUser(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setOverrideError(e.message ?? 'Failed to override user tier.');
    } finally {
      setOverrideBusy(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="adm-view">
      <div className="adm-title-row">
        <div>
          <h1 className="adm-title">User Accounts</h1>
          <p className="adm-subtitle">Manage registered accounts, plan tiers, and administrative roles.</p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              className="adm-input"
              style={{ width: 260 }}
              placeholder="Search by email or name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search users"
            />
            <button type="submit" className="adm-btn adm-btn-secondary">
              Search
            </button>
            {search && (
              <button
                type="button"
                className="adm-btn adm-btn-secondary"
                onClick={() => {
                  setSearchInput('');
                  setSearch('');
                  setPage(0);
                }}
              >
                Clear
              </button>
            )}
          </form>
        </div>
      </div>

      {auditMessage && (
        <div className="adm-alert adm-alert-success" style={{ marginBottom: 16 }}>
          <span>✓ {auditMessage}</span>
          <button
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
            onClick={() => setAuditMessage(null)}
          >
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="adm-empty">Loading user accounts…</div>
      ) : users.length === 0 ? (
        <div className="adm-card adm-empty">
          No users match the search criteria “{search}”.
        </div>
      ) : (
        <>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Tier</th>
                  <th>Role</th>
                  <th>Stripe Customer</th>
                  <th>Registered</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.displayName || 'No Name'}</div>
                      <div style={{ fontSize: 12, color: 'var(--adm-text-muted)' }}>{u.email}</div>
                    </td>
                    <td>
                      <span className={`adm-badge adm-badge-${u.tier}`}>
                        {u.tier.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {u.isOwner ? (
                        <span className="adm-badge adm-badge-owner">Owner</span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--adm-text-muted)' }}>Customer</span>
                      )}
                    </td>
                    <td>
                      {u.stripeCustomerId ? (
                        <code style={{ fontSize: 11 }}>{u.stripeCustomerId}</code>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--adm-text-muted)' }}>None</span>
                      )}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--adm-text-muted)', whiteSpace: 'nowrap' }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => openOverrideModal(u)}
                      >
                        Override Tier
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--adm-text-muted)' }}>
              Showing {users.length} of {total} accounts (Page {page + 1} of {Math.max(totalPages, 1)})
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="adm-btn adm-btn-secondary adm-btn-sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
              >
                ← Previous
              </button>
              <button
                className="adm-btn adm-btn-secondary adm-btn-sm"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}

      {/* Tier Override Modal */}
      {targetUser && (
        <div className="adm-modal-backdrop" onClick={() => !overrideBusy && setTargetUser(null)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3>Override User Tier</h3>
              {!overrideBusy && (
                <button
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  onClick={() => setTargetUser(null)}
                >
                  ✕
                </button>
              )}
            </div>

            <form onSubmit={handleTierOverride}>
              <div className="adm-modal-body">
                <div className="adm-alert adm-alert-warn">
                  <div>
                    <strong>Administrative Action:</strong> This overrides the subscription plan for account{' '}
                    <strong>{targetUser.email}</strong> on the server.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    Select New Subscription Tier
                  </label>
                  <select
                    className="adm-select"
                    value={selectedTier}
                    onChange={(e) => setSelectedTier(e.target.value as typeof selectedTier)}
                    disabled={overrideBusy}
                  >
                    <option value="free">Free ($0 — Watermarked, 5 daily exports)</option>
                    <option value="basic">Basic ($4.99 — Watermark-free, published templates)</option>
                    <option value="pro">Pro ($9.99 — All puzzle makers, custom styling)</option>
                    <option value="enterprise">Enterprise ($24.99 — Commercial license, priority compute)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                    Reason for Manual Override <span style={{ color: 'var(--adm-danger)' }}>*</span>
                  </label>
                  <textarea
                    className="adm-textarea"
                    rows={3}
                    placeholder="e.g. Enterprise partner agreement #402 / VIP author grant"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    required
                    disabled={overrideBusy}
                  />
                  <span style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 4, display: 'block' }}>
                    Required. Recorded in immutable security audit logs with your owner ID.
                  </span>
                </div>

                {overrideError && (
                  <div className="adm-alert adm-alert-danger">
                    {overrideError}
                  </div>
                )}
              </div>

              <div className="adm-modal-footer">
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => setTargetUser(null)}
                  disabled={overrideBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adm-btn adm-btn-primary"
                  disabled={overrideBusy || !overrideReason.trim()}
                >
                  {overrideBusy ? 'Updating…' : 'Confirm & Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
