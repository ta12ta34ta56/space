import { useMemo, useState } from 'react';
import {
  BORDERS,
  DIVIDERS,
  ICONS,
  PATTERNS,
  STICKERS,
  searchAssets,
  type Asset,
} from '../../services/asset-library';
import { engine } from '../../engine/canvas-engine';
import { useToastStore } from '../../stores/toast-store';
import { ShapesSection } from './ShapePanel';
import { ClosePanelButton } from '../ClosePanelButton';

type ElementKind = 'all' | 'shapes' | 'stickers' | 'icons' | 'patterns' | 'borders' | 'dividers';

type ElementSection = {
  kind: Exclude<ElementKind, 'all'>;
  title: string;
  list: Asset[];
  layout: 'grid' | 'wide' | 'tall';
  cols: number;
};

const SECTIONS: ElementSection[] = [
  { kind: 'stickers', title: 'Stickers', list: STICKERS, layout: 'grid', cols: 3 },
  { kind: 'icons', title: 'Icons', list: ICONS, layout: 'grid', cols: 4 },
  { kind: 'patterns', title: 'Patterns', list: PATTERNS, layout: 'tall', cols: 3 },
  { kind: 'borders', title: 'Borders & Corners', list: BORDERS, layout: 'grid', cols: 3 },
  { kind: 'dividers', title: 'Dividers', list: DIVIDERS, layout: 'wide', cols: 1 },
];

const FILTERS: { key: ElementKind; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'shapes', label: 'Shapes' },
  { key: 'stickers', label: 'Stickers' },
  { key: 'icons', label: 'Icons' },
  { key: 'patterns', label: 'Patterns' },
  { key: 'borders', label: 'Borders' },
  { key: 'dividers', label: 'Dividers' },
];

export function ElementsPanel() {
  const [filter, setFilter] = useState<ElementKind>('all');
  const [query, setQuery] = useState('');
  const [color, setColor] = useState('#111827');
  const setStatus = useToastStore((s) => s.setStatus);

  const visibleSections = useMemo(() => {
    const source =
      filter === 'all' ? SECTIONS : SECTIONS.filter((s) => s.kind === filter);
    return source
      .map((section) => ({
        ...section,
        list: searchAssets(section.list, query),
      }))
      .filter((section) => filter !== 'all' || section.list.length > 0);
  }, [filter, query]);

  const showShapes = filter === 'all' || filter === 'shapes';

  const total = visibleSections.reduce((sum, section) => sum + section.list.length, 0);

  const place = async (asset: Asset, kind: ElementSection['kind']) => {
    try {
      setStatus('busy', `Adding ${asset.name}…`);
      if (asset.src.endsWith('.svg')) {
        await engine.addSVGFromURL(asset.src, {
          name: asset.name,
          fill: kind === 'patterns' ? color : undefined,
        });
      } else {
        await engine.addImageFromURL(asset.src, {
          elementType: asset.kind === 'icon' ? 'icon' : 'sticker',
          name: asset.name,
        });
      }
      setStatus('success', `${asset.name} added — recolour it in Properties`);
    } catch {
      setStatus('error', `Could not add ${asset.name}`);
    }
  };

  const renderGrid = (section: ElementSection) => {
    const gridClass =
      section.layout === 'wide' ? 'stack' : section.cols === 4 ? 'grid-4' : 'grid-3';
    return (
      <div className={gridClass} style={section.layout === 'wide' ? { gap: 6 } : undefined}>
        {section.list.map((asset) => (
          <div key={asset.id} className="asset-cell">
            <div
              className={`tile ${section.layout === 'wide' ? 'wide' : section.layout === 'tall' ? 'tall' : ''}`}
              draggable
              title={`${asset.name} — drag to canvas or click to add`}
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-novelka-asset', asset.src);
                e.dataTransfer.effectAllowed = 'copy';
              }}
              onClick={() => place(asset, section.kind)}
            >
              <span
                className="tile-art"
                role="img"
                aria-label={asset.name}
                style={{
                  // Non-pattern art is inserted tinted #111827 by default, so
                  // the preview uses the same colour — what you click is what
                  // you get. Patterns are tinted with the live colour picker.
                  background: section.kind === 'patterns' ? color : '#111827',
                  WebkitMaskImage: `url(${asset.src})`,
                  maskImage: `url(${asset.src})`,
                }}
              />
              {asset.accessLevel === 'ad_unlock' && <span className="tile-lock">AD</span>}
              {asset.accessLevel === 'premium_only' && <span className="tile-lock pro">PRO</span>}
            </div>
            {section.layout !== 'wide' && <div className="tile-label">{asset.name}</div>}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Elements</span>
        <span className="badge">{total}</span>
        <ClosePanelButton />
      </div>
      <div className="panel-body">
        <div className="chips" style={{ marginBottom: 10 }}>
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`chip ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>

        <input
          placeholder="Search elements…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 10 }}
        />

        {(filter === 'patterns' || filter === 'all') && (
          <div className="section">
            <div className="row between">
              <div className="section-title" style={{ margin: 0 }}>Pattern colour</div>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Pattern colour"
                style={{ width: 50 }}
              />
            </div>
          </div>
        )}

        {showShapes && <ShapesSection query={query} />}

        {total === 0 && !showShapes ? (
          <div className="empty">No elements match “{query}”.</div>
        ) : filter === 'all' ? (
          visibleSections.map((section) => (
            <section key={section.kind} className="section">
              <div className="section-title">{section.title}</div>
              {renderGrid(section)}
            </section>
          ))
        ) : (
          visibleSections.map((section) => (
            <div key={section.kind}>{renderGrid(section)}</div>
          ))
        )}

        <p className="hint" style={{ marginTop: 14 }}>
          Everything here is vector. Place it, then select it and use{' '}
          <strong>Artwork colour</strong> in the Properties panel to recolour that one piece.
        </p>
      </div>
    </div>
  );
}
