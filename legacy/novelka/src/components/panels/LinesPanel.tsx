import { useEffect, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';
import {
  DEFAULT_RULING_CTX,
  RULINGS,
  RULING_GROUPS,
  type RulingDef,
} from '../../services/rulings';
import { useCanvasStore } from '../../stores/canvas-store';
import { useToastStore } from '../../stores/toast-store';
import { engine } from '../../engine/canvas-engine';
import { IN } from '../../types/canvas.types';
import { SafeSvgPreview } from '../SafeSvgPreview';

type Scope = 'page' | 'all' | 'blank';
type RulingGroup = RulingDef['group'];

/** Tag used to mark objects that belong to the last applied ruling so a style
 *  change can restyle exactly those — and nothing the user edited separately. */
const RULING_TAG = 'novelka:ruling';

const COLORS = [
  { c: '#c9d1dc', n: 'Light grey' },
  { c: '#9aa4b5', n: 'Grey' },
  { c: '#6b7280', n: 'Dark grey' },
  { c: '#111827', n: 'Black' },
  { c: '#93c5fd', n: 'Blue' },
  { c: '#fca5a5', n: 'Red' },
  { c: '#86efac', n: 'Green' },
  { c: '#d8b4fe', n: 'Purple' },
];

const SPACING_PRESETS = [
  { id: 'narrow', label: 'Narrow', value: 0.8 },
  { id: 'standard', label: 'Standard', value: 1 },
  { id: 'wide', label: 'Wide', value: 1.25 },
];

const GROUP_FILTERS: { key: 'all' | RulingGroup; label: string }[] = [
  { key: 'all', label: 'All' },
  ...RULING_GROUPS.map((g) => ({ key: g.key, label: g.key === 'grid' ? 'Grids' : g.label.replace(' lines', '') })),
];

export function LinesPanel({ embedded = false }: { embedded?: boolean } = {}) {
  const { pages, activePageId, replaceAllPages, commit } = useCanvasStore();
  const setStatus = useToastStore((s) => s.setStatus);

  const [group, setGroup] = useState<'all' | RulingGroup>('all');
  const [scope, setScope] = useState<Scope>('page');
  const [selectedId, setSelectedId] = useState(RULINGS[0]?.id ?? '');
  const [color, setColor] = useState(DEFAULT_RULING_CTX.color);
  const [spacing, setSpacing] = useState(1);
  const [weight, setWeight] = useState(1);
  const [kdpSafe, setKdpSafe] = useState(true);
  const [replace, setReplace] = useState(true);
  const [busy, setBusy] = useState(false);
  // The ruling currently applied to this page, so style changes can restyle it
  // live instead of only applying on the next click.
  const appliedIdRef = useRef<string | null>(null);
  const rafRef = useRef(0);

  const list = useMemo(
    () => (group === 'all' ? RULINGS : RULINGS.filter((r) => r.group === group)),
    [group],
  );
  const selected = RULINGS.find((r) => r.id === selectedId) ?? list[0] ?? RULINGS[0];

  useEffect(() => {
    if (!list.some((r) => r.id === selectedId)) setSelectedId(list[0]?.id ?? RULINGS[0]?.id ?? '');
  }, [list, selectedId]);

  const ctxFor = (w: number, h: number, pageNumber: number, pageCount: number) => ({
    w,
    h,
    pageNumber,
    pageCount,
    color,
    spacingScale: spacing,
    weightScale: weight,
    kdpSafe,
    plainMargin: 0.5 * IN,
  });

  const activePageIndex = Math.max(0, pages.findIndex((p) => p.id === activePageId));
  const activePage = pages[activePageIndex] ?? pages[0];
  const lineCount = useMemo(() => {
    if (!selected || !activePage) return 0;
    return selected.build(ctxFor(activePage.width, activePage.height, activePageIndex + 1, pages.length)).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, activePage?.width, activePage?.height, activePageIndex, pages.length, color, spacing, weight, kdpSafe]);

  const tagObjects = (objs: fabric.FabricObject[]) =>
    objs.forEach((o) => ((o as unknown as { name: string }).name = RULING_TAG));

  const applyOne = (r: RulingDef) => {
    const c = engine.requireCanvas();
    const idx = pages.findIndex((p) => p.id === activePageId);
    if (replace) c.remove(...c.getObjects());
    const objs = r.build(ctxFor(engine.pageWidth, engine.pageHeight, idx + 1, pages.length));
    tagObjects(objs);
    if (objs.length) engine.addObjects(objs);
    else c.requestRenderAll();
    appliedIdRef.current = r.id;
    commit(`Ruling: ${r.name}`);
  };

  /** Live restyle of the currently-applied ruling on this page, so changing
   *  color/spacing/weight controls updates the page immediately. Throttled to
   *  one frame and doesn't push history on every tick — the next explicit apply
   *  records the change. */
  const liveRestyle = (r?: RulingDef | null) => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const c = engine.canvas;
      if (!c) return;
      const id = r?.id ?? appliedIdRef.current;
      const def = RULINGS.find((x) => x.id === id);
      if (!def) return;
      const idx = pages.findIndex((p) => p.id === activePageId);
      const tagged = c.getObjects().filter((o) => (o as { name?: string }).name === RULING_TAG);
      tagged.forEach((o) => c.remove(o));
      const objs = def.build(ctxFor(engine.pageWidth, engine.pageHeight, idx + 1, pages.length));
      tagObjects(objs);
      if (objs.length) engine.addObjects(objs);
      c.requestRenderAll();
      appliedIdRef.current = def.id;
    });
  };

  // When color / spacing / weight / kdpSafe change and a ruling is already on
  // this page, restyle it live.
  useEffect(() => {
    if (appliedIdRef.current) liveRestyle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, spacing, weight, kdpSafe, activePageId]);

  const applyMany = async (r: RulingDef, onlyBlank: boolean) => {
    useCanvasStore.getState().syncActivePage();
    const current = useCanvasStore.getState().pages;
    const next = [];

    for (let i = 0; i < current.length; i++) {
      const page = current[i];
      // Never stamp an interior layout onto the wraparound cover.
      if (page.role === 'cover') {
        next.push(page);
        continue;
      }
      const existing =
        ((page.data as { objects?: unknown[] } | null)?.objects ?? []) as unknown[];
      if (onlyBlank && existing.length > 0) {
        next.push(page);
        continue;
      }

      const objs = r.build(ctxFor(page.width, page.height, i + 1, current.length));
      tagObjects(objs);

      // serialize without a live canvas
      const el = document.createElement('canvas');
      const tmp = new fabric.StaticCanvas(el, { width: page.width, height: page.height });
      objs.forEach((o) => tmp.add(o));
      const json = tmp.toObject(['id', 'elementType', 'name', 'locked']) as {
        objects: unknown[];
      };
      tmp.dispose();

      next.push({
        ...page,
        data: {
          version: '6.0.0',
          background: page.background ?? '#ffffff',
          objects: replace ? json.objects : [...json.objects, ...existing],
        },
      });
    }
    await replaceAllPages(next);
  };

  const applyRuling = async (r = selected) => {
    if (!r) return;
    setBusy(true);
    try {
      if (scope === 'page') {
        setStatus('busy', `Applying ${r.name}…`);
        applyOne(r);
        setStatus('success', `${r.name} applied`);
      } else {
        setStatus('busy', `Applying ${r.name} to ${pages.length} pages…`);
        await applyMany(r, scope === 'blank');
        appliedIdRef.current = scope === 'blank' && pages.find((p) => p.id === activePageId)?.data ? null : r.id;
        setStatus('success', `${r.name} applied to ${scope === 'blank' ? 'blank' : 'all'} pages`);
      }
    } catch {
      setStatus('error', 'Could not apply ruling');
    } finally {
      setBusy(false);
    }
  };

  const content = (
    <>
      <div className="panel-body">
        <div className="chips" style={{ marginBottom: 12 }}>
          {GROUP_FILTERS.map((g) => (
            <button
              key={g.key}
              className={`chip ${group === g.key ? 'active' : ''}`}
              onClick={() => setGroup(g.key)}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="grid-3">
          {list.map((r) => (
            <button
              key={r.id}
              className="ruling-card"
              onClick={() => setSelectedId(r.id)}
              onDoubleClick={() => {
                setSelectedId(r.id);
                void applyRuling(r);
              }}
              disabled={busy}
              title={`${r.spec} · ${r.group}`}
              aria-pressed={selected?.id === r.id}
            >
              <div className="ruling-prev" style={{ color }}>
                <SafeSvgPreview viewBox="0 0 100 100" markup={r.preview} />
                {r.accessLevel === 'ad_unlock' && <span className="tile-lock">AD</span>}
                {r.accessLevel === 'premium_only' && <span className="tile-lock pro">PRO</span>}
              </div>
              <div className="cap">{r.name}</div>
            </button>
          ))}
        </div>

        <details className="section" style={{ marginTop: 14 }}>
          <summary className="section-title">Customize</summary>
          <div className="stack" style={{ marginTop: 10 }}>
            <div>
              <span className="label">Line colour</span>
              <div className="swatches" style={{ marginBottom: 10 }}>
                {COLORS.map((c) => (
                  <button
                    key={c.c}
                    className={`swatch ${color === c.c ? 'on' : ''}`}
                    style={{ background: c.c }}
                    title={c.n}
                    onClick={() => setColor(c.c)}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  style={{ width: 26, height: 20, padding: 1 }}
                  title="Custom colour" aria-label="Custom colour"
                />
              </div>
            </div>

            <div>
              <span className="label">Spacing presets</span>
              <div className="chips">
                {SPACING_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    className={`chip ${Math.abs(spacing - p.value) < 0.01 ? 'active' : ''}`}
                    onClick={() => setSpacing(p.value)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <input
                  type="number"
                  min={0.6}
                  max={2}
                  step={0.05}
                  value={spacing}
                  onChange={(e) => setSpacing(Math.max(0.6, Math.min(2, Number(e.target.value) || 1)))}
                  aria-label="Custom spacing multiplier"
                />
                <span className="badge">{lineCount} lines total</span>
              </div>
            </div>

            <div>
              <span className="label">Line weight — {weight.toFixed(2)}×</span>
              <input
                type="range" min={0.5} max={3} step={0.1}
                value={weight}
                onChange={(e) => setWeight(Number(e.target.value))}
              />
            </div>

            <label className="toggle-row">
              <span>Replace existing content</span>
              <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
            </label>
            <label className="toggle-row">
              <span>Keep inside KDP safe area</span>
              <input type="checkbox" checked={kdpSafe} onChange={(e) => setKdpSafe(e.target.checked)} />
            </label>
          </div>
        </details>
      </div>

      <div className="panel-body-tight" style={{ borderTop: '1px solid var(--line)', padding: 10 }}>
        <div className="row" style={{ alignItems: 'stretch' }}>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            aria-label="Apply line pattern to"
            style={{ flex: 1 }}
          >
            <option value="page">Apply to: Current Page</option>
            <option value="all">Apply to: All Pages</option>
            <option value="blank">Apply to: Blank Pages Only</option>
          </select>
          <button
            className="btn primary"
            onClick={() => void applyRuling()}
            disabled={busy || !selected}
            style={{ justifyContent: 'center' }}
          >
            Apply Line Pattern
          </button>
        </div>
      </div>

    </>
  );

  if (embedded) return content;

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Lines &amp; grids</span>
        <span className="badge">{list.length}</span>
      </div>
      {content}
    </div>
  );
}
