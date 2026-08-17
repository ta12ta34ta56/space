import { useEffect, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import {
  StorageFullError,
  downloadJSON,
  readProjectFile,
  storage,
  type StoredProject,
} from '../../services/storage';
import { liveThumbnail } from '../../engine/live-thumbnail';

export function ProjectsModal({
  onClose,
  projectId,
  setProjectId,
}: {
  onClose: () => void;
  projectId: string;
  setProjectId: (id: string) => void;
}) {
  const { serialize, loadProject, newProject, projectName } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const [list, setList] = useState<StoredProject[]>([]);
  const [error, setError] = useState('');

  const refresh = () => { void storage.list().then(setList); };
  useEffect(refresh, []);

  const saveNow = async () => {
    setError('');
    try {
      await storage.save(projectId, serialize(), liveThumbnail() ?? undefined);
      refresh();
      setStatus('success', `“${projectName}” saved locally`);
    } catch (e) {
      setError(
        e instanceof StorageFullError
          ? 'Not enough space left — delete an old project, or use “Download a copy” to keep this one safely.'
          : 'Could not save. Use “Download a copy” so this work is not lost.',
      );
    }
  };

  const open = async (p: StoredProject) => {
    await loadProject(p.file);
    setProjectId(p.id);
    onClose();
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = await readProjectFile(file);
      await loadProject(parsed);
      setProjectId(crypto.randomUUID());
      onClose();
    } catch {
      setError('That file is not a valid Novelka project.');
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <span>Projects</span>
          <button className="btn icon ghost" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="row" style={{ marginBottom: 14 }}>
            <button className="btn primary" onClick={saveNow}>
              Save current
            </button>
            <button className="btn" onClick={() => downloadJSON(serialize())}>
              Download .json
            </button>
            <label className="btn">
              Import file
              <input type="file" accept=".json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
            </label>
            <div className="spacer" />
            <button
              className="btn"
              onClick={async () => {
                await newProject();
                setProjectId(crypto.randomUUID());
                onClose();
              }}
            >
              New document
            </button>
          </div>

          {error && <p className="hint" style={{ color: 'var(--bad)' }}>{error}</p>}

          {list.length === 0 ? (
            <div className="empty">
              No saved projects yet. Your work autosaves in the background — “Save current”
              creates a named snapshot.
            </div>
          ) : (
            <div className="stack">
              {list.map((p) => (
                <div
                  key={p.id}
                  className="row"
                  style={{
                    padding: 8,
                    border: `1px solid ${p.id === projectId ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 8,
                    background: 'var(--bg-3)',
                  }}
                >
                  <div
                    style={{
                      width: 40,
                      aspectRatio: '0.707',
                      background: '#fff',
                      borderRadius: 4,
                      overflow: 'hidden',
                      flex: 'none',
                    }}
                  >
                    {p.thumbnail && <img src={p.thumbnail} alt="" style={{ width: '100%' }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div className="hint">
                      {p.pageCount} page{p.pageCount === 1 ? '' : 's'} ·{' '}
                      {new Date(p.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => open(p)}>Open</button>
                  <button
                    className="btn sm danger"
                    onClick={async () => {
                      await storage.remove(p.id);
                      refresh();
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="hint" style={{ marginTop: 14 }}>
            Phase 1 stores projects in your browser. The same interface swaps to cloud
            storage (S3/R2 + Postgres) in Phase 3 without touching the editor.
          </p>
        </div>
      </div>
    </div>
  );
}
