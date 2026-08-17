import { useState } from 'react';
import { PAGE_SIZE_PRESETS, IN } from '../../types/canvas.types';
import { VALIDATED_TRIM_SIZES } from '../../domain/geometry';
import { Icon } from '../Icon';

interface Props {
  onOpenQuickWordSearch: () => void;
  onOpenModuleInEditor: (moduleId: 'sudoku' | 'crossword' | 'handwriting' | 'maze') => void;
  onNewDocument: (size: { width: number; height: number }, name: string) => void;
  onCreateCover: () => void;
  onImportPdf: () => void;
}

export function CreateView({
  onOpenQuickWordSearch,
  onOpenModuleInEditor,
  onNewDocument,
  onCreateCover,
  onImportPdf,
}: Props) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customW, setCustomW] = useState('6');
  const [customH, setCustomH] = useState('9');
  const [customUnit, setCustomUnit] = useState<'in' | 'mm' | 'pt'>('in');

  const toPt = (v: number) => (customUnit === 'in' ? v * IN : customUnit === 'mm' ? v * (IN / 25.4) : v);
  const customWn = parseFloat(customW) || 0;
  const customHn = parseFloat(customH) || 0;
  const customValid = customWn > 0 && customHn > 0;

  return (
    <div className="lp-scroll" style={{ padding: '32px 24px', maxWidth: 1120, margin: '0 auto', width: '100%' }}>
      <div style={{ marginBottom: 28 }}>
        <span className="lp-eyebrow" style={{ marginBottom: 6 }}>
          <span className="lp-dot" />
          Generator Hub
        </span>
        <h2 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.5px' }}>
          Create a New Book
        </h2>
        <p className="hint" style={{ fontSize: 14, margin: 0, maxWidth: 640 }}>
          Select an automated generator or start a custom blank document with automatic gutter calculations and preflight checks.
        </p>
      </div>

      <div className="stack" style={{ gap: 32 }}>
        {/* 1. Puzzle Books Category */}
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 14px 0', color: 'var(--lp-text, #f8fafc)' }}>
            Puzzle Books
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {/* Word Search (Active) */}
            <div
              style={{
                background: 'var(--lp-card, #1e293b)',
                border: '2px solid var(--lp-accent, #6366f1)',
                borderRadius: 14,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--accent-soft, #ede9fe)', color: 'var(--accent, #6366f1)', display: 'grid', placeItems: 'center' }}>
                      <Icon name="grid" size={18} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Word Search</h4>
                  </div>
                  <span className="badge" style={{ background: '#16a34a', color: '#ffffff', fontWeight: 600 }}>
                    Live · 1-Click
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--lp-dim, #94a3b8)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Complete automated word search books with theme banks, adaptive grid sizing, back-of-book answer keys, and safe-area preflight checks.
                </p>
              </div>
              <button className="lp-btn lp-btn-primary" onClick={onOpenQuickWordSearch}>
                <Icon name="wandSparkles" size={15} /> Quick Word Search Creator
              </button>
            </div>

            {/* Sudoku */}
            <div
              style={{
                background: 'var(--lp-card, #1e293b)',
                border: '1px solid var(--lp-line, #334155)',
                borderRadius: 14,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--lp-bg-2, #0f172a)', display: 'grid', placeItems: 'center' }}>
                      <Icon name="crossword" size={18} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Sudoku</h4>
                  </div>
                  <span className="badge" style={{ background: 'var(--lp-bg-2, #0f172a)', color: 'var(--lp-dim, #94a3b8)' }}>
                    In Editor
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--lp-dim, #94a3b8)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Unique solvable Sudoku puzzles (4×4, 9×9, 16×16) with rotational symmetry and answer key pages.
                </p>
              </div>
              <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => onOpenModuleInEditor('sudoku')}>
                <Icon name="sidebar" size={14} /> Open in Canvas Editor
              </button>
            </div>

            {/* Crossword */}
            <div
              style={{
                background: 'var(--lp-card, #1e293b)',
                border: '1px solid var(--lp-line, #334155)',
                borderRadius: 14,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--lp-bg-2, #0f172a)', display: 'grid', placeItems: 'center' }}>
                      <Icon name="puzzlePiece" size={18} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Crosswords</h4>
                  </div>
                  <span className="badge" style={{ background: 'var(--lp-bg-2, #0f172a)', color: 'var(--lp-dim, #94a3b8)' }}>
                    In Editor
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--lp-dim, #94a3b8)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Themed clue banks or custom word lists with standard crossword numbering and solution grids.
                </p>
              </div>
              <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => onOpenModuleInEditor('crossword')}>
                <Icon name="sidebar" size={14} /> Open in Canvas Editor
              </button>
            </div>

            {/* Mazes */}
            <div
              style={{
                background: 'var(--lp-card, #1e293b)',
                border: '1px solid var(--lp-line, #334155)',
                borderRadius: 14,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--lp-bg-2, #0f172a)', display: 'grid', placeItems: 'center' }}>
                      <Icon name="puzzle" size={18} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Mazes</h4>
                  </div>
                  <span className="badge" style={{ background: 'var(--lp-bg-2, #0f172a)', color: 'var(--lp-dim, #94a3b8)' }}>
                    In Editor
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--lp-dim, #94a3b8)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Square, circular, and hexagonal mazes guaranteed solvable with solution paths.
                </p>
              </div>
              <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => onOpenModuleInEditor('maze')}>
                <Icon name="sidebar" size={14} /> Open in Canvas Editor
              </button>
            </div>
          </div>
        </div>

        {/* 2. Activity Books Category */}
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 14px 0', color: 'var(--lp-text, #f8fafc)' }}>
            Activity &amp; Educational Books
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {/* Letter Tracing */}
            <div
              style={{
                background: 'var(--lp-card, #1e293b)',
                border: '1px solid var(--lp-line, #334155)',
                borderRadius: 14,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--lp-bg-2, #0f172a)', display: 'grid', placeItems: 'center' }}>
                      <Icon name="type" size={18} />
                    </div>
                    <h4 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>Letter Tracing</h4>
                  </div>
                  <span className="badge" style={{ background: 'var(--lp-bg-2, #0f172a)', color: 'var(--lp-dim, #94a3b8)' }}>
                    In Editor
                  </span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--lp-dim, #94a3b8)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  Alphabet and number practice sheets on standard guidelines with stroke order hints.
                </p>
              </div>
              <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => onOpenModuleInEditor('handwriting')}>
                <Icon name="sidebar" size={14} /> Open in Canvas Editor
              </button>
            </div>
          </div>
        </div>

        {/* 3. Validated Print Sizes & Custom Blank Books */}
        <div>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 14px 0', color: 'var(--lp-text, #f8fafc)' }}>
            Validated Print Sizes &amp; Blank Books
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {Object.entries(VALIDATED_TRIM_SIZES).map(([k, s]) => {
              const preset = PAGE_SIZE_PRESETS[k] ?? { width: s.width, height: s.height, label: s.label };
              return (
                <button
                  key={k}
                  className="lp-size-card"
                  style={{ textAlign: 'center', padding: 14 }}
                  onClick={() => onNewDocument(preset, `${s.label} interior`)}
                >
                  <strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>{s.label}</strong>
                  <span className="hint" style={{ fontSize: 12 }}>{s.width} × {s.height} pt</span>
                </button>
              );
            })}

            {/* Custom Size Card */}
            {!customOpen ? (
              <button className="lp-aux-card" onClick={() => setCustomOpen(true)}>
                <span className="lp-card-ic">
                  <Icon name="plus" size={16} />
                </span>
                <strong>Custom Size</strong>
                <span className="hint">Custom dimensions</span>
              </button>
            ) : (
              <div className="lp-aux-card lp-custom-open" style={{ gap: 8, padding: 12 }}>
                <div className="row" style={{ gap: 6, width: '100%' }}>
                  <input value={customW} onChange={(e) => setCustomW(e.target.value)} aria-label="Custom width" style={{ width: '50%' }} />
                  <span>×</span>
                  <input value={customH} onChange={(e) => setCustomH(e.target.value)} aria-label="Custom height" style={{ width: '50%' }} />
                </div>
                <select value={customUnit} onChange={(e) => setCustomUnit(e.target.value as 'in' | 'mm' | 'pt')}>
                  <option value="in">inches</option>
                  <option value="mm">mm</option>
                  <option value="pt">points</option>
                </select>
                <div className="row" style={{ gap: 6, width: '100%' }}>
                  <button className="lp-btn lp-btn-ghost lp-btn-sm" onClick={() => setCustomOpen(false)}>Cancel</button>
                  <button
                    className="lp-btn lp-btn-primary lp-btn-sm"
                    disabled={!customValid}
                    onClick={() =>
                      onNewDocument(
                        { width: Math.round(toPt(customWn)), height: Math.round(toPt(customHn)) },
                        `${customW} × ${customH} ${customUnit}`,
                      )
                    }
                  >
                    Create
                  </button>
                </div>
              </div>
            )}

            {/* Cover Wizard */}
            <button className="lp-aux-card" onClick={onCreateCover}>
              <span className="lp-card-ic">
                <Icon name="book" size={16} />
              </span>
              <strong>Wraparound Cover</strong>
              <span className="hint">Spine calculator</span>
            </button>

            {/* PDF Import */}
            <button className="lp-aux-card" onClick={onImportPdf}>
              <span className="lp-card-ic">
                <Icon name="upload" size={16} />
              </span>
              <strong>Import PDF</strong>
              <span className="hint">Edit existing file</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
