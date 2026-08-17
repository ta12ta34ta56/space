import { useMemo, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { useTextStyleStore } from '../../stores/text-style-store';
import { loadFont } from '../../engine/font-manager';
import {
  PAPER_STOCKS,
  calculateCover,
  coverZones,
  formatIn,
  type BindingType,
  type PaperType,
} from '../../services/kdp-cover';
import { buildCoverObjects } from '../../services/book';
import { IN } from '../../types/canvas.types';

const TRIMS: { label: string; w: number; h: number }[] = [
  { label: '6 × 9', w: 6, h: 9 },
  { label: '5 × 8', w: 5, h: 8 },
  { label: '5.5 × 8.5', w: 5.5, h: 8.5 },
  { label: '7 × 10', w: 7, h: 10 },
  { label: '8 × 10', w: 8, h: 10 },
  { label: '8.5 × 11', w: 8.5, h: 11 },
  { label: '8.25 × 8.25', w: 8.25, h: 8.25 },
];

/**
 * Builds a print-ready KDP cover page: back + spine + front on one flat sheet
 * with correct bleed, and a spine width computed from the interior page count.
 */
export function CoverWizard({ onClose }: { onClose: () => void }) {
  const { pages, addCoverPage, book, resizeBook } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const existingCover = pages.find((p) => p.role === 'cover');
  const interiorCount = pages.filter((p) => p.role !== 'cover').length;
  const font = useTextStyleStore((s) => s.fontFamily);

  // Pre-fill from the book's settings — the cover derives from them.
  const bookTrim = TRIMS.find(
    (t) => Math.abs(t.w * IN - book.trimWidth) < 1 && Math.abs(t.h * IN - book.trimHeight) < 1,
  );
  const [trim, setTrim] = useState(bookTrim ?? TRIMS[0]);
  const [pageCount, setPageCount] = useState(Math.max(1, interiorCount));
  const [paper, setPaper] = useState<PaperType>(book.paper);
  const [binding, setBinding] = useState<BindingType>(book.binding);
  const [bgColor, setBgColor] = useState('#f3f4f6');
  const [busy, setBusy] = useState(false);

  const spec = useMemo(
    () => calculateCover(trim.w, trim.h, pageCount, paper, binding),
    [trim, pageCount, paper, binding],
  );

  const create = async () => {
    setBusy(true);
    try {
      await loadFont(font);
      const objs = buildCoverObjects(spec, { font, bgColor });

      await addCoverPage({
        name: `Cover — ${trim.label} · ${pageCount}pp`,
        width: spec.totalWidth,
        height: spec.totalHeight,
        objects: objs,
      });

      // Paper/binding become BOOK settings so the cover keeps deriving from
      // them (and from the real interior count) as the book grows.
      if (paper !== book.paper || binding !== book.binding) {
        await resizeBook({ ...book, paper, binding });
      }

      setStatus('success', `Cover created — spine ${formatIn(spec.spine)}`);
      onClose();
    } catch {
      setStatus('error', 'Could not create the cover');
    } finally {
      setBusy(false);
    }
  };

  // scale the diagram to fit the modal
  const dW = 380;
  const k = dW / spec.totalWidth;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal wide">
        <div className="modal-head">
          <span>KDP cover creator</span>
          <button className="btn icon ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="modal-body">
          <div className="cover-diagram" style={{ width: dW, height: spec.totalHeight * k }}>
            <div className="cd-bleed" />
            {coverZones(spec).map((z) => (
              <div
                key={z.id}
                className={`cd-zone ${z.id}`}
                style={{
                  left: z.left * k,
                  top: z.top * k,
                  width: z.width * k,
                  height: z.height * k,
                }}
              >
                <span>{z.id === 'spine' ? '' : z.id.toUpperCase()}</span>
              </div>
            ))}
          </div>

          <div className="cover-figures">
            <div><span className="hint">Spine</span><strong>{formatIn(spec.spine)}</strong></div>
            <div><span className="hint">Full cover</span><strong>{formatIn(spec.totalWidth, 2)} × {formatIn(spec.totalHeight, 2)}</strong></div>
            <div><span className="hint">Bleed</span><strong>{formatIn(spec.bleed)}</strong></div>
            <div><span className="hint">Spine text</span><strong>{spec.spineTextAllowed ? 'Allowed' : 'Too narrow'}</strong></div>
          </div>

          <div className="section">
            <div className="section-title">Trim size</div>
            <div className="chips">
              {TRIMS.map((t) => (
                <button
                  key={t.label}
                  className={`chip ${trim.label === t.label ? 'active' : ''}`}
                  onClick={() => setTrim(t)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-title">Interior page count</div>
            <div className="row">
              <input
                type="range" min={24} max={828}
                value={pageCount}
                onChange={(e) => setPageCount(Number(e.target.value))}
              />
              <input
                type="number" min={1} max={828}
                value={pageCount}
                onChange={(e) => setPageCount(Number(e.target.value) || 1)}
                style={{ width: 84, flex: 'none' }}
              />
            </div>
            <button
              className="btn sm"
              style={{ marginTop: 8 }}
              onClick={() => setPageCount(Math.max(1, interiorCount))}
            >
              Use my interior ({interiorCount} pages)
            </button>
            <p className="hint" style={{ marginTop: 6 }}>
              Once created, the cover follows your ACTUAL interior page count
              automatically — spine width and flat size recompute as pages are
              added or removed.
            </p>
          </div>

          <div className="section">
            <div className="section-title">Paper &amp; binding</div>
            <select value={paper} onChange={(e) => setPaper(e.target.value as PaperType)}>
              {PAPER_STOCKS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label} — {s.note}
                </option>
              ))}
            </select>
            <div className="opt-grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 8 }}>
              {(['paperback', 'hardcover'] as BindingType[]).map((b) => (
                <button
                  key={b}
                  className={`opt ${binding === b ? 'active' : ''}`}
                  onClick={() => setBinding(b)}
                >
                  <div className="t">{b === 'paperback' ? 'Paperback' : 'Hardcover'}</div>
                  <div className="s">{b === 'hardcover' ? '+ wrap & hinge' : 'Standard'}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="section">
            <div className="section-title">Options</div>
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="label" style={{ margin: 0 }}>Background colour</span>
              <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)} style={{ width: 54 }} />
            </div>
            <p className="hint" style={{ marginTop: 8 }}>
              Guideline overlays (bleed / trim / spine / safe-area / barcode) are shown as
              phantom guides on the canvas — they never print, export, or appear in
              thumbnails. Toggle them with the book icon in the bottom bar.
            </p>
          </div>

          {spec.warnings.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {spec.warnings.map((w, i) => (
                <div key={i} className="preflight warn">
                  <strong>Check</strong>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {existingCover && (
            <div className="preflight warn" style={{ marginTop: 10 }}>
              <strong>Heads up</strong>
              <span>
                This project already has a cover. Creating one replaces it — a book
                has exactly one.
              </span>
            </div>
          )}

          <p className="hint" style={{ marginTop: 10 }}>
            KDP wants the cover as its own file — build it here, then export just this
            page with the range box in the export dialog.
          </p>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={create} disabled={busy}>
            {busy ? 'Building…' : existingCover ? 'Replace cover' : 'Create cover page'}
          </button>
        </div>
      </div>
    </div>
  );
}
