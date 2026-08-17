import { useMemo, useState } from 'react';
import { IN } from '../../types/canvas.types';
import {
  CUSTOM_TRIM_LIMITS,
  TRIM_PRESETS,
  coverSpecFor,
  pageCountLimits,
  summarizeBook,
  type BookSettings,
} from '../../services/book';
import { formatIn, type BindingType, type PaperType } from '../../services/kdp-cover';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { Icon } from '../Icon';

/**
 * New Book setup — one compact window shown BEFORE the editor, never a
 * multi-step wizard. Collects trim, page count, paper, binding, cover and
 * orientation; the live summary derives spine width from the EXISTING
 * calculateCover (via coverSpecFor). "Create book" builds everything in one
 * action through canvas-store.newBook.
 */

const PAPERS: { id: PaperType; label: string }[] = [
  { id: 'white', label: 'White' },
  { id: 'cream', label: 'Cream' },
  { id: 'groundwood', label: 'Groundwood' },
];

export function NewBookModal({
  initialName,
  onClose,
  onCreated,
}: {
  initialName?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const newBook = useCanvasStore((s) => s.newBook);
  const setStatus = useToastStore((s) => s.setStatus);

  const [trimId, setTrimId] = useState('6x9');
  const [customW, setCustomW] = useState(6);
  const [customH, setCustomH] = useState(9);
  const [landscape, setLandscape] = useState(false);
  const [paper, setPaper] = useState<PaperType>('white');
  const [binding, setBinding] = useState<BindingType>('paperback');
  const [includeCover, setIncludeCover] = useState(true);
  const [pageCount, setPageCount] = useState(24);
  const [name, setName] = useState(initialName ?? '');
  const [busy, setBusy] = useState(false);

  const preset = TRIM_PRESETS.find((t) => t.id === trimId);
  const baseW = preset ? preset.wIn : customW;
  const baseH = preset ? preset.hIn : customH;
  const wIn = landscape ? Math.max(baseW, baseH) : Math.min(baseW, baseH);
  const hIn = landscape ? Math.min(baseW, baseH) : Math.max(baseW, baseH);

  const settings: BookSettings = useMemo(
    () => ({ trimWidth: wIn * IN, trimHeight: hIn * IN, paper, binding }),
    [wIn, hIn, paper, binding],
  );
  const limits = pageCountLimits(settings);
  const minPages = limits.min;
  const spec = useMemo(() => coverSpecFor(settings, pageCount), [settings, pageCount]);

  const customInvalid =
    !preset &&
    (customW < CUSTOM_TRIM_LIMITS.minWIn ||
      customW > CUSTOM_TRIM_LIMITS.maxWIn ||
      customH < CUSTOM_TRIM_LIMITS.minHIn ||
      customH > CUSTOM_TRIM_LIMITS.maxHIn);

  const countLow = pageCount < minPages;
  const countHigh = pageCount > limits.max;

  const create = async () => {
    if (customInvalid) return;
    setBusy(true);
    try {
      await newBook({
        name:
          name.trim() ||
          (preset ? `${preset.label.replace(/ \(.*\)/, '')} book` : `${wIn}×${hIn} in book`),
        settings,
        pageCount: Math.max(1, pageCount),
        includeCover,
      });
      setStatus(
        'success',
        includeCover
          ? `Book created — spine ≈ ${spec.spineInches.toFixed(3)}"`
          : 'Book created',
      );
      onCreated();
    } catch {
      setStatus('error', 'Could not create the book');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal newbook-modal">
        <div className="modal-head">
          <span>New book</span>
          <button className="btn icon ghost" onClick={onClose} disabled={busy} aria-label="Close">✕</button>
        </div>

        <div className="modal-body">
          <div className="section">
            <span className="label">Book title</span>
            <input
              placeholder="Untitled book"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="Book title"
              autoFocus
            />
          </div>

          <div className="section">
            <span className="label">Book type / trim size</span>
            <select
              value={trimId}
              onChange={(e) => setTrimId(e.target.value)}
              aria-label="Trim size"
            >
              {TRIM_PRESETS.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {!preset && (
              <div className="row" style={{ marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <span className="label">Width (in)</span>
                  <input
                    type="number" step={0.05} min={CUSTOM_TRIM_LIMITS.minWIn} max={CUSTOM_TRIM_LIMITS.maxWIn}
                    value={customW}
                    onChange={(e) => setCustomW(Number(e.target.value) || 0)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <span className="label">Height (in)</span>
                  <input
                    type="number" step={0.05} min={CUSTOM_TRIM_LIMITS.minHIn} max={CUSTOM_TRIM_LIMITS.maxHIn}
                    value={customH}
                    onChange={(e) => setCustomH(Number(e.target.value) || 0)}
                  />
                </div>
              </div>
            )}
            {customInvalid && (
              <p className="newbook-warn">
                KDP trims run from {CUSTOM_TRIM_LIMITS.minWIn}×{CUSTOM_TRIM_LIMITS.minHIn} to{' '}
                {CUSTOM_TRIM_LIMITS.maxWIn}×{CUSTOM_TRIM_LIMITS.maxHIn} inches.
              </p>
            )}
            <label className="toggle-row" style={{ marginTop: 8 }}>
              <span>Landscape orientation</span>
              <input type="checkbox" checked={landscape} onChange={(e) => setLandscape(e.target.checked)} />
            </label>
          </div>

          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div className="section" style={{ flex: 1 }}>
              <span className="label">Page count</span>
              <input
                type="number" min={1} max={limits.max}
                value={pageCount}
                onChange={(e) => setPageCount(Math.max(1, Math.round(Number(e.target.value) || 1)))}
                aria-label="Interior page count"
              />
            </div>
            <div className="section" style={{ flex: 1 }}>
              <span className="label">Paper type</span>
              <select value={paper} onChange={(e) => setPaper(e.target.value as PaperType)} aria-label="Paper type">
                {PAPERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="section" style={{ flex: 1 }}>
              <span className="label">Binding</span>
              <select value={binding} onChange={(e) => setBinding(e.target.value as BindingType)} aria-label="Binding">
                <option value="paperback">Paperback</option>
                <option value="hardcover">Hardcover</option>
              </select>
            </div>
          </div>

          <p className={`newbook-guidance ${countLow || countHigh ? 'warn' : ''}`}>
            {countLow
              ? `KDP requires at least ${minPages} interior pages for ${binding} on ${paper} paper.`
              : countHigh
                ? `KDP allows at most ${limits.max} pages for this paper/binding.`
                : `KDP requires at least ${minPages} interior pages for ${binding}. Spine width updates with the page count.`}
          </p>

          <label className="toggle-row">
            <span>Include a cover (back + spine + front, one flat page)</span>
            <input
              type="checkbox"
              checked={includeCover}
              onChange={(e) => setIncludeCover(e.target.checked)}
            />
          </label>
          {includeCover && (
            <p className="hint" style={{ marginTop: 4 }}>
              Flat cover {formatIn(spec.totalWidth, 2)} × {formatIn(spec.totalHeight, 2)} ·
              spine {formatIn(spec.spine)} · {spec.spineTextAllowed
                ? 'spine text allowed'
                : 'spine text needs more than 79 pages'}. The cover resizes
              automatically as your page count changes.
            </p>
          )}

          {/* live summary */}
          <div className="newbook-summary" aria-live="polite">
            <Icon name="book" size={14} />
            <span>{summarizeBook(settings, pageCount)}</span>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button
            className="btn primary"
            onClick={() => void create()}
            disabled={busy || customInvalid}
          >
            {busy ? 'Creating…' : 'Create book'}
          </button>
        </div>
      </div>
    </div>
  );
}
