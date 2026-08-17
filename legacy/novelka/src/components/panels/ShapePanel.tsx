import { useMemo, useState, type ReactElement } from 'react';
import { engine, type ShapeKind } from '../../engine/canvas-engine';
import { useToastStore } from '../../stores/toast-store';

interface ShapeDef {
  kind: ShapeKind;
  label: string;
  group: 'basic' | 'lines' | 'polygons';
  /** stroke-only preview so every tile reads the same way */
  preview: ReactElement;
  /** extra options handed to the engine */
  options?: Record<string, unknown>;
}

const SHAPES: ShapeDef[] = [
  { kind: 'rect', label: 'Rectangle', group: 'basic', preview: <rect x="3" y="6" width="18" height="12" rx="0.5" /> },
  { kind: 'rounded-rect', label: 'Rounded', group: 'basic', preview: <rect x="3" y="6" width="18" height="12" rx="4" /> },
  { kind: 'circle', label: 'Circle', group: 'basic', preview: <circle cx="12" cy="12" r="8.5" /> },
  { kind: 'ellipse', label: 'Ellipse', group: 'basic', preview: <ellipse cx="12" cy="12" rx="10" ry="6.5" /> },
  { kind: 'triangle', label: 'Triangle', group: 'basic', preview: <polygon points="12,4 21,20 3,20" /> },
  { kind: 'star', label: 'Star', group: 'basic', preview: <polygon points="12,2.5 14.7,9.3 22,9.8 16.4,14.4 18.2,21.5 12,17.6 5.8,21.5 7.6,14.4 2,9.8 9.3,9.3" /> },

  { kind: 'line', label: 'Line', group: 'lines', preview: <line x1="3" y1="12" x2="21" y2="12" /> },
  { kind: 'arrow', label: 'Arrow', group: 'lines', preview: <path d="M3 12h15M14 7l5 5-5 5" /> },

  { kind: 'polygon', label: 'Pentagon', group: 'polygons', options: { sides: 5 }, preview: <polygon points="12,3 21,9.7 17.6,20.3 6.4,20.3 3,9.7" /> },
  { kind: 'polygon', label: 'Hexagon', group: 'polygons', options: { sides: 6 }, preview: <polygon points="12,3 20,7.5 20,16.5 12,21 4,16.5 4,7.5" /> },
  { kind: 'polygon', label: 'Octagon', group: 'polygons', options: { sides: 8 }, preview: <polygon points="8.5,3.5 15.5,3.5 20.5,8.5 20.5,15.5 15.5,20.5 8.5,20.5 3.5,15.5 3.5,8.5" /> },
  { kind: 'polygon', label: '12-sided', group: 'polygons', options: { sides: 12 }, preview: <circle cx="12" cy="12" r="9" /> },
];

const GROUPS: { key: ShapeDef['group']; label: string }[] = [
  { key: 'basic', label: 'Basic shapes' },
  { key: 'lines', label: 'Lines & arrows' },
  { key: 'polygons', label: 'Polygons' },
];

/** Neutral defaults — everything is restyled in Properties after placing. */
const DEFAULT_FILL = '#e5e7eb';
const DEFAULT_STROKE = '#111827';

/** Place a shape with the neutral default style (shared with ElementsPanel). */
export function addShapeToCanvas(shape: ShapeDef) {
  const isLine = shape.group === 'lines';
  engine.addShape(shape.kind, {
    fill: isLine ? null : DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: isLine ? 3 : 1.5,
    ...shape.options,
  });
}

/**
 * The shape tiles as a standalone section, so the merged Elements panel can
 * embed shapes alongside stickers/icons/patterns/borders/dividers.
 */
export function ShapesSection({ query = '' }: { query?: string }) {
  const setStatus = useToastStore((s) => s.setStatus);
  const q = query.trim().toLowerCase();
  const list = q ? SHAPES.filter((s) => s.label.toLowerCase().includes(q)) : SHAPES;
  const groups = GROUPS.map((g) => ({
    ...g,
    items: list.filter((s) => s.group === g.key),
  })).filter((g) => g.items.length);

  if (!groups.length) return null;

  return (
    <>
      {groups.map((g) => (
        <div key={g.key} className="section">
          <div className="section-title">{g.label}</div>
          <div className="grid-3">
            {g.items.map((shape) => (
              <div key={shape.label} className="asset-cell">
                <button
                  className="tile shape-tile"
                  title={`${shape.label} — click to add`}
                  onClick={() => {
                    addShapeToCanvas(shape);
                    setStatus('success', `${shape.label} added — style it in Properties`);
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1f2937"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {shape.preview}
                  </svg>
                </button>
                <div className="tile-label">{shape.label}</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function ShapePanel() {
  const setStatus = useToastStore((s) => s.setStatus);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? SHAPES.filter((s) => s.label.toLowerCase().includes(q)) : SHAPES;
    return GROUPS.map((g) => ({
      ...g,
      items: list.filter((s) => s.group === g.key),
    })).filter((g) => g.items.length);
  }, [query]);

  const add = (shape: ShapeDef) => {
    const isLine = shape.group === 'lines';
    engine.addShape(shape.kind, {
      // Lines carry a stroke; solids get a light fill with a crisp outline so
      // they're visible on white before the user styles them.
      fill: isLine ? null : DEFAULT_FILL,
      stroke: DEFAULT_STROKE,
      strokeWidth: isLine ? 3 : 1.5,
      ...shape.options,
    });
    setStatus('success', `${shape.label} added — style it in Properties`);
  };

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Shapes</span>
        <span className="badge">{SHAPES.length}</span>
      </div>
      <div className="panel-body">
        <input
          placeholder="Search shapes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: 12 }}
        />

        {groups.length === 0 && <div className="empty">No shape matches “{query}”.</div>}

        {groups.map((g) => (
          <div key={g.key} className="section">
            <div className="section-title">{g.label}</div>
            <div className="grid-3">
              {g.items.map((shape) => (
                <div key={shape.label} className="asset-cell">
                  <button
                    className="tile shape-tile"
                    title={`${shape.label} — click to add`}
                    onClick={() => add(shape)}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1f2937"
                      strokeWidth={1.6}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      {shape.preview}
                    </svg>
                  </button>
                  <div className="tile-label">{shape.label}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <p className="hint">
          Shapes drop in with a neutral style. Select one and use the{' '}
          <strong>Appearance</strong> section in Properties for fill, stroke,
          corner radius and opacity.
        </p>
      </div>
    </div>
  );
}
