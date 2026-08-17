import { useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { FONTS } from '../../engine/font-manager';
import {
  DEFAULT_PAGE_NUMBERS,
  applyPageNumbers,
  hasPageNumbers,
  removePageNumbers,
  type NumberPosition,
  type PageNumberOptions,
} from '../../services/page-numbers';
import { useTextStyleStore } from '../../stores/text-style-store';

const POSITIONS: { v: NumberPosition; t: string; s: string }[] = [
  { v: 'bottom-center', t: 'Bottom centre', s: 'Most common' },
  { v: 'bottom-outer', t: 'Bottom outer', s: 'Mirrors on spine' },
  { v: 'bottom-inner', t: 'Bottom inner', s: 'Near the spine' },
  { v: 'top-center', t: 'Top centre', s: 'Header style' },
  { v: 'top-outer', t: 'Top outer', s: 'Mirrors on spine' },
];

const FORMATS = ['{n}', '— {n} —', 'Page {n}', '· {n} ·'];

export function PageNumbersModal({ onClose }: { onClose: () => void }) {
  const { pages, replaceAllPages } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);
  const docFont = useTextStyleStore((s) => s.fontFamily);

  const [opts, setOpts] = useState<PageNumberOptions>({
    ...DEFAULT_PAGE_NUMBERS,
    fontFamily: docFont,
  });
  const [busy, setBusy] = useState(false);
  const existing = hasPageNumbers(pages);

  const set = <K extends keyof PageNumberOptions>(k: K, v: PageNumberOptions[K]) =>
    setOpts((o) => ({ ...o, [k]: v }));

  const apply = async () => {
    setBusy(true);
    try {
      const next = await applyPageNumbers(pages, opts);
      await replaceAllPages(next);
      setStatus('success', 'Page numbers added to every page');
      onClose();
    } catch {
      setStatus('error', 'Could not add page numbers');
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    try {
      await replaceAllPages(removePageNumbers(pages));
      setStatus('success', 'Page numbers removed');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // The cover is a separate file and is never numbered.
  const interior = pages.filter((p) => p.role !== 'cover');
  const numbered = interior.filter(
    (_, i) => i + 1 >= opts.startAtPage && !(opts.skipFirst && i === 0),
  ).length;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <span>Page numbers</span>
          <button className="btn icon ghost" onClick={onClose} disabled={busy}>✕</button>
        </div>

        <div className="modal-body">
          <div className="section">
            <div className="section-title">Position</div>
            <div className="opt-grid">
              {POSITIONS.map((p) => (
                <button
                  key={p.v}
                  className={`opt ${opts.position === p.v ? 'active' : ''}`}
                  onClick={() => set('position', p.v)}
                >
                  <div className="t">{p.t}</div>
                  <div className="s">{p.s}</div>
                </button>
              ))}
            </div>
            <p className="hint" style={{ marginTop: 6 }}>
              “Outer” alternates left/right so numbers sit away from the spine in a
              bound book — the standard for KDP paperbacks.
            </p>
          </div>

          <div className="section">
            <div className="section-title">Style</div>
            <div className="stack">
              <div>
                <span className="label">Format</span>
                <div className="chips">
                  {FORMATS.map((f) => (
                    <button
                      key={f}
                      className={`chip ${opts.format === f ? 'active' : ''}`}
                      onClick={() => set('format', f)}
                    >
                      {f.replace('{n}', '7')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="label">Font</span>
                <select
                  value={opts.fontFamily}
                  onChange={(e) => set('fontFamily', e.target.value)}
                >
                  {FONTS.map((f) => (
                    <option key={f.family} value={f.family}>{f.label}</option>
                  ))}
                </select>
              </div>
              <div className="row">
                <div style={{ flex: 1 }}>
                  <span className="label">Size — {opts.fontSize}pt</span>
                  <input
                    type="range" min={6} max={24}
                    value={opts.fontSize}
                    onChange={(e) => set('fontSize', Number(e.target.value))}
                  />
                </div>
                <div>
                  <span className="label">Colour</span>
                  <input
                    type="color" value={opts.color}
                    onChange={(e) => set('color', e.target.value)}
                    style={{ width: 52 }}
                  />
                </div>
              </div>
              <div>
                <span className="label">Distance from edge — {opts.margin}pt</span>
                <input
                  type="range" min={10} max={72}
                  value={opts.margin}
                  onChange={(e) => set('margin', Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="section">
            <div className="section-title">Numbering</div>
            <div className="grid-2">
              <div>
                <span className="label">Start on page</span>
                <input
                  type="number" min={1} max={Math.max(1, interior.length)}
                  value={opts.startAtPage}
                  onChange={(e) => set('startAtPage', Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div>
                <span className="label">First number shown</span>
                <input
                  type="number" min={0}
                  value={opts.startNumber}
                  onChange={(e) => set('startNumber', Number(e.target.value) || 0)}
                />
              </div>
            </div>
            <label className="toggle-row" style={{ marginTop: 8 }}>
              <span>Skip the first page (cover)</span>
              <input
                type="checkbox"
                checked={opts.skipFirst}
                onChange={(e) => set('skipFirst', e.target.checked)}
              />
            </label>
            <p className="hint" style={{ marginTop: 6 }}>
              {numbered} of {interior.length} interior page
              {interior.length === 1 ? '' : 's'} will be numbered
              {pages.length !== interior.length && ' — the cover is skipped'}.
            </p>
          </div>
        </div>

        <div className="modal-foot">
          {existing && (
            <button className="btn danger" onClick={clear} disabled={busy}>
              Remove all
            </button>
          )}
          <div className="spacer" />
          <button className="btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={apply} disabled={busy}>
            {busy ? 'Applying…' : existing ? 'Update numbers' : 'Add numbers'}
          </button>
        </div>
      </div>
    </div>
  );
}
