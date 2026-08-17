import { useEffect, useState } from 'react';
import { adminApi, type AdminOverviewMetrics, type AdminAuditLogRecord } from '../api';

interface AdminOverviewProps {
  token: string;
  onNavigateTab: (tab: 'users' | 'flags' | 'templates' | 'audit') => void;
}

export function AdminOverview({ token, onNavigateTab }: AdminOverviewProps) {
  const [metrics, setMetrics] = useState<AdminOverviewMetrics | null>(null);
  const [recentLogs, setRecentLogs] = useState<AdminAuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const [overviewRes, logsRes] = await Promise.all([
          adminApi.getOverview(token),
          adminApi.getAuditLogs(token, 5, 0),
        ]);
        if (!active) return;
        setMetrics(overviewRes.metrics);
        setRecentLogs(logsRes.logs ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const e = err as { message?: string };
        setError(e.message ?? 'Failed to load platform overview.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadData();
    return () => { active = false; };
  }, [token]);

  if (loading) {
    return <div className="adm-empty">Loading platform overview metrics…</div>;
  }

  if (error || !metrics) {
    return (
      <div className="adm-alert adm-alert-danger" style={{ marginTop: 20 }}>
        <strong>Error:</strong> {error ?? 'Could not retrieve operational metrics.'}
      </div>
    );
  }

  const { tierBreakdown, templates } = metrics;

  return (
    <div className="adm-view">
      <div className="adm-title-row">
        <div>
          <h1 className="adm-title">Platform Overview</h1>
          <p className="adm-subtitle">Real-time authoritative metrics from database and server router.</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="adm-badge adm-badge-published">
            API Online · Server Authoritative
          </span>
        </div>
      </div>

      {/* Top Level Metric Cards */}
      <div className="adm-grid-4">
        <div className="adm-card" style={{ cursor: 'pointer' }} onClick={() => onNavigateTab('users')}>
          <div className="adm-stat-label">Total Users</div>
          <div className="adm-stat-val">{metrics.totalUsers}</div>
          <div className="adm-stat-sub">
            {metrics.activeSubscriptions} active paid subscription{metrics.activeSubscriptions === 1 ? '' : 's'}
          </div>
        </div>

        <div className="adm-card">
          <div className="adm-stat-label">Exports Today</div>
          <div className="adm-stat-val">{metrics.dailyExportsToday}</div>
          <div className="adm-stat-sub">PDF generation usage events (UTC)</div>
        </div>

        <div className="adm-card" style={{ cursor: 'pointer' }} onClick={() => onNavigateTab('templates')}>
          <div className="adm-stat-label">Templates Published</div>
          <div className="adm-stat-val">{templates.published}</div>
          <div className="adm-stat-sub">
            {templates.draft} draft · {templates.unpublished + templates.archived} unpublished/archived
          </div>
        </div>

        <div className="adm-card" style={{ cursor: 'pointer' }} onClick={() => onNavigateTab('flags')}>
          <div className="adm-stat-label">Monetization Plans</div>
          <div className="adm-stat-val">4 Tiers</div>
          <div className="adm-stat-sub">Free · Basic ($4.99) · Pro ($9.99) · Ent ($24.99)</div>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="adm-grid-2">
        {/* User Tier Breakdown */}
        <div className="adm-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Account Tier Breakdown</h3>
            <button
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => onNavigateTab('users')}
            >
              Manage Users →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--adm-bg-elevated)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="adm-badge adm-badge-free">Free</span>
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Watermarked exports, 5/day cap</span>
              </div>
              <strong style={{ fontSize: 15 }}>{tierBreakdown.free}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--adm-bg-elevated)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="adm-badge adm-badge-basic">Basic</span>
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Watermark-free, published templates</span>
              </div>
              <strong style={{ fontSize: 15 }}>{tierBreakdown.basic}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--adm-bg-elevated)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="adm-badge adm-badge-pro">Pro</span>
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Full puzzles & styling suites</span>
              </div>
              <strong style={{ fontSize: 15 }}>{tierBreakdown.pro}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--adm-bg-elevated)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="adm-badge adm-badge-enterprise">Enterprise</span>
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Commercial license & priority compute</span>
              </div>
              <strong style={{ fontSize: 15 }}>{tierBreakdown.enterprise}</strong>
            </div>
          </div>
        </div>

        {/* Template Lifecycle Breakdown */}
        <div className="adm-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Parametric Template Registry</h3>
            <button
              className="adm-btn adm-btn-secondary adm-btn-sm"
              onClick={() => onNavigateTab('templates')}
            >
              Manage Templates →
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--adm-bg-elevated)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="adm-badge adm-badge-published">Published</span>
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Visible in customer template gallery</span>
              </div>
              <strong style={{ fontSize: 15 }}>{templates.published}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--adm-bg-elevated)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="adm-badge adm-badge-draft">Draft</span>
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Under development, owner-only</span>
              </div>
              <strong style={{ fontSize: 15 }}>{templates.draft}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--adm-bg-elevated)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="adm-badge adm-badge-unpublished">Unpublished</span>
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Hidden from new projects</span>
              </div>
              <strong style={{ fontSize: 15 }}>{templates.unpublished}</strong>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: 'var(--adm-bg-elevated)', borderRadius: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="adm-badge adm-badge-archived">Archived</span>
                <span style={{ fontSize: 13, color: 'var(--adm-text-secondary)' }}>Deprecated legacy layouts</span>
              </div>
              <strong style={{ fontSize: 15 }}>{templates.archived}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Admin Audit Activity */}
      <div className="adm-card" style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Recent Owner Activity</h3>
            <p className="adm-subtitle">Immutable append-only ledger entries</p>
          </div>
          <button
            className="adm-btn adm-btn-secondary adm-btn-sm"
            onClick={() => onNavigateTab('audit')}
          >
            View Full Audit Trail ({recentLogs.length}) →
          </button>
        </div>

        {recentLogs.length === 0 ? (
          <div className="adm-empty" style={{ padding: '24px 0' }}>No administrative audit events recorded yet.</div>
        ) : (
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {recentLogs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ whiteSpace: 'nowrap', color: 'var(--adm-text-muted)' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td>
                      <code style={{ fontSize: 12, fontWeight: 600, color: 'var(--adm-primary)' }}>{log.action}</code>
                    </td>
                    <td>
                      <span style={{ fontSize: 12 }}>
                        {log.targetType}: <code>{log.targetId}</code>
                      </span>
                    </td>
                    <td style={{ color: 'var(--adm-text-secondary)' }}>
                      {log.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
