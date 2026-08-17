import { useEffect, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { PAGE_SIZES } from '../../types/canvas.types';
import { engine } from '../../engine/canvas-engine';
import { Icon } from '../Icon';

export function PagesPanel() {
  const {
    pages,
    activePageId,
    addPage,
    deletePage,
    duplicatePage,
    gotoPage,
    movePage,
    setPageSize,
    setPageBackground,
  } = useCanvasStore();

  const page = pages.find((p) => p.id === activePageId) ?? pages[0];
  const [dragPageId, setDragPageId] = useState<string | null>(null);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});

  // refresh the active page thumbnail periodically
  useEffect(() => {
    const t = setInterval(() => {
      if (!engine.canvas) return;
      const url = engine.canvas.toDataURL({
        format: 'png',
        multiplier: Math.min(1, 120 / engine.canvas.getWidth()),
        enableRetinaScaling: false,
      });
      setThumbs((s) => ({ ...s, [activePageId]: url }));
    }, 1500);
    return () => clearInterval(t);
  }, [activePageId]);

  const sizeKey =
    Object.entries(PAGE_SIZES).find(
      ([, s]) =>
        (s.width === page.width && s.height === page.height) ||
        (s.height === page.width && s.width === page.height),
    )?.[0] ?? 'custom';
  const landscape = page.width > page.height;

  const applySize = (key: string) => {
    const s = PAGE_SIZES[key];
    if (!s) return;
    setPageSize(landscape ? s.height : s.width, landscape ? s.width : s.height);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Pages</span>
        <span className="badge">{pages.length}</span>
      </div>
      <div className="panel-body">
        <div className="section">
          <div className="section-title">Page setup</div>
          <div className="stack">
            <div>
              <span className="label">Size</span>
              <select value={sizeKey} onChange={(e) => applySize(e.target.value)}>
                {Object.entries(PAGE_SIZES).map(([k, s]) => (
                  <option key={k} value={k}>
                    {s.name} — {Math.round(s.width)}×{Math.round(s.height)}pt
                  </option>
                ))}
                <option value="custom">Custom</option>
              </select>
            </div>
            <div className="row">
              <div style={{ flex: 1 }}>
                <span className="label">Width (pt)</span>
                <input
                  type="number"
                  value={Math.round(page.width)}
                  onChange={(e) => setPageSize(Number(e.target.value) || 1, page.height)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <span className="label">Height (pt)</span>
                <input
                  type="number"
                  value={Math.round(page.height)}
                  onChange={(e) => setPageSize(page.width, Number(e.target.value) || 1)}
                />
              </div>
            </div>
            <button className="btn" onClick={() => setPageSize(page.height, page.width)}>
              Swap orientation ({landscape ? 'landscape' : 'portrait'})
            </button>
            <div className="row between">
              <span className="label" style={{ margin: 0 }}>Background</span>
              <div className="row" style={{ gap: 6 }}>
                <input
                  type="color"
                  value={page.background ?? '#ffffff'}
                  onChange={(e) => setPageBackground(e.target.value)}
                  style={{ width: 46 }}
                />
                <button
                  className={`btn sm ${page.background === null ? 'active' : ''}`}
                  title="Transparent background" aria-label="Transparent background"
                  onClick={() => setPageBackground(page.background === null ? '#ffffff' : null)}
                >
                  <Icon name="transparent" size={13} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="section">
          <div className="section-title">Document pages</div>
          <div className="stack">
            {pages.map((p, i) => (
              <div
                key={p.id}
                className="row"
                draggable
                onDragStart={() => setDragPageId(p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragPageId) {
                    const from = pages.findIndex((page) => page.id === dragPageId);
                    if (from >= 0 && from !== i) movePage(from, i);
                  }
                  setDragPageId(null);
                }}
                onDragEnd={() => setDragPageId(null)}
                style={{
                  padding: 6,
                  borderRadius: 8,
                  border: `1px solid ${p.id === activePageId ? 'var(--accent)' : 'var(--line)'}`,
                  background: p.id === activePageId ? 'var(--accent-soft)' : 'var(--bg-3)',
                  cursor: 'pointer',
                }}
                onClick={() => gotoPage(p.id)}
              >
                <div
                  style={{
                    width: 34,
                    aspectRatio: `${p.width}/${p.height}`,
                    background: p.background ?? '#fff',
                    borderRadius: 3,
                    overflow: 'hidden',
                    flex: 'none',
                  }}
                >
                  {thumbs[p.id] && (
                    <img src={thumbs[p.id]} alt="" style={{ width: '100%', display: 'block' }} />
                  )}
                </div>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{p.name}</strong>
                  <small style={{ display: 'block', fontSize: 10, color: 'var(--text-mute)' }}>
                    {Math.round(p.width)}×{Math.round(p.height)}
                  </small>
                </span>
                <button
                  className="mini-btn"
                  title="Duplicate page" aria-label="Duplicate page"
                  onClick={(e) => {
                    e.stopPropagation();
                    duplicatePage(p.id);
                  }}
                >
                  <Icon name="clone" size={13} />
                </button>
                <button
                  className="mini-btn"
                  title="Delete page" aria-label="Delete page"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(p.id);
                  }}
                >
                  <Icon name="trash2" size={13} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn primary" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }} onClick={() => addPage()}>
            <Icon name="plus" size={14} /> Add page
          </button>
        </div>
      </div>
    </div>
  );
}
