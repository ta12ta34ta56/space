import { useEffect, useState } from 'react';
import { adminApi, type AdminAuditLogRecord } from '../api';

interface AdminAuditLogsProps {
  token: string;
}

export function AdminAuditLogs({ token }: AdminAuditLogsProps) {
  const [logs, setLogs] = useState<AdminAuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const limit = 25;

  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadLogs() {
      try {
        setLoading(true);
        setError(null);
        const res = await adminApi.getAuditLogs(
          token,
          limit,
          page * limit,
          actionFilter || undefined,
          targetTypeFilter || undefined,
        );
        if (!active) return;
        setLogs(res.logs ?? []);
        setTotal(res.total ?? 0);
      } catch (err: unknown) {
        if (!active) return;
        const e = err as { message?: string };
        setError(e.message ?? 'Failed to load audit logs.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadLogs();
    return () => { active = false; };
  }, [token, page, actionFilter, targetTypeFilter]);

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="adm-view">
      <div className="adm-title-row">
        <div>
          <h1 className="adm-title">Security & Administrative Audit Logs</h1>
          <p className="adm-subtitle">
            Cryptographically sealed and immutable audit trail of all owner operations.
          </p>
        </div>
        <div className="adm-badge adm-badge-published">
          Append-Only Ledger (Immutable)
        </div>
      </div>

      <div className="adm-alert adm-alert-info" style={{ marginBottom: 20 }}>
        <div>
          <strong>Append-Only Security Guarantee:</strong> Audit log entries are written automatically on every mutating API request. Records cannot be updated, overwritten, or deleted by any administrative role, guaranteed by database-level PostgreSQL security triggers.
        </div>
      </div>

      {error && (
        <div className="adm-alert adm-alert-danger" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <select
          className="adm-select"
          style={{ width: 200 }}
          value={actionFilter}
          onChange={(e) => {
            setActionFilter(e.target.value);
            setPage(0);
          }}
          aria-label="Filter by action"
        >
          <option value="">All Actions</option>
          <option value="user.tier_override">user.tier_override</option>
          <option value="flag.update">flag.update</option>
          <option value="template.create">template.create</option>
          <option value="template.update">template.update</option>
          <option value="template.status_change">template.status_change</option>
        </select>

        <select
          className="adm-select"
          style={{ width: 180 }}
          value={targetTypeFilter}
          onChange={(e) => {
            setTargetTypeFilter(e.target.value);
            setPage(0);
          }}
          aria-label="Filter by target type"
        >
          <option value="">All Targets</option>
          <option value="user">Users</option>
          <option value="feature_flag">Feature Flags</option>
          <option value="template">Templates</option>
        </select>

        {(actionFilter || targetTypeFilter) && (
          <button
            className="adm-btn adm-btn-secondary"
            onClick={() => {
              setActionFilter('');
              setTargetTypeFilter('');
              setPage(0);
            }}
          >
            Clear Filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="adm-empty">Loading audit ledger…</div>
      ) : logs.length === 0 ? (
        <div className="adm-card adm-empty">
          No audit logs found matching criteria.
        </div>
      ) : (
        <>
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Target</th>
                  <th>Reason</th>
                  <th style={{ textAlign: 'right' }}>Payload Diff</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  return (
                    <tr key={log.id}>
                      <td style={{ whiteSpace: 'nowrap', fontSize: 12, color: 'var(--adm-text-muted)' }}>
                        {new Date(log.createdAt).toISOString().replace('T', ' ').slice(0, 19)}
                      </td>
                      <td>
                        <code style={{ fontSize: 11, color: 'var(--adm-text-secondary)' }}>
                          {log.actorUserId || 'system'}
                        </code>
                      </td>
                      <td>
                        <code style={{ fontSize: 12, fontWeight: 700, color: 'var(--adm-primary)' }}>
                          {log.action}
                        </code>
                      </td>
                      <td>
                        <span style={{ fontSize: 12 }}>
                          {log.targetType}: <code style={{ fontSize: 11 }}>{log.targetId}</code>
                        </span>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--adm-text-secondary)', maxWidth: 260 }}>
                        {log.reason || '—'}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="adm-btn adm-btn-secondary adm-btn-sm"
                          onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        >
                          {isExpanded ? 'Hide Diff' : 'View Diff'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Expanded Diff Preview if clicked */}
          {expandedLogId && (() => {
            const selectedLog = logs.find((l) => l.id === expandedLogId);
            if (!selectedLog) return null;
            return (
              <div className="adm-card" style={{ marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700 }}>
                    Audit Event Details: <code>{selectedLog.action}</code> ({selectedLog.id})
                  </h4>
                  <button
                    className="adm-btn adm-btn-secondary adm-btn-sm"
                    onClick={() => setExpandedLogId(null)}
                  >
                    Close
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--adm-text-muted)', display: 'block', marginBottom: 4 }}>
                      Before State
                    </span>
                    <pre className="adm-diff-box">
                      {JSON.stringify(selectedLog.beforeState ?? {}, null, 2)}
                    </pre>
                  </div>

                  <div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--adm-text-muted)', display: 'block', marginBottom: 4 }}>
                      After State
                    </span>
                    <pre className="adm-diff-box">
                      {JSON.stringify(selectedLog.afterState ?? {}, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
            <span style={{ fontSize: 13, color: 'var(--adm-text-muted)' }}>
              Showing {logs.length} of {total} log entries (Page {page + 1} of {Math.max(totalPages, 1)})
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
    </div>
  );
}
