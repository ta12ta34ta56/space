import { useEffect, useState } from 'react';
import { adminApi, type AdminFeatureFlag } from '../api';

interface AdminFlagsProps {
  token: string;
}

export function AdminFlags({ token }: AdminFlagsProps) {
  const [flags, setFlags] = useState<AdminFeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditMessage, setAuditMessage] = useState<string | null>(null);

  // Selected flag for editing
  const [editingFlag, setEditingFlag] = useState<AdminFeatureFlag | null>(null);
  const [formState, setFormState] = useState<{
    enabled: boolean;
    routeFree: boolean;
    routePaid: boolean;
    routeAd: boolean;
    minTier: 'free' | 'basic' | 'pro' | 'enterprise';
    dailyLimit: string;
    note: string;
    reason: string;
  }>({
    enabled: true,
    routeFree: true,
    routePaid: true,
    routeAd: false,
    minTier: 'basic',
    dailyLimit: '',
    note: '',
    reason: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadFlags() {
      try {
        setLoading(true);
        setError(null);
        const res = await adminApi.getFlags(token);
        if (!active) return;
        setFlags(res.flags ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const e = err as { message?: string };
        setError(e.message ?? 'Failed to load feature flags.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadFlags();
    return () => { active = false; };
  }, [token]);

  const openEditModal = (flag: AdminFeatureFlag) => {
    setEditingFlag(flag);
    setFormState({
      enabled: flag.enabled,
      routeFree: flag.routeFree,
      routePaid: flag.routePaid,
      routeAd: flag.routeAd,
      minTier: flag.minTier,
      dailyLimit: flag.dailyLimit !== null && flag.dailyLimit !== undefined ? String(flag.dailyLimit) : '',
      note: flag.note || '',
      reason: '',
    });
    setSaveError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingFlag) return;

    try {
      setSaving(true);
      setSaveError(null);

      const parsedLimit = formState.dailyLimit.trim() === '' ? null : parseInt(formState.dailyLimit, 10);
      const payload: Partial<AdminFeatureFlag> = {
        enabled: formState.enabled,
        routeFree: formState.routeFree,
        routePaid: formState.routePaid,
        routeAd: formState.routeAd,
        minTier: formState.minTier,
        dailyLimit: Number.isFinite(parsedLimit) ? parsedLimit : null,
        note: formState.note.trim(),
      };

      const res = await adminApi.updateFlag(token, editingFlag.featureId, payload, formState.reason.trim());
      setAuditMessage(`Feature flag '${res.featureId}' updated successfully. Audit entry recorded.`);

      // Update local state
      setFlags((prev) =>
        prev.map((f) => (f.featureId === editingFlag.featureId ? { ...f, ...payload, updatedAt: res.updatedAt } : f)),
      );
      setEditingFlag(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSaveError(e.message ?? 'Failed to update feature flag.');
    } finally {
      setSaving(false);
    }
  };

  function describeBehavior(flag: AdminFeatureFlag): string {
    if (!flag.enabled) {
      return 'Globally disabled (switched OFF for all tiers).';
    }
    if (flag.routeFree) {
      const cap = flag.dailyLimit ? ` with a ${flag.dailyLimit} exports/day quota` : ' with unlimited quota';
      return `Free route active: Available to all registered users${cap}.`;
    }
    return `Paid gated: Requires ${flag.minTier.toUpperCase()} tier or higher (unlimited).`;
  }

  return (
    <div className="adm-view">
      <div className="adm-title-row">
        <div>
          <h1 className="adm-title">Plans & Feature Gating</h1>
          <p className="adm-subtitle">Server-authoritative feature toggles, route gating, and daily quotas.</p>
        </div>
        <div className="adm-badge adm-badge-published">
          Server Enforced via PostgreSQL RPC
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

      {error && (
        <div className="adm-alert adm-alert-danger" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="adm-empty">Loading feature flags…</div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Feature Code</th>
                <th>Status</th>
                <th>Effective Behavior</th>
                <th>Min Tier</th>
                <th>Daily Limit</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((flag) => (
                <tr key={flag.featureId}>
                  <td>
                    <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--adm-primary)' }}>
                      {flag.featureId}
                    </code>
                    {flag.note && (
                      <div style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 2 }}>
                        {flag.note}
                      </div>
                    )}
                  </td>
                  <td>
                    {flag.enabled ? (
                      <span className="adm-badge adm-badge-published">Enabled</span>
                    ) : (
                      <span className="adm-badge adm-badge-archived">Disabled</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--adm-text-secondary)' }}>
                    {describeBehavior(flag)}
                  </td>
                  <td>
                    <span className={`adm-badge adm-badge-${flag.minTier}`}>
                      {flag.minTier.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {flag.dailyLimit !== null ? (
                      <span style={{ fontWeight: 600 }}>{flag.dailyLimit} / day</span>
                    ) : (
                      <span style={{ color: 'var(--adm-text-muted)' }}>Unlimited</span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="adm-btn adm-btn-secondary adm-btn-sm"
                      onClick={() => openEditModal(flag)}
                    >
                      Configure
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Flag Modal */}
      {editingFlag && (
        <div className="adm-modal-backdrop" onClick={() => !saving && setEditingFlag(null)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3>Configure Flag: <code>{editingFlag.featureId}</code></h3>
              {!saving && (
                <button
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  onClick={() => setEditingFlag(null)}
                >
                  ✕
                </button>
              )}
            </div>

            <form onSubmit={handleSave}>
              <div className="adm-modal-body">
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formState.enabled}
                      onChange={(e) => setFormState({ ...formState, enabled: e.target.checked })}
                      disabled={saving}
                    />
                    <strong style={{ fontSize: 13 }}>Enable this feature globally</strong>
                  </label>
                  <p style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginLeft: 22, marginTop: 2 }}>
                    If unchecked, all requests for this feature fail closed with 403 Forbidden.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Free Route
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formState.routeFree}
                        onChange={(e) => setFormState({ ...formState, routeFree: e.target.checked })}
                        disabled={saving}
                      />
                      Permit Free Tier
                    </label>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Paid Route
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formState.routePaid}
                        onChange={(e) => setFormState({ ...formState, routePaid: e.target.checked })}
                        disabled={saving}
                      />
                      Permit Paid Tiers
                    </label>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Minimum Required Tier
                    </label>
                    <select
                      className="adm-select"
                      value={formState.minTier}
                      onChange={(e) => setFormState({ ...formState, minTier: e.target.value as typeof formState.minTier })}
                      disabled={saving}
                    >
                      <option value="free">Free</option>
                      <option value="basic">Basic ($4.99)</option>
                      <option value="pro">Pro ($9.99)</option>
                      <option value="enterprise">Enterprise ($24.99)</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Daily Limit (Free Tier)
                    </label>
                    <input
                      type="number"
                      min={0}
                      className="adm-input"
                      placeholder="Blank for unlimited"
                      value={formState.dailyLimit}
                      onChange={(e) => setFormState({ ...formState, dailyLimit: e.target.value })}
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Operational Note
                  </label>
                  <input
                    type="text"
                    className="adm-input"
                    placeholder="Short description for admin reference"
                    value={formState.note}
                    onChange={(e) => setFormState({ ...formState, note: e.target.value })}
                    disabled={saving}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Reason for Configuration Change
                  </label>
                  <input
                    type="text"
                    className="adm-input"
                    placeholder="e.g. Increased daily quota for holiday campaign"
                    value={formState.reason}
                    onChange={(e) => setFormState({ ...formState, reason: e.target.value })}
                    disabled={saving}
                  />
                </div>

                {saveError && (
                  <div className="adm-alert adm-alert-danger">
                    {saveError}
                  </div>
                )}
              </div>

              <div className="adm-modal-footer">
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => setEditingFlag(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adm-btn adm-btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
