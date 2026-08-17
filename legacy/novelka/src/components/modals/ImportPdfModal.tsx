import { useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { importPDF, inspectPDF } from '../../engine/pdf-import';

type Mode = 'append' | 'replace';

export function ImportPdfModal({ onClose }: { onClose: () => void }) {
  const { pages, importPages } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<{ pageCount: number; width: number; height: number } | null>(
    null,
  );
  const [mode, setMode] = useState<Mode>('append');
  const [quality, setQuality] = useState(2);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const pick = async (f?: File) => {
    if (!f) return;
    setError('');
    setInfo(null);
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('That file is not a PDF.');
      return;
    }
    setFile(f);
    try {
      setInfo(await inspectPDF(f));
    } catch (e) {
      console.error('inspectPDF failed', e);
      setError(
        `Could not read that PDF — ${e instanceof Error ? e.message : 'unknown error'}`,
      );
      setFile(null);
    }
  };

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const imported = await importPDF(file, {
        scale: quality,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      await importPages(imported, mode);
      setStatus('success', `Imported ${imported.length} page${imported.length === 1 ? '' : 's'}`);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Import failed';
      setError(msg);
      setStatus('error', msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}
    >
      <div className="modal">
        <div className="modal-head">
          <span>Import a PDF</span>
          <button className="btn icon ghost" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>

        <div className="modal-body">
          <label
            className={`filedrop ${dragOver ? 'over' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pick(e.dataTransfer.files?.[0]);
            }}
          >
            <input
              type="file"
              accept="application/pdf,.pdf"
              hidden
              onChange={(e) => pick(e.target.files?.[0])}
            />
            {file ? (
              <>
                <strong>{file.name}</strong>
                <span className="hint">
                  {info
                    ? `${info.pageCount} page${info.pageCount === 1 ? '' : 's'} · ${info.width}×${info.height}pt`
                    : 'Reading…'}
                </span>
                <span className="hint">Click to choose a different file</span>
              </>
            ) : (
              <>
                <strong>Drop a PDF here</strong>
                <span className="hint">or click to browse</span>
              </>
            )}
          </label>

          {file && (
            <>
              <div className="section" style={{ marginTop: 16 }}>
                <div className="section-title">Add to document</div>
                <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <button
                    className={`opt ${mode === 'append' ? 'active' : ''}`}
                    onClick={() => setMode('append')}
                  >
                    <div className="t">Append</div>
                    <div className="s">Keep my {pages.length} page{pages.length === 1 ? '' : 's'}</div>
                  </button>
                  <button
                    className={`opt ${mode === 'replace' ? 'active' : ''}`}
                    onClick={() => setMode('replace')}
                  >
                    <div className="t">Replace</div>
                    <div className="s">Start from the PDF</div>
                  </button>
                </div>
              </div>

              <div className="section">
                <div className="section-title">Import quality</div>
                <div className="opt-grid">
                  {[
                    { v: 1, t: 'Draft', s: '72 DPI' },
                    { v: 2, t: 'Standard', s: '144 DPI' },
                    { v: 3, t: 'High', s: '216 DPI' },
                  ].map((q) => (
                    <button
                      key={q.v}
                      className={`opt ${quality === q.v ? 'active' : ''}`}
                      onClick={() => setQuality(q.v)}
                    >
                      <div className="t">{q.t}</div>
                      <div className="s">{q.s}</div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {busy && (
            <div className="section">
              <div className="progress">
                <div
                  style={{
                    width: `${progress.total ? (progress.done / progress.total) * 100 : 8}%`,
                  }}
                />
              </div>
              <p className="hint" style={{ marginTop: 6 }}>
                Rendering page {Math.min(progress.done + 1, progress.total || 1)} of{' '}
                {progress.total || '…'}
              </p>
            </div>
          )}

          {error && (
            <p className="hint" style={{ color: 'var(--bad)' }}>
              {error}
            </p>
          )}

          <p className="hint" style={{ marginTop: 12 }}>
            Each PDF page is added at its original size with the artwork as a locked
            background layer — unlock it in the Layers panel to move or delete it. You
            can draw, type and place stickers on top right away.
          </p>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" onClick={run} disabled={!file || busy}>
            {busy ? 'Importing…' : 'Import PDF'}
          </button>
        </div>
      </div>
    </div>
  );
}
