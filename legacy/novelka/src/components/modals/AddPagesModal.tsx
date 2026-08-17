import { useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { PAGE_SIZE_PRESETS } from '../../types/canvas.types';

type Where = 'end' | 'after' | 'start';
type Source = 'blank' | 'copyCurrent';

/**
 * Bulk page creation. Adding 200 pages one click at a time is the single most
 * tedious thing about building a KDP interior, and no mainstream editor does
 * this well — so it's a real differentiator.
 */
export function AddPagesModal({ onClose }: { onClose: () => void }) {
  const { pages, activePageId, addPagesBulk, book } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const current = pages.find((p) => p.id === activePageId) ?? pages[0];
  const currentIndex = pages.findIndex((p) => p.id === activePageId) + 1;
  // New pages are always INTERIOR pages — never the cover's flat-cover size.
  // "Same as current" therefore means the book's trim, even when the cover
  // is the active page.
  const trim =
    current.role === 'cover'
      ? { width: book.trimWidth, height: book.trimHeight }
      : { width: current.width, height: current.height };

  const [count, setCount] = useState(15);
  const [where, setWhere] = useState<Where>('end');
  const [source, setSource] = useState<Source>('blank');
  const [sizeKey, setSizeKey] = useState('current');
  const [busy, setBusy] = useState(false);

  const size =
    sizeKey === 'current'
      ? trim
      : {
          width: PAGE_SIZE_PRESETS[sizeKey].width,
          height: PAGE_SIZE_PRESETS[sizeKey].height,
        };

  const run = async () => {
    const n = Math.max(1, Math.min(500, Math.round(count)));
    setBusy(true);
    try {
      await addPagesBulk({ count: n, where, source, size });
      setStatus('success', `${n} page${n === 1 ? '' : 's'} added`);
      onClose();
    } catch {
      setStatus('error', 'Could not add pages');
    } finally {
      setBusy(false);
    }
  };

  const total = pages.length + Math.max(1, Math.min(500, Math.round(count) || 1));

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <span>Add pages</span>
          <button className="btn icon ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="modal-body">
          <div className="section">
            <div className="section-title">How many</div>
            <div className="chips" style={{ marginBottom: 10 }}>
              {[5, 10, 15, 25, 50, 100, 120].map((n) => (
                <button
                  key={n}
                  className={`chip ${count === n ? 'active' : ''}`}
                  onClick={() => setCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={1}
              max={500}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              aria-label="Number of pages to add"
            />
            <p className="hint" style={{ marginTop: 6 }}>
              Document will have <strong>{total}</strong> pages. Max 500 at once.
            </p>
          </div>

          <div className="section">
            <div className="section-title">Content</div>
            <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button
                className={`opt ${source === 'blank' ? 'active' : ''}`}
                onClick={() => setSource('blank')}
              >
                <div className="t">Blank pages</div>
                <div className="s">Empty</div>
              </button>
              <button
                className={`opt ${source === 'copyCurrent' ? 'active' : ''}`}
                onClick={() => setSource('copyCurrent')}
              >
                <div className="t">Copy this page</div>
                <div className="s">Repeat page {currentIndex}</div>
              </button>
            </div>
            {source === 'copyCurrent' && (
              <p className="hint" style={{ marginTop: 6 }}>
                Every new page duplicates page {currentIndex} — the fast way to build a
                lined journal or a repeating worksheet.
              </p>
            )}
          </div>

          <div className="section">
            <div className="section-title">Where</div>
            <div className="opt-grid">
              <button className={`opt ${where === 'end' ? 'active' : ''}`} onClick={() => setWhere('end')}>
                <div className="t">At the end</div>
                <div className="s">After page {pages.length}</div>
              </button>
              <button className={`opt ${where === 'after' ? 'active' : ''}`} onClick={() => setWhere('after')}>
                <div className="t">After current</div>
                <div className="s">After page {currentIndex}</div>
              </button>
              <button className={`opt ${where === 'start' ? 'active' : ''}`} onClick={() => setWhere('start')}>
                <div className="t">At the start</div>
                <div className="s">Before page 1</div>
              </button>
            </div>
          </div>

          {source === 'blank' && (
            <div className="section">
              <div className="section-title">Page size</div>
              <select value={sizeKey} onChange={(e) => setSizeKey(e.target.value)}>
                <option value="current">
                  Same as book trim ({Math.round(trim.width)} × {Math.round(trim.height)}pt)
                </option>
                {Object.entries(PAGE_SIZE_PRESETS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={run} disabled={busy}>
            {busy ? 'Adding…' : `Add ${Math.max(1, Math.round(count) || 1)} pages`}
          </button>
        </div>
      </div>
    </div>
  );
}
