import { useEffect, useState } from 'react';
import { adminApi, type AdminTemplateRecord } from '../api';

interface AdminTemplatesProps {
  token: string;
}

export function AdminTemplates({ token }: AdminTemplatesProps) {
  const [templates, setTemplates] = useState<AdminTemplateRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [auditMessage, setAuditMessage] = useState<string | null>(null);

  // Status transition modal state
  const [transitionTarget, setTransitionTarget] = useState<{
    template: AdminTemplateRecord;
    nextStatus: 'published' | 'unpublished' | 'archived' | 'draft';
  } | null>(null);
  const [transitionReason, setTransitionReason] = useState('');
  const [transitionBusy, setTransitionBusy] = useState(false);
  const [transitionError, setTransitionError] = useState<string | null>(null);

  // Create Template Modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    templateId: '',
    version: '1.0.0',
    name: '',
    description: '',
    generatorKinds: 'wordsearch',
    supportedSizes: 'kdp6x9, kdp8x10, kdp85x11, A4, custom7x9',
    accessLevel: 'free',
    status: 'draft',
    reason: '',
  });
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit Schema Modal
  const [editSchemaTarget, setEditSchemaTarget] = useState<AdminTemplateRecord | null>(null);
  const [schemaText, setSchemaText] = useState('');
  const [styleTokensText, setStyleTokensText] = useState('');
  const [schemaEditBusy, setSchemaEditBusy] = useState(false);
  const [schemaEditError, setSchemaEditError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadTemplates() {
      try {
        setLoading(true);
        setError(null);
        const res = await adminApi.getTemplates(token, statusFilter);
        if (!active) return;
        setTemplates(res.templates ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const e = err as { message?: string };
        setError(e.message ?? 'Failed to load templates.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadTemplates();
    return () => { active = false; };
  }, [token, statusFilter]);

  const handleStatusTransition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitionTarget) return;

    try {
      setTransitionBusy(true);
      setTransitionError(null);
      const res = await adminApi.updateTemplateStatus(
        token,
        transitionTarget.template.templateId,
        transitionTarget.nextStatus,
        transitionReason.trim(),
      );

      setAuditMessage(
        `Template '${res.templateId}' transitioned from ${res.previousStatus} to ${res.currentStatus}. Audit entry recorded.`,
      );

      setTemplates((prev) =>
        prev.map((t) =>
          t.templateId === res.templateId ? { ...t, status: res.currentStatus as AdminTemplateRecord['status'] } : t,
        ),
      );
      setTransitionTarget(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setTransitionError(e.message ?? 'Failed to transition template status.');
    } finally {
      setTransitionBusy(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplate.templateId.trim()) {
      setCreateError('Template ID is required (e.g. classic-ws, two-up-ws).');
      return;
    }
    if (!/^[a-z0-9_-]{2,64}$/.test(newTemplate.templateId.trim().toLowerCase())) {
      setCreateError('Template ID must be 2-64 lowercase alphanumeric, underscore, or hyphen characters.');
      return;
    }
    if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(newTemplate.version.trim())) {
      setCreateError('Version must be a valid semver string (e.g. 1.0.0).');
      return;
    }
    if (!newTemplate.name.trim()) {
      setCreateError('Template name is required.');
      return;
    }

    try {
      setCreateBusy(true);
      setCreateError(null);

      const genKinds = newTemplate.generatorKinds.split(',').map((s) => s.trim()).filter(Boolean);
      const sizes = newTemplate.supportedSizes.split(',').map((s) => s.trim()).filter(Boolean);

      const res = await adminApi.createTemplate(token, {
        templateId: newTemplate.templateId.trim().toLowerCase(),
        version: newTemplate.version.trim(),
        name: newTemplate.name.trim(),
        description: newTemplate.description.trim(),
        generatorKinds: genKinds,
        supportedSizes: sizes,
        accessLevel: newTemplate.accessLevel,
        status: newTemplate.status,
        reason: newTemplate.reason.trim(),
      });

      setAuditMessage(`Template '${res.template.templateId}' created successfully.`);
      setTemplates((prev) => [res.template, ...prev]);
      setCreateModalOpen(false);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setCreateError(e.message ?? 'Failed to create template.');
    } finally {
      setCreateBusy(false);
    }
  };

  const openEditSchemaModal = (template: AdminTemplateRecord) => {
    setEditSchemaTarget(template);
    setSchemaText(JSON.stringify(template.schemaPayload || {}, null, 2));
    setStyleTokensText(JSON.stringify(template.styleTokens || {}, null, 2));
    setSchemaEditError(null);
  };

  const handleSaveSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSchemaTarget) return;

    let parsedSchema: Record<string, unknown>;
    let parsedTokens: Record<string, unknown>;
    try {
      parsedSchema = JSON.parse(schemaText);
    } catch {
      setSchemaEditError('Schema Payload must be valid JSON.');
      return;
    }
    try {
      parsedTokens = JSON.parse(styleTokensText);
    } catch {
      setSchemaEditError('Style Tokens must be valid JSON.');
      return;
    }

    try {
      setSchemaEditBusy(true);
      setSchemaEditError(null);
      const res = await adminApi.updateTemplate(token, editSchemaTarget.templateId, {
        schemaPayload: parsedSchema,
        styleTokens: parsedTokens,
      });

      setAuditMessage(`Schema & style tokens updated for '${res.template.templateId}'.`);
      setTemplates((prev) =>
        prev.map((t) => (t.templateId === editSchemaTarget.templateId ? res.template : t)),
      );
      setEditSchemaTarget(null);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setSchemaEditError(e.message ?? 'Failed to update template schema.');
    } finally {
      setSchemaEditBusy(false);
    }
  };

  return (
    <div className="adm-view">
      <div className="adm-title-row">
        <div>
          <h1 className="adm-title">Parametric Templates</h1>
          <p className="adm-subtitle">Manage server-backed layout templates, publication lifecycles, and access levels.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            className="adm-btn adm-btn-primary"
            onClick={() => {
              setNewTemplate({
                templateId: '',
                version: '1.0.0',
                name: '',
                description: '',
                generatorKinds: 'wordsearch',
                supportedSizes: 'kdp6x9, kdp8x10, kdp85x11, A4, custom7x9',
                accessLevel: 'free',
                status: 'draft',
                reason: '',
              });
              setCreateError(null);
              setCreateModalOpen(true);
            }}
          >
            + Create Template
          </button>
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

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['all', 'published', 'draft', 'unpublished', 'archived'].map((st) => (
          <button
            key={st}
            className={`adm-btn adm-btn-sm ${statusFilter === st ? 'adm-btn-primary' : 'adm-btn-secondary'}`}
            onClick={() => setStatusFilter(st)}
          >
            {st.charAt(0).toUpperCase() + st.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="adm-empty">Loading parametric templates…</div>
      ) : templates.length === 0 ? (
        <div className="adm-card adm-empty">
          No templates found matching status filter “{statusFilter}”.
        </div>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Template ID & Name</th>
                <th>Version</th>
                <th>Status</th>
                <th>Access Level</th>
                <th>Supported Sizes</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((tpl) => (
                <tr key={tpl.templateId}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{tpl.name}</div>
                    <code style={{ fontSize: 11, color: 'var(--adm-primary)' }}>{tpl.templateId}</code>
                    {tpl.description && (
                      <div style={{ fontSize: 11, color: 'var(--adm-text-muted)' }}>{tpl.description}</div>
                    )}
                  </td>
                  <td>
                    <span style={{ fontSize: 12 }}>v{tpl.version}</span>
                  </td>
                  <td>
                    <span className={`adm-badge adm-badge-${tpl.status}`}>
                      {tpl.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    <span className={`adm-badge adm-badge-${tpl.accessLevel}`}>
                      {tpl.accessLevel.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ fontSize: 11, color: 'var(--adm-text-secondary)' }}>
                    {Array.isArray(tpl.supportedSizes) ? tpl.supportedSizes.join(', ') : 'All'}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: 6 }}>
                      <button
                        className="adm-btn adm-btn-secondary adm-btn-sm"
                        onClick={() => openEditSchemaModal(tpl)}
                      >
                        Schema & Tokens
                      </button>

                      {tpl.status !== 'published' && (
                        <button
                          className="adm-btn adm-btn-primary adm-btn-sm"
                          onClick={() => {
                            setTransitionTarget({ template: tpl, nextStatus: 'published' });
                            setTransitionReason('');
                            setTransitionError(null);
                          }}
                        >
                          Publish
                        </button>
                      )}

                      {tpl.status === 'published' && (
                        <button
                          className="adm-btn adm-btn-secondary adm-btn-sm"
                          onClick={() => {
                            setTransitionTarget({ template: tpl, nextStatus: 'unpublished' });
                            setTransitionReason('');
                            setTransitionError(null);
                          }}
                        >
                          Unpublish
                        </button>
                      )}

                      {tpl.status !== 'archived' && (
                        <button
                          className="adm-btn adm-btn-danger adm-btn-sm"
                          onClick={() => {
                            setTransitionTarget({ template: tpl, nextStatus: 'archived' });
                            setTransitionReason('');
                            setTransitionError(null);
                          }}
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Status Transition Modal */}
      {transitionTarget && (
        <div className="adm-modal-backdrop" onClick={() => !transitionBusy && setTransitionTarget(null)}>
          <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3>
                {transitionTarget.nextStatus === 'published'
                  ? 'Publish Template'
                  : transitionTarget.nextStatus === 'unpublished'
                    ? 'Unpublish Template'
                    : 'Archive Template'}
              </h3>
              {!transitionBusy && (
                <button
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  onClick={() => setTransitionTarget(null)}
                >
                  ✕
                </button>
              )}
            </div>

            <form onSubmit={handleStatusTransition}>
              <div className="adm-modal-body">
                <div className={`adm-alert ${transitionTarget.nextStatus === 'published' ? 'adm-alert-info' : 'adm-alert-warn'}`}>
                  <div>
                    Transition template <strong>{transitionTarget.template.name}</strong> (
                    <code>{transitionTarget.template.templateId}</code>) to status{' '}
                    <strong>{transitionTarget.nextStatus.toUpperCase()}</strong>.
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Reason for Transition
                  </label>
                  <input
                    type="text"
                    className="adm-input"
                    placeholder="e.g. Completed layout validation test suite"
                    value={transitionReason}
                    onChange={(e) => setTransitionReason(e.target.value)}
                    disabled={transitionBusy}
                  />
                  <span style={{ fontSize: 11, color: 'var(--adm-text-muted)', marginTop: 4, display: 'block' }}>
                    Logged to the immutable administrative audit trail.
                  </span>
                </div>

                {transitionError && (
                  <div className="adm-alert adm-alert-danger">
                    {transitionError}
                  </div>
                )}
              </div>

              <div className="adm-modal-footer">
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => setTransitionTarget(null)}
                  disabled={transitionBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`adm-btn ${transitionTarget.nextStatus === 'archived' ? 'adm-btn-danger' : 'adm-btn-primary'}`}
                  disabled={transitionBusy}
                >
                  {transitionBusy ? 'Updating…' : `Confirm ${transitionTarget.nextStatus}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Template Modal */}
      {createModalOpen && (
        <div className="adm-modal-backdrop" onClick={() => !createBusy && setCreateModalOpen(false)}>
          <div className="adm-modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3>Create Parametric Template</h3>
              {!createBusy && (
                <button
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  onClick={() => setCreateModalOpen(false)}
                >
                  ✕
                </button>
              )}
            </div>

            <form onSubmit={handleCreateSubmit}>
              <div className="adm-modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Template ID <span style={{ color: 'var(--adm-danger)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="adm-input"
                      placeholder="e.g. classic-ws, two-up-ws"
                      value={newTemplate.templateId}
                      onChange={(e) => setNewTemplate({ ...newTemplate, templateId: e.target.value })}
                      required
                      disabled={createBusy}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Version <span style={{ color: 'var(--adm-danger)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="adm-input"
                      placeholder="1.0.0"
                      value={newTemplate.version}
                      onChange={(e) => setNewTemplate({ ...newTemplate, version: e.target.value })}
                      required
                      disabled={createBusy}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Template Name <span style={{ color: 'var(--adm-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="adm-input"
                    placeholder="e.g. Classic Word Search"
                    value={newTemplate.name}
                    onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })}
                    required
                    disabled={createBusy}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Description
                  </label>
                  <input
                    type="text"
                    className="adm-input"
                    placeholder="Short description for customer and admin reference"
                    value={newTemplate.description}
                    onChange={(e) => setNewTemplate({ ...newTemplate, description: e.target.value })}
                    disabled={createBusy}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Access Level
                    </label>
                    <select
                      className="adm-select"
                      value={newTemplate.accessLevel}
                      onChange={(e) => setNewTemplate({ ...newTemplate, accessLevel: e.target.value })}
                      disabled={createBusy}
                    >
                      <option value="free">Free</option>
                      <option value="basic">Basic</option>
                      <option value="pro">Pro</option>
                      <option value="enterprise">Enterprise</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                      Initial Status
                    </label>
                    <select
                      className="adm-select"
                      value={newTemplate.status}
                      onChange={(e) => setNewTemplate({ ...newTemplate, status: e.target.value })}
                      disabled={createBusy}
                    >
                      <option value="draft">Draft (Private)</option>
                      <option value="published">Published</option>
                      <option value="unpublished">Unpublished</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Supported Print Sizes (comma separated)
                  </label>
                  <input
                    type="text"
                    className="adm-input"
                    value={newTemplate.supportedSizes}
                    onChange={(e) => setNewTemplate({ ...newTemplate, supportedSizes: e.target.value })}
                    disabled={createBusy}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Reason for Creation
                  </label>
                  <input
                    type="text"
                    className="adm-input"
                    placeholder="e.g. Added new large print template variant"
                    value={newTemplate.reason}
                    onChange={(e) => setNewTemplate({ ...newTemplate, reason: e.target.value })}
                    disabled={createBusy}
                  />
                </div>

                {createError && (
                  <div className="adm-alert adm-alert-danger">
                    {createError}
                  </div>
                )}
              </div>

              <div className="adm-modal-footer">
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                  disabled={createBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adm-btn adm-btn-primary"
                  disabled={createBusy}
                >
                  {createBusy ? 'Creating…' : 'Create Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Schema Modal */}
      {editSchemaTarget && (
        <div className="adm-modal-backdrop" onClick={() => !schemaEditBusy && setEditSchemaTarget(null)}>
          <div className="adm-modal" style={{ maxWidth: 700 }} onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-header">
              <h3>Edit Schema & Tokens: <code>{editSchemaTarget.templateId}</code></h3>
              {!schemaEditBusy && (
                <button
                  className="adm-btn adm-btn-secondary adm-btn-sm"
                  onClick={() => setEditSchemaTarget(null)}
                >
                  ✕
                </button>
              )}
            </div>

            <form onSubmit={handleSaveSchema}>
              <div className="adm-modal-body">
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Layout Schema Payload (JSON)
                  </label>
                  <textarea
                    className="adm-textarea"
                    rows={8}
                    value={schemaText}
                    onChange={(e) => setSchemaText(e.target.value)}
                    disabled={schemaEditBusy}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                    Style Tokens (JSON)
                  </label>
                  <textarea
                    className="adm-textarea"
                    rows={4}
                    value={styleTokensText}
                    onChange={(e) => setStyleTokensText(e.target.value)}
                    disabled={schemaEditBusy}
                    style={{ fontFamily: 'monospace', fontSize: 12 }}
                  />
                </div>

                {schemaEditError && (
                  <div className="adm-alert adm-alert-danger">
                    {schemaEditError}
                  </div>
                )}
              </div>

              <div className="adm-modal-footer">
                <button
                  type="button"
                  className="adm-btn adm-btn-secondary"
                  onClick={() => setEditSchemaTarget(null)}
                  disabled={schemaEditBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="adm-btn adm-btn-primary"
                  disabled={schemaEditBusy}
                >
                  {schemaEditBusy ? 'Saving…' : 'Save Rules & Tokens'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
