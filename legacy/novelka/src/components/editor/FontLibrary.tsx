import { useMemo, useState } from 'react';
import { FONTS, LOCAL_FONT_COUNT, loadFont, type FontDef } from '../../engine/font-manager';

const GROUP_LABEL: Record<string, string> = {
  local: 'My fonts',
  sans: 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Handwriting',
  mono: 'Monospace',
};

const GROUP_ORDER = ['local', 'sans', 'serif', 'display', 'handwriting', 'mono'];

export function FontLibrary({
  activeFamily,
  onChoose,
  badge,
  previewText,
  onPreview,
  onEndPreview,
}: {
  activeFamily: string;
  onChoose: (family: string) => void | Promise<void>;
  badge?: string;
  previewText?: string;
  onPreview?: (o: { text: string; font: string; size: number; weight: string; fill: string }) => void;
  onEndPreview?: () => void;
}) {
  const [query, setQuery] = useState('');
  const preview = previewText?.trim() || 'Almost before we knew it';

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q ? FONTS.filter((f) => f.family.toLowerCase().includes(q)) : FONTS;
    const by: Record<string, FontDef[]> = {};
    filtered.forEach((f) => (by[f.category] ||= []).push(f));
    return GROUP_ORDER.filter((k) => by[k]?.length).map((k) => [k, by[k]] as const);
  }, [query]);

  const facesOf = (f: FontDef) => {
    if (f.source !== 'local' || !f.faces?.length) return null;
    const hasBold = f.faces.some((x) => Number(x.weight) >= 600 && x.style !== 'italic');
    const hasItalic = f.faces.some((x) => x.style === 'italic');
    return { hasBold, hasItalic, count: f.faces.length };
  };

  return (
    <div className="font-library panel-body-tight">
      <div className="row between" style={{ marginBottom: 10 }}>
        <div className="section-title" style={{ margin: 0 }}>
          Font styles
        </div>
        {badge ? <span className="badge">{badge}</span> : <span className="badge">{FONTS.length} fonts</span>}
      </div>

      <input
        placeholder="Search fonts…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        style={{ marginBottom: 8 }}
      />

      {groups.length === 0 && <div className="empty">No font matches “{query}”.</div>}

      {groups.map(([key, fonts]) => (
        <div key={key} className="font-group">
          <div className="font-group-head">
            {GROUP_LABEL[key] ?? key}
            {key === 'local' && <span className="badge">{LOCAL_FONT_COUNT}</span>}
          </div>
          {fonts.map((f) => {
            const info = facesOf(f);
            const active = f.family === activeFamily;
            return (
              <button
                key={f.family}
                className={`font-row ${active ? 'active' : ''}`}
                onClick={() => void onChoose(f.family)}
                onMouseEnter={() => {
                  void loadFont(f.family);
                  onPreview?.({ text: preview, font: f.family, size: 36, weight: '400', fill: '#111827' });
                }}
                onMouseLeave={onEndPreview}
                title={f.family}
              >
                <span
                  className="font-sample"
                  style={{ fontFamily: f.family, background: '#F8F8F8', color: '#111827', borderRadius: 6, padding: '8px 10px' }}
                >
                  {preview || f.family}
                </span>
                <span className="font-meta">
                  <span className="font-name">{f.family}</span>
                  {info && (
                    <span className="face-pills">
                      {info.hasBold && <em title="Real bold weight included" aria-label="Real bold weight included">B</em>}
                      {info.hasItalic && <em title="Real italic included" aria-label="Real italic included">I</em>}
                      <span className="hint">{info.count} file{info.count === 1 ? '' : 's'}</span>
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
