import { Fragment, useEffect, useRef, useState } from 'react';
import { useGrabReorder } from '../../hooks/useGrabReorder';
import { useCanvasStore } from '../../stores/canvas-store';
import { useEditorUiStore } from '../../stores/editor-ui-store';
import { engine, type FabricAny } from '../../engine/canvas-engine';
import { renderPageImage } from '../../engine/page-thumbnails';
import { usePreflight, pageSeverityMap } from '../../hooks/usePreflight';
import { coverSpecFor } from '../../services/book';
import type {
  ComprehensivePreflightResult,
  PreflightDiagnostic,
} from '../../domain/preflight';
import { Icon, type IconName } from '../Icon';

/**
 * Right-side dock: Pages / Layers / KDP Check.
 *
 * Two icon tabs sit on the outer edge of the workspace, vertically centred.
 * Clicking a tab opens its panel (sliding in from the right); clicking the
 * same tab again closes it; clicking the other switches. The KDP Check
 * temporarily replaces the tab content (opened from the bottom bar) and
 * clicking Pages or Layers returns to that tab.
 *
 * Everything inside reuses existing stores/engine/services — this is shell UI.
 */
export function RightDock({ onBulkAdd }: { onBulkAdd?: () => void }) {
  const rightDock = useEditorUiStore((s) => s.rightDock);
  const toggleRightDock = useEditorUiStore((s) => s.toggleRightDock);
  const setRightDock = useEditorUiStore((s) => s.setRightDock);
  // The header count reflects the REAL interior page count (the cover is a
  // separate deliverable and does not count toward KDP's interior minimum).
  const pageCount = useCanvasStore((s) => s.pages.filter((p) => p.role !== 'cover').length);
  const [kdpNonce, setKdpNonce] = useState(0);
  const preflight = usePreflight(kdpNonce);

  const title =
    rightDock === 'pages' ? 'Pages' : rightDock === 'layers' ? 'Layers' : 'KDP Check';

  return (
    <div className={`rightdock ${rightDock ? 'open' : ''}`}>
      {/* ------------------------------------------------ edge tab rail */}
      <div className="rightdock-tabs" role="tablist" aria-label="Pages and layers">
        <button
          className={`rightdock-tab ${rightDock === 'pages' ? 'active' : ''}`}
          onClick={() => toggleRightDock('pages')}
          title="Pages"
          aria-label="Pages"
          aria-pressed={rightDock === 'pages'}
        >
          <Icon name="pages" size={18} />
        </button>
        <button
          className={`rightdock-tab ${rightDock === 'layers' ? 'active' : ''}`}
          onClick={() => toggleRightDock('layers')}
          title="Layers"
          aria-label="Layers"
          aria-pressed={rightDock === 'layers'}
        >
          <Icon name="layers" size={18} />
        </button>
      </div>

      {/* ---------------------------------------------------- the panel */}
      {rightDock && (
        <aside className="rightdock-panel" aria-label={title}>
          <div className="rightdock-head">
            <span className="rightdock-title">
              {title}
              {rightDock === 'pages' && <span className="rightdock-count">{pageCount}</span>}
            </span>
            <button
              className="mini-btn"
              onClick={() => setRightDock(null)}
              title="Close panel"
              aria-label="Close panel"
            >
              <Icon name="close" size={13} />
            </button>
          </div>
          <div className="rightdock-body">
            {rightDock === 'pages' && (
              <PagesTab severity={pageSeverityMap(preflight)} onBulkAdd={onBulkAdd} />
            )}
            {rightDock === 'layers' && <LayersTab />}
            {rightDock === 'kdp' && (
              <KdpTab result={preflight} onRerun={() => setKdpNonce((n) => n + 1)} />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

/* ========================================================== Pages tab === */

function PagesTab({
  severity,
  onBulkAdd,
}: {
  severity: Record<string, 'error' | 'warn'>;
  onBulkAdd?: () => void;
}) {
  const {
    pages,
    activePageId,
    gotoPage,
    addPage,
    insertPageAt,
    duplicatePage,
    deletePage,
    movePage,
    book,
  } = useCanvasStore();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const reorder = useGrabReorder(pages, movePage);
  const { listRef } = reorder;
  /** pageId -> the data reference the cached thumbnail was rendered from */
  const renderedRef = useRef<Map<string, unknown>>(new Map());
  /** pageIds currently on screen (IntersectionObserver) */
  const visibleRef = useRef<Set<string>>(new Set());
  const renderingRef = useRef(false);

  // The cover's spine width, shown under its (wider, flat-cover) thumbnail.
  const interiorTotal = pages.filter((p) => p.role !== 'cover').length;
  const coverSpec = coverSpecFor(book, interiorTotal);

  // Live snapshot of whichever page is open on the canvas. Renders IMMEDIATELY
  // whenever the active page changes or its content changes (engine modified /
  // history events, rAF-throttled), so the content you just drew appears on the
  // thumbnail right away — no waiting for a slow poll interval. The thumbnail is
  // cached per page and only this page is invalidated.
  //
  // The thumbnail must always be an OPAQUE WHITE page surface — a page with no
  // background colour is stored as "transparent", which JPEG would otherwise
  // encode as black. We temporarily paint the live canvas onto an opaque white
  // ground while capturing, then restore it (the white page-shell behind the
  // canvas makes the swap visually invisible).
  const activePageData = pages.find((p) => p.id === activePageId)?.data;
  useEffect(() => {
    const doSnap = () => {
      const c = engine.canvas as FabricAny | null;
      if (!c) return;
      try {
        const page = useCanvasStore.getState().pages.find((p) => p.id === activePageId);
        const prev = c.backgroundColor;
        c.backgroundColor = page?.background ?? '#ffffff';
        c.requestRenderAll();
        const url = c.toDataURL({
          format: 'jpeg',
          quality: 0.6,
          multiplier: Math.min(1, 480 / Math.max(1, engine.pageWidth)),
          enableRetinaScaling: false,
        });
        c.backgroundColor = prev;
        c.requestRenderAll();
        setThumbs((s) => (s[activePageId] === url ? s : { ...s, [activePageId]: url }));
      } catch {
        /* canvas mid-teardown */
      }
    };
    // First paint right away.
    doSnap();
    // Live edits during drawing: re-snapshot on the next frame at most once.
    let raf = 0;
    const throttled = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        doSnap();
      });
    };
    const offs = [
      engine.on('modified', throttled),
      engine.on('history', throttled),
    ];
    return () => {
      offs.forEach((o) => o());
      if (raf) cancelAnimationFrame(raf);
    };
  }, [activePageId, activePageData]);

  // Real offscreen rendering (existing renderPageImage) for the rows that are
  // actually visible — lazy via IntersectionObserver so 200-page books stay smooth.
  useEffect(() => {
    let cancelled = false;

    const renderVisible = async () => {
      if (renderingRef.current || cancelled) return;
      renderingRef.current = true;
      try {
        for (const page of pages) {
          if (cancelled) return;
          if (!visibleRef.current.has(page.id)) continue;
          if (!page.data) continue;
          if (page.id === activePageId) continue; // live snapshot covers it
          if (renderedRef.current.get(page.id) === page.data) continue;
          try {
            const url = await renderPageImage(
              page.data,
              page.background,
              page.width,
              page.height,
              Math.min(1, 480 / page.width),
              'jpeg',
              0.6,
            );
            if (cancelled) return;
            renderedRef.current.set(page.id, page.data);
            setThumbs((s) => (s[page.id] === url ? s : { ...s, [page.id]: url }));
          } catch {
            /* skip pages that fail to render */
          }
        }
      } finally {
        renderingRef.current = false;
      }
    };

    const root = listRef.current;
    const io =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const e of entries) {
                const id = (e.target as HTMLElement).dataset.pageId;
                if (!id) continue;
                if (e.isIntersecting) visibleRef.current.add(id);
                else visibleRef.current.delete(id);
              }
              void renderVisible();
            },
            { root, rootMargin: '240px' },
          )
        : null;

    if (io && root) {
      root.querySelectorAll('[data-page-id]').forEach((el) => io.observe(el));
    } else {
      // No IO (jsdom): render everything once.
      pages.forEach((p) => visibleRef.current.add(p.id));
      void renderVisible();
    }
    void renderVisible();

    return () => {
      cancelled = true;
      io?.disconnect();
    };
  }, [pages, activePageId]);

  // Two-way sync: whenever the active page changes (clicking a row, or
  // selecting/navigating on the canvas), scroll that row into view so the user
  // always sees "this is the page I'm on".
  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-page-id="${activePageId}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activePageId]);

  let interiorNo = 0;

  return (
    <div className="dockpages" ref={listRef}>
      {pages.map((page, i) => {
        const cover = page.role === 'cover';
        if (!cover) interiorNo += 1;
        const n = interiorNo;
        const name = cover ? 'Cover' : `Page ${n}`;
        // Recto pages (odd interior numbers) print on the right; verso on the
        // left. The cover shows its spine width instead of Odd/Even.
        const side = cover
          ? `Spine ${coverSpec.spineInches.toFixed(3)}"`
          : n % 2 === 1 ? 'Odd' : 'Even';
        const active = page.id === activePageId;
        const sev = severity[page.id];
        const grabbing = reorder.grabId === page.id;
        return (
          <Fragment key={page.id}>
            <div
            data-page-id={page.id}
            data-reorder-id={page.id}
            className={`dockpage ${cover ? 'is-cover' : ''} ${active ? 'active' : ''} ${grabbing ? 'grabbing' : ''} ${sev === 'error' ? 'sev-err' : sev === 'warn' ? 'sev-warn' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => gotoPage(page.id)}
            onDoubleClick={() => reorder.grab(page.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                void gotoPage(page.id);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                movePage(i, i - 1);
              } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                movePage(i, i + 1);
              }
            }}
            title={`${name} — click to open, double-click to drag into a new order, ↑/↓ to move`}
          >
            <div
              className="dockpage-thumb"
              style={{
                aspectRatio: `${page.width} / ${page.height}`,
                // Always an opaque white page surface — never transparent, so
                // the panel background can never show through the thumbnail.
                background: '#ffffff',
              }}
            >
              {thumbs[page.id] && <img src={thumbs[page.id]} alt="" draggable={false} />}
              {sev && (
                <span
                  className={`dockpage-dot ${sev === 'error' ? 'err' : 'warn'}`}
                  title={sev === 'error' ? 'This page has preflight errors' : 'This page has preflight warnings'}
                />
              )}
              <div className="dockpage-tools">
                {!cover && (
                  <button
                    className="mini-btn"
                    title="Duplicate page"
                    aria-label="Duplicate page"
                    onClick={(e) => {
                      e.stopPropagation();
                      void duplicatePage(page.id);
                    }}
                  >
                    <Icon name="clone" size={12} />
                  </button>
                )}
                <button
                  className="mini-btn"
                  title="Delete page"
                  aria-label="Delete page"
                  onClick={(e) => {
                    e.stopPropagation();
                    void deletePage(page.id);
                  }}
                >
                  <Icon name="trash2" size={12} />
                </button>
              </div>
            </div>
            <div className="dockpage-label">
              <span className="dockpage-name">{name}</span>
              {side && <span className="dockpage-side">{side}</span>}
            </div>
            </div>
            <InsertGutter index={i} onInsert={() => void insertPageAt(i)} />
          </Fragment>
        );
      })}

      {reorder.grabId && reorder.indicatorTop !== null && (
        <div className="dockpage-dropline" style={{ top: reorder.indicatorTop }} />
      )}

      <div className="dockpage-add">
        <button className="dockpage-addlink" onClick={() => addPage()}>
          <Icon name="plus" size={13} /> Add page
        </button>
        {onBulkAdd && (
          <button
            className="dockpage-addlink"
            onClick={onBulkAdd}
            title="Add several pages at once"
          >
            Several…
          </button>
        )}
      </div>
    </div>
  );
}

/** A quiet inline "+" insert affordance between page rows. Renders as a thin
 *  divider that expands into a small round insert button on hover. */
function InsertGutter({ index, onInsert }: { index: number; onInsert: () => void }) {
  return (
    <div className="dockpage-insert" aria-label={`Insert a page after position ${index + 1}`}>
      <button
        className="dockpage-insert-btn"
        onClick={onInsert}
        title="Insert a page after this one"
        aria-label="Insert a page after this one"
      >
        <Icon name="plus" size={12} />
      </button>
    </div>
  );
}

/* ========================================================= Layers tab === */

interface LayerNode {
  id: string;
  name: string;
  kind: LayerKind;
  locked: boolean;
  visible: boolean;
  isActive: boolean;
  childCount: number;
  children: LayerNode[];
  /**
   * Set for synthetic "generated unit" rows: the ids of the loose canvas
   * objects that make up one generated puzzle/solution (tagged by the
   * generators with instanceId / sudokuPuzzle / wsPuzzle / …). The row acts
   * as one unit via the engine's existing multi-select mechanics.
   */
  memberIds?: string[];
}

type LayerKind = 'puzzle' | 'solution' | 'template' | 'text' | 'image' | 'shape';

const KIND_META: Record<LayerKind, { icon: IconName; className: string; label: string }> = {
  puzzle: { icon: 'puzzle', className: 'lk-puzzle', label: 'Puzzle' },
  solution: { icon: 'check', className: 'lk-solution', label: 'Solution' },
  template: { icon: 'layoutTemplate', className: 'lk-template', label: 'Template' },
  text: { icon: 'type', className: 'lk-text', label: 'Text' },
  image: { icon: 'image', className: 'lk-image', label: 'Image' },
  shape: { icon: 'shapes', className: 'lk-shape', label: 'Shape' },
};

function isSolutionish(o: FabricAny): boolean {
  const hay = `${o.instanceRole ?? ''} ${o.sudokuRole ?? ''} ${o.wsRole ?? ''} ${o.cwRole ?? ''} ${o.mzRole ?? ''} ${o.hwRole ?? ''} ${o.name ?? ''}`;
  return /solution|answer/i.test(hay);
}

function isPuzzleish(o: FabricAny): boolean {
  return !!(
    o.moduleId ||
    o.instanceId ||
    o.sudokuRole ||
    o.wsRole ||
    o.cwRole ||
    o.mzRole ||
    o.hwRole ||
    o.sudokuPuzzle ||
    o.wsPuzzle ||
    o.cwPuzzle ||
    o.mzPuzzle ||
    o.hwPuzzle
  );
}

function kindOf(o: FabricAny): LayerKind {
  if (isSolutionish(o)) return 'solution';
  if (isPuzzleish(o)) return 'puzzle';
  const t = String(o.type ?? '').toLowerCase();
  if (t === 'textbox' || t === 'i-text' || t === 'text') return 'text';
  if (t === 'image') return 'image';
  const et = String(o.elementType ?? '');
  if (et === 'text') return 'text';
  if (et === 'image' || et === 'sticker' || et === 'icon') return 'image';
  if (t === 'group' && (et === 'group' || !et)) return 'template';
  return 'shape';
}

function labelFor(o: FabricAny): string {
  if (o.name) return String(o.name);
  switch (o.type) {
    case 'textbox':
    case 'i-text':
    case 'text':
      return String(o.text ?? 'Text').slice(0, 28) || 'Text';
    case 'image':
      return o.elementType === 'sticker' ? 'Sticker' : 'Image';
    case 'group':
      return `Group (${o._objects?.length ?? 0})`;
    default:
      return o.elementType ?? o.type ?? 'Object';
  }
}

function toNode(o: FabricAny, activeIds: Set<string>, depth = 0): LayerNode {
  const children: FabricAny[] = depth < 2 ? (o._objects ?? []) : [];
  return {
    id: o.id ?? '',
    name: labelFor(o),
    kind: kindOf(o),
    locked: !!o.locked,
    visible: o.visible !== false,
    isActive: activeIds.has(o.id),
    childCount: (o._objects ?? []).length,
    children: children.map((c) => toNode(c, activeIds, depth + 1)),
  };
}

/** The puzzle-unit tag generators stamp on every object they emit. */
function unitKeyOf(o: FabricAny): string | null {
  return (
    (o.instanceId as string) ??
    (o.sudokuPuzzle as string) ??
    (o.wsPuzzle as string) ??
    (o.cwPuzzle as string) ??
    (o.mzPuzzle as string) ??
    (o.hwPuzzle as string) ??
    null
  );
}

function moduleLabelOf(o: FabricAny): string {
  if (o.sudokuPuzzle || o.sudokuRole) return 'Sudoku';
  if (o.wsPuzzle || o.wsRole) return 'Word search';
  if (o.cwPuzzle || o.cwRole) return 'Crossword';
  if (o.mzPuzzle || o.mzRole) return 'Maze';
  if (o.hwPuzzle || o.hwRole) return 'Handwriting';
  return 'Puzzle';
}

function useLayerTree(): LayerNode[] {
  const [nodes, setNodes] = useState<LayerNode[]>([]);
  useEffect(() => {
    const read = () => {
      const c = engine.canvas;
      if (!c) return setNodes([]);
      const activeIds = new Set(c.getActiveObjects().map((o) => (o as FabricAny).id));

      // Cluster loose generated objects into one row per puzzle/solution.
      // Generators emit tagged loose objects (not fabric Groups) so the live
      // layout engines keep working — the layers panel presents each tag
      // cluster as a single group row.
      const clusters = new Map<string, FabricAny[]>();
      const order: ({ t: 'obj'; o: FabricAny } | { t: 'unit'; key: string })[] = [];
      for (const raw of c.getObjects()) {
        const o = raw as FabricAny;
        const key = unitKeyOf(o);
        if (key) {
          if (!clusters.has(key)) {
            clusters.set(key, []);
            order.push({ t: 'unit', key });
          }
          clusters.get(key)!.push(o);
        } else {
          order.push({ t: 'obj', o });
        }
      }

      const list = order.map((entry): LayerNode => {
        if (entry.t === 'obj') return toNode(entry.o, activeIds);
        const members = clusters.get(entry.key)!;
        if (members.length === 1) return toNode(members[0], activeIds);
        const solution = members.some(isSolutionish);
        return {
          id: `unit:${entry.key}`,
          name: `${moduleLabelOf(members[0])} ${solution ? 'solution' : 'puzzle'}`,
          kind: solution ? 'solution' : 'puzzle',
          locked: members.every((m) => !!m.locked),
          visible: members.some((m) => m.visible !== false),
          isActive: members.some((m) => activeIds.has(m.id)),
          childCount: members.length,
          children: [...members].reverse().map((m) => toNode(m, activeIds, 1)),
          memberIds: members.map((m) => m.id as string),
        };
      });

      setNodes(list.reverse());
    };
    const offs = [
      engine.on('added', read),
      engine.on('removed', read),
      engine.on('modified', read),
      engine.on('selection', read),
      engine.on('history', read),
    ];
    read();
    const t = setInterval(read, 900);
    return () => {
      offs.forEach((o) => o());
      clearInterval(t);
    };
  }, []);
  return nodes;
}

function LayersTab() {
  const nodes = useLayerTree();
  const commit = useCanvasStore((s) => s.commit);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /** Reorder a top-level layer row to a new index (drag drop). Moving a
   *  generated unit moves the whole cluster; its internal order is preserved. */
  const reorderRows = (from: number, to: number) => {
    const c = engine.canvas;
    if (!c) return;
    if (from < 0 || from >= nodes.length || to < 0 || to > nodes.length) return;
    const arr = [...nodes];
    const [moved] = arr.splice(from, 1);
    arr.splice(Math.max(0, Math.min(to, arr.length)), 0, moved);
    // Rebuild bottom→top object order (nodes are top→front first).
    const idsOrdered: string[] = [];
    for (let i = arr.length - 1; i >= 0; i--) {
      const n = arr[i];
      if (n.memberIds) idsOrdered.push(...n.memberIds);
      else idsOrdered.push(n.id);
    }
    const objById = new Map(c.getObjects().map((o) => [(o as FabricAny).id as string, o]));
    idsOrdered.forEach((id, index) => {
      const o = objById.get(id);
      if (o) c.moveObjectTo(o, index);
    });
    c.requestRenderAll();
    commit('Reorder layer');
  };

  const reorder = useGrabReorder(nodes, reorderRows);

  const setProp = (node: LayerNode, prop: 'locked' | 'visible', value: boolean) => {
    const c = engine.canvas;
    if (!c) return;
    const ids = new Set(node.memberIds ?? [node.id]);
    const targets = c.getObjects().filter((o) => ids.has((o as FabricAny).id as string));
    if (!targets.length) return;
    for (const t of targets) {
      const obj = t as FabricAny;
      if (prop === 'locked') {
        obj.locked = value;
        obj.selectable = !value;
        obj.evented = !value;
      } else {
        obj.visible = value;
      }
    }
    if (prop === 'locked' && value) c.discardActiveObject();
    c.requestRenderAll();
    commit(prop === 'locked' ? (value ? 'Lock layer' : 'Unlock layer') : 'Toggle visibility');
  };

  const removeNode = (node: LayerNode) => {
    const c = engine.canvas;
    if (!c) return;
    if (!node.memberIds) {
      engine.removeById(node.id);
      return;
    }
    const ids = new Set(node.memberIds);
    const targets = c.getObjects().filter((o) => ids.has((o as FabricAny).id as string));
    if (!targets.length) return;
    if (targets.some((t) => c.getActiveObjects().includes(t))) c.discardActiveObject();
    c.remove(...targets);
    c.requestRenderAll();
    commit('Delete layer');
  };

  const selectNode = (node: LayerNode) => {
    if (node.locked) return;
    if (node.memberIds) engine.selectByIds(node.memberIds);
    else engine.selectById(node.id);
  };

  const toggleExpand = (id: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (nodes.length === 0) {
    return (
      <div className="empty" style={{ margin: 12 }}>
        This page is empty.
        <br />
        Add text, elements or a puzzle from the left rail.
      </div>
    );
  }

  const renderRow = (node: LayerNode, isChild = false) => {
    const meta = KIND_META[node.kind];
    const hasChildren = node.childCount > 0 && !isChild;
    const open = expanded.has(node.id);
    return (
      <div key={node.id || node.name}>
        <div
          data-reorder-id={isChild ? undefined : node.id}
          className={`docklayer ${node.isActive ? 'active' : ''} ${isChild ? 'child' : ''} ${!isChild && reorder.grabId === node.id ? 'move-mode' : ''}`}
          onClick={() => {
            if (isChild) return; // generated units stay one selectable unit
            selectNode(node);
          }}
          onDoubleClick={() => {
            if (isChild) return;
            reorder.grab(node.id);
          }}
          title={
            !isChild
              ? 'Double-click to drag into a new order'
              : undefined
          }
          role={isChild ? undefined : 'button'}
          tabIndex={isChild ? undefined : 0}
          onKeyDown={(e) => {
            if (isChild) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              selectNode(node);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              const idx = nodes.findIndex((n) => n.id === node.id);
              if (idx > 0) reorderRows(idx, idx - 1);
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              const idx = nodes.findIndex((n) => n.id === node.id);
              if (idx >= 0 && idx < nodes.length - 1) reorderRows(idx, idx + 1);
            }
          }}
        >
          {hasChildren ? (
            <button
              className="docklayer-chevron"
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node.id);
              }}
              title={open ? 'Collapse' : 'Expand'}
              aria-label={open ? 'Collapse group' : 'Expand group'}
            >
              <Icon name={open ? 'chevronDown' : 'chevron-right'} size={12} />
            </button>
          ) : (
            <span className="docklayer-chevron blank" />
          )}
          <span className={`docklayer-type ${meta.className}`} title={meta.label}>
            <Icon name={meta.icon} size={12} />
          </span>
          <span className="docklayer-name">{node.name}</span>
          {node.childCount > 0 && <span className="docklayer-count">{node.childCount}</span>}
          {!isChild && (
            <span className="docklayer-actions">
              <button
                className={`mini-btn ${node.visible ? '' : 'on'}`}
                title={node.visible ? 'Hide' : 'Show'}
                aria-label={node.visible ? 'Hide layer' : 'Show layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  setProp(node, 'visible', !node.visible);
                }}
              >
                <Icon name={node.visible ? 'eye' : 'eyeoff'} size={12} />
              </button>
              <button
                className={`mini-btn ${node.locked ? 'on' : ''}`}
                title={node.locked ? 'Unlock' : 'Lock'}
                aria-label={node.locked ? 'Unlock layer' : 'Lock layer'}
                onClick={(e) => {
                  e.stopPropagation();
                  setProp(node, 'locked', !node.locked);
                }}
              >
                <Icon name={node.locked ? 'lock' : 'unlock'} size={12} />
              </button>
              {!node.memberIds && (
                <button
                  className="mini-btn"
                  title="Duplicate"
                  aria-label="Duplicate layer"
                  onClick={(e) => {
                    e.stopPropagation();
                    void engine.duplicateById(node.id);
                  }}
                >
                  <Icon name="clone" size={12} />
                </button>
              )}
              <button
                className="mini-btn danger"
                title="Delete"
                aria-label="Delete layer"
                onClick={(e) => {
                  e.stopPropagation();
                  removeNode(node);
                }}
              >
                <Icon name="trash2" size={12} />
              </button>
            </span>
          )}
        </div>
        {hasChildren && open && (
          <div className="docklayer-children">
            {node.children.map((c) => renderRow(c, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="docklayers">
      <div className="docklayers-order">
        <span className="docklayers-hint">
          Double-click a layer to drag it into a new order
        </span>
      </div>
      {nodes.map((n) => renderRow(n))}
      {reorder.grabId && reorder.indicatorTop !== null && (
        <div className="dockpage-dropline" style={{ top: reorder.indicatorTop }} />
      )}
    </div>
  );
}

/* ======================================================== KDP Check ===== */

function KdpTab({
  result,
  onRerun,
}: {
  result: ComprehensivePreflightResult | null;
  onRerun: () => void;
}) {
  const { pages, gotoPage } = useCanvasStore();
  const setRightDock = useEditorUiStore((s) => s.setRightDock);

  const jump = (d: PreflightDiagnostic) => {
    const target = d.pageId
      ? pages.find((p) => p.id === d.pageId)
      : d.pageNumber
        ? pages[d.pageNumber - 1]
        : undefined;
    if (target) void gotoPage(target.id);
  };

  if (!result) {
    return <div className="empty" style={{ margin: 12 }}>Running KDP checks…</div>;
  }

  const badge =
    result.status === 'pass'
      ? { cls: 'ok', label: 'Ready for KDP', icon: 'check' as IconName }
      : result.status === 'warnings'
        ? { cls: 'warn', label: `${result.warnings.length} warning${result.warnings.length === 1 ? '' : 's'}`, icon: 'alert' as IconName }
        : { cls: 'bad', label: `${result.errors.length} blocking issue${result.errors.length === 1 ? '' : 's'}`, icon: 'alert' as IconName };

  const renderDiag = (d: PreflightDiagnostic, i: number) => (
    <div key={`${d.code}-${i}`} className={`kdp-diag ${d.severity === 'error' ? 'err' : 'warn'}`}>
      <div className="kdp-diag-top">
        <span className="kdp-diag-code">{d.code}</span>
        {d.pageNumber !== undefined && <span className="kdp-diag-page">Page {d.pageNumber}</span>}
        {(d.pageId || d.pageNumber !== undefined) && (
          <button className="kdp-diag-jump" onClick={() => jump(d)}>
            Jump
          </button>
        )}
      </div>
      <div className="kdp-diag-msg">{d.message}</div>
      {d.recommendedFix && <div className="kdp-diag-fix">Fix: {d.recommendedFix}</div>}
    </div>
  );

  return (
    <div className="kdp-check">
      <div className={`kdp-status ${badge.cls}`}>
        <Icon name={badge.icon} size={14} />
        <span>{badge.label}</span>
      </div>
      <p className="kdp-summary">{result.summary}</p>

      <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={onRerun}>
        <Icon name="history" size={13} /> Run checks again
      </button>

      {result.errors.length > 0 && (
        <div className="kdp-group">
          <div className="section-title">Errors</div>
          {result.errors.map(renderDiag)}
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className="kdp-group">
          <div className="section-title">Warnings</div>
          {result.warnings.map(renderDiag)}
        </div>
      )}
      {result.status === 'pass' && (
        <div className="empty" style={{ marginTop: 12 }}>
          No issues found. Your interior passes Novelka’s KDP checks.
        </div>
      )}

      <button
        className="btn ghost"
        style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
        onClick={() => setRightDock('pages')}
      >
        Back to pages
      </button>
    </div>
  );
}
