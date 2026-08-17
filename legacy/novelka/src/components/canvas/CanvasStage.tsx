import { useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { engine } from '../../engine/canvas-engine';
import { useCanvasStore } from '../../stores/canvas-store';
import { useEditorUiStore } from '../../stores/editor-ui-store';
import { useToastStore } from '../../stores/toast-store';
import { useSelection } from '../../hooks/useSelection';
import { Icon } from '../Icon';
import type { InspectorView } from '../editor/InspectorPanel';
import { toggleSelectionLock } from '../../services/selection-actions';
import { kdpMarginsFor, safeAreaFor, isKdpTrim } from '../../services/kdp';
import { fileToDataURL } from '../../utils/file-utils';
import { coverSpecFor } from '../../services/book';
import { coverGuideGeom, coverSnapLinesX, coverSnapLinesY } from '../../services/cover-guides';
import { CoverGuides } from './CoverGuides';
import type { FabricAny } from '../../engine/canvas-engine';

/** The puzzle-unit tag generators stamp on every object they emit. */
function unitKeyOf(o: FabricAny): string | null {
  return (
    o?.instanceId ??
    o?.sudokuPuzzle ??
    o?.wsPuzzle ??
    o?.cwPuzzle ??
    o?.mzPuzzle ??
    o?.hwPuzzle ??
    null
  );
}

export function CanvasStage({
  overlay,
}: {
  overlay?: ReactNode;
  onOpenInspector?: (view: InspectorView) => void;
}) {
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [guides, setGuides] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [dragOver, setDragOver] = useState(false);
  const [pageDeselected, setPageDeselected] = useState(true);
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);
  const selection = useSelection();

  // Track browser fullscreen so we can show an exit button in the corner.
  useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  // Keep the latest selection readable from the (mount-time) canvas listener.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const {
    pages,
    activePageId,
    book,
    commit,
  } = useCanvasStore();
  const {
    zoom,
    showGrid,
    gridSize,
    showRulers,
    showMargins,
    showKdpGuides,
    showBleed,
    showCoverGuides,
    setZoom,
  } = useEditorUiStore();
  const setStatus = useToastStore((s) => s.setStatus);


  const pageIndex = Math.max(0, pages.findIndex((p) => p.id === activePageId));
  const page = pages[pageIndex] ?? pages[0];
  const isCover = page.role === 'cover';

  // The cover is one flat spread — the interior KDP gutter/safe clamp does not
  // apply to it. Keep cover editing free (never clamp to a bogus interior box).
  useEffect(() => {
    engine.setKdpBoundaryLock(isCover ? false : showKdpGuides, pageIndex + 1, pages.length);
  }, [showKdpGuides, pageIndex, pages.length, isCover]);

  // Cover reference geometry — reused by the minimal bleed/spine reference
  // marks. The cover otherwise shows no chrome.
  const interiorCount = pages.filter((p) => p.role !== 'cover').length;
  const coverSpec = isCover ? coverSpecFor(book, interiorCount) : null;
  const coverGeom = useMemo(
    () => (coverSpec ? coverGuideGeom(coverSpec, page.width, page.height) : null),
    [coverSpec, page.width, page.height],
  );

  // Magnetic snapping on the cover: feed the guideline positions to the engine
  // so objects/images/text snap to bleed/trim/safe/spine/barcode lines when
  // moved or resized within the threshold. Cleared on interior pages.
  useEffect(() => {
    if (isCover && coverGeom) {
      engine.snapLinesX = coverSnapLinesX(coverGeom);
      engine.snapLinesY = coverSnapLinesY(coverGeom);
      engine.snapThreshold = 6;
    } else {
      engine.snapLinesX = [];
      engine.snapLinesY = [];
    }
  }, [isCover, coverGeom]);

  // Clicking empty workspace deselects everything — nothing lingers selected.
  const pageSelected = selection.count === 0 && !pageDeselected;

  // ------------------------------------------------------------ mount once
  useEffect(() => {
    if (!canvasEl.current) return;
    engine.mount(canvasEl.current, page.width, page.height);
    engine.setGuideRenderer(setGuides);
    const off = engine.on('history', () => commit('Edit'));

    // Clicking or tapping ANY empty part of the workspace — the page surface,
    // the cover surface, or the canvas background around the pages — when not
    // on an actual object deselects EVERYTHING (objects, groups, and the page
    // target itself). Nothing stays selected.
    const c = engine.canvas!;
    const onEmptyClick = (e: { target?: unknown }) => {
      if (e.target) return; // clicked an object — fabric handles that normally
      c.discardActiveObject();
      c.requestRenderAll();
      setPageDeselected(true);
    };
    c.on('mouse:down', onEmptyClick);

    // A generated puzzle is one unit everywhere (canvas + Layers). If the user
    // clicks a single member on the canvas, expand the selection to the whole
    // unit so it moves/scales as one and no cell can be picked out alone.
    const onSelectionCreated = () => {
      const active = c.getActiveObjects();
      if (active.length !== 1) return;
      const key = unitKeyOf(active[0] as FabricAny);
      if (!key) return;
      const members = c
        .getObjects()
        .filter((o) => unitKeyOf(o as FabricAny) === key && (o as FabricAny).selectable !== false);
      if (members.length > 1) {
        engine.selectByIds(members.map((o) => (o as FabricAny).id as string));
      }
    };
    c.on('selection:created', onSelectionCreated);

    // The store may already hold pages (new size chosen on the home screen,
    // a restored project, or an imported PDF) — paint them into the fresh canvas.
    (async () => {
      const s = useCanvasStore.getState();
      const active = s.pages.find((p) => p.id === s.activePageId) ?? s.pages[0];
      engine.setPageSize(active.width, active.height);
      if (active.data) await engine.loadJSON(active.data);
      engine.setBackground(active.background);
      engine.setZoom(useEditorUiStore.getState().zoom);
      commit('Document opened');
    })();
    return () => {
      c.off('mouse:down', onEmptyClick);
      c.off('selection:created', onSelectionCreated);
      off();
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -------------------------------------------------------------- page size
  useEffect(() => {
    if (!engine.canvas) return;
    engine.setPageSize(page.width, page.height);
    engine.setBackground(page.background);
    engine.setZoom(zoom);
  }, [page.width, page.height, page.background, zoom]);

  // --------------------------------------------------------- wheel zoom/pan
  useEffect(() => {
    // Attach to the viewport (present in both modes) so ctrl/cmd + wheel zooms
    // whether we're in Focus view or Continuous scroll view.
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom(useEditorUiStore.getState().zoom * (e.deltaY < 0 ? 1.08 : 0.92));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [setZoom]);

  // Track scroll/pan so the fixed rulers mirror the page position. Toggling the
  // bottom thumbnail strip must not switch the canvas into a different layout
  // mode or alter zoom/scroll position.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf = 0;
    const update = () => setScroll({ left: el.scrollLeft, top: el.scrollTop });
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', onScroll);
    };
  }, []);

  // -------------------------------------------------------------- drop file
  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;

    const assetSrc = e.dataTransfer.getData('application/x-novelka-asset');
    if (assetSrc) {
      try {
        setStatus('busy', 'Placing asset…');
        if (assetSrc.endsWith('.svg'))
          await engine.addSVGFromURL(assetSrc, { left: x, top: y });
        else await engine.addImageFromURL(assetSrc, { left: x, top: y });
        setStatus('success', 'Asset added');
      } catch {
        setStatus('error', 'Could not place asset');
      }
      return;
    }

    const files = Array.from(e.dataTransfer.files ?? []);
    if (!files.length) return;
    for (const f of files) {
      if (!f.type.startsWith('image/')) {
        setStatus('error', `${f.name}: only images can be dropped in Phase 1`);
        continue;
      }
      setStatus('busy', `Importing ${f.name}…`);
      const url = await fileToDataURL(f);
      try {
        if (f.type === 'image/svg+xml') await engine.addSVGFromURL(url, { left: x, top: y });
        else await engine.addImageFromURL(url, { left: x, top: y });
        setStatus('success', `${f.name} imported`);
      } catch {
        setStatus('error', `Failed to import ${f.name}`);
      }
    }
  };

  const w = page.width * zoom;
  const h = page.height * zoom;

  const livePage = (
    <div
      ref={shellRef}
      className={`page-shell ${pageSelected ? 'page-selected' : ''} ${isCover ? 'cover-shell' : ''}`}
      style={{ width: w, height: h }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <canvas ref={canvasEl} />

      <div className="overlay-layer">
        {showGrid && (
          <svg width={w} height={h} style={{ position: 'absolute', inset: 0, opacity: 0.5 }}>
            <defs>
              <pattern
                id="grid-pat"
                width={gridSize * zoom}
                height={gridSize * zoom}
                patternUnits="userSpaceOnUse"
              >
                <path
                  d={`M ${gridSize * zoom} 0 L 0 0 0 ${gridSize * zoom}`}
                  fill="none"
                  stroke="#6366f1"
                  strokeWidth="0.6"
                  opacity="0.55"
                />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-pat)" />
          </svg>
        )}
        {/* Interior pages: one safe-area guide at a time — the KDP overlay
            draws the safe box, so the generic margin box only renders when
            KDP guides are off (never two overlapping outlines). */}
        {!isCover && showMargins && !showKdpGuides && <div className="margin-box" />}
        {!isCover && showKdpGuides && (
          <KdpGuides
            pageWidth={page.width}
            pageHeight={page.height}
            pageNumber={pageIndex + 1}
            pageCount={pages.length}
            zoom={zoom}
            showBleed={showBleed}
          />
        )}
        {/* Cover: phantom guideline overlay (bleed/trim/safe/spine/barcode) with
            magnetic-snap highlight. Pure DOM overlay, non-printing/exporting,
            toggleable via showCoverGuides. Nothing else is drawn on the cover. */}
        {isCover && showCoverGuides && coverGeom && (
          <CoverGuides
            pageWidth={page.width}
            pageHeight={page.height}
            zoom={zoom}
            geom={coverGeom}
            activeSnapV={guides.v}
            activeSnapH={guides.h}
          />
        )}
        {guides.v.map((v, i) => (
          <div key={`v${i}`} className="guide-v" style={{ left: v * zoom }} />
        ))}
        {guides.h.map((v, i) => (
          <div key={`h${i}`} className="guide-h" style={{ top: v * zoom }} />
        ))}
      </div>

      {selection.count > 0 && <QuickActionBox />}

      {dragOver && <div className="dropzone-hint">Drop image or asset here</div>}
    </div>
  );

  return (
    <div className="canvas-viewport" ref={viewportRef}>
      {overlay}
      {/* The live editable canvas always lives here, in one stable, always-
          mounted position. Mode A (drawer open) shows only it, centered; Mode B
          (drawer closed) renders crisp previews of the other pages below it in
          the same scrollable column. Because livePage never changes its spot in
          the tree, the Fabric canvas is never remounted — so it never goes
          blank or blurry. */}
      <div className="stage-wrap" ref={scrollRef}>
        {/* Clicking the workspace background around the pages (not an object
            and not the page sheet) clears the object selection too. */}
        <div
          className="stage-scroll"
          onMouseDown={(e) => {
            const t = e.target as HTMLElement;
            if (t.closest('.page-shell') || t.closest('.floating-canvas-bar')) return;
            engine.canvas?.discardActiveObject();
            engine.canvas?.requestRenderAll();
            setPageDeselected(true);
          }}
        >
          {livePage}
        </div>
      </div>

      {/* Fixed viewport rulers — always on in the editor. */}
      {showRulers && <RulerH width={page.width} zoom={zoom} scrollLeft={scroll.left} />}
      {showRulers && <RulerV height={page.height} zoom={zoom} scrollTop={scroll.top} />}

      {/* Floating "Exit fullscreen" button in the corner while fullscreen. */}
      {isFullscreen && (
        <button
          className="fullscreen-exit"
          onClick={() => void document.exitFullscreen()}
          title="Exit fullscreen"
          aria-label="Exit fullscreen"
        >
          <Icon name="zoomOut" size={16} /> Exit fullscreen
        </button>
      )}
    </div>
  );
}

/**
 * Small quick-action box shown near the selected object. It contains only the
 * high-frequency lifecycle actions; slower/secondary actions live under More.
 */
function QuickActionBox() {
  const selection = useSelection();
  const zoom = useEditorUiStore((s) => s.zoom);
  const [pos, setPos] = useState<{
    left: number;
    top: number;
    transform: string;
    menuUp: boolean;
  } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ left: number; top: number } | null>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRectRef = useRef<DOMRect | null>(null);
  const [hasClip, setHasClip] = useState(false);
  const [resizeTick, setResizeTick] = useState(0);

  // Keep the paste action in sync with the clipboard (copy via menu or via
  // keyboard shortcut).
  useEffect(() => {
    setHasClip(engine.hasClipboard());
    const t = setInterval(() => setHasClip(engine.hasClipboard()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setMenuOpen(false);
      setResizeTick((n) => n + 1);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (selection.count === 0) {
      setPos(null);
      return;
    }
    const active = engine.canvas?.getActiveObject();
    if (!active || typeof active.getBoundingRect !== 'function') return;
    const rect = active.getBoundingRect();
    const canvasRect = engine.canvas?.lowerCanvasEl.getBoundingClientRect();
    const gap = 10;
    const approxBarH = 42;
    const footerReserve = 68;
    const belowTop = (rect.top + rect.height) * zoom + gap;
    const aboveTop = rect.top * zoom - gap;
    const wouldOverflow = canvasRect
      ? canvasRect.top + belowTop + approxBarH > window.innerHeight - footerReserve
      : false;
    const cx = (rect.left + rect.width / 2) * zoom;
    setPos({
      left: cx,
      top: wouldOverflow ? aboveTop : belowTop,
      transform: wouldOverflow ? 'translate(-50%, -100%)' : 'translateX(-50%)',
      menuUp: wouldOverflow,
    });
  }, [selection.count, selection.version, selection.primary, zoom, resizeTick]);

  const isGroup = selection.isGroup;
  const showGroupAction = selection.isMultiple || isGroup;

  const openMoreMenu = () => {
    const trigger = moreRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    triggerRectRef.current = rect;
    const gap = 8;
    setMenuPos({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 176 - 8)),
      top: rect.bottom + gap,
    });
    setMenuOpen(true);
  };

  const closeMoreMenu = () => setMenuOpen(false);

  useLayoutEffect(() => {
    if (!menuOpen || !menuRef.current || !triggerRectRef.current) return;
    const gap = 8;
    const trigger = triggerRectRef.current;
    const menu = menuRef.current.getBoundingClientRect();
    const openUp = window.innerHeight - trigger.bottom < menu.height && trigger.top >= menu.height + gap;
    const unclampedLeft = trigger.right - menu.width;
    const left = Math.max(gap, Math.min(unclampedLeft, window.innerWidth - menu.width - gap));
    const preferredTop = openUp ? trigger.top - menu.height - gap : trigger.bottom + gap;
    const top = Math.max(gap, Math.min(preferredTop, window.innerHeight - menu.height - gap));
    setMenuPos((current) => {
      if (current && Math.abs(current.left - left) < 0.5 && Math.abs(current.top - top) < 0.5) {
        return current;
      }
      return { left, top };
    });
  }, [menuOpen, menuPos?.left, menuPos?.top]);

  const moreMenu = menuOpen && menuPos ? createPortal(
    <div
      ref={menuRef}
      className="quick-action-menu"
      role="menu"
      style={{
        position: 'fixed',
        left: menuPos.left,
        top: menuPos.top,
        right: 'auto',
        bottom: 'auto',
        width: 150,
        zIndex: 9999,
      }}
    >
      <div className="quick-menu-label">Transform</div>
      <button
        role="menuitem"
        onClick={() => {
          engine.flipHorizontal();
          closeMoreMenu();
        }}
      >
        <Icon name="flipHorizontal2" size={14} /> Flip horizontal
      </button>
      <button
        role="menuitem"
        onClick={() => {
          engine.flipVertical();
          closeMoreMenu();
        }}
      >
        <Icon name="flipVertical2" size={14} /> Flip vertical
      </button>
      <div className="quick-menu-sep" />
      <div className="quick-menu-label">Arrange</div>
      <button
        role="menuitem"
        onClick={() => {
          engine.bringToFront();
          closeMoreMenu();
        }}
      >
        <Icon name="front" size={14} /> To front
      </button>
      <button
        role="menuitem"
        onClick={() => {
          engine.bringForward();
          closeMoreMenu();
        }}
      >
        <Icon name="chevronUp" size={14} /> Forward
      </button>
      <button
        role="menuitem"
        onClick={() => {
          engine.sendBackwards();
          closeMoreMenu();
        }}
      >
        <Icon name="chevronDown" size={14} /> Backward
      </button>
      <button
        role="menuitem"
        onClick={() => {
          engine.sendToBack();
          closeMoreMenu();
        }}
      >
        <Icon name="back" size={14} /> To back
      </button>
      <div className="quick-menu-sep" />
      <div className="quick-menu-label">Utility</div>
      <button
        role="menuitem"
        onClick={() => {
          toggleSelectionLock();
          closeMoreMenu();
        }}
      >
        <Icon name={selection.primary?.locked ? 'lock' : 'unlock'} size={14} />
        {selection.primary?.locked ? 'Unlock' : 'Lock'}
      </button>
      <button
        role="menuitem"
        onClick={() => {
          void engine.copy();
          closeMoreMenu();
        }}
      >
        <Icon name="copy" size={14} /> Copy
      </button>
      <button
        role="menuitem"
        onClick={() => {
          void useCanvasStore.getState().applySelectionToAllPages();
          closeMoreMenu();
        }}
      >
        <Icon name="bookOpen" size={14} /> Apply to All Pages
      </button>
      {hasClip && (
        <button
          role="menuitem"
          onClick={() => {
            void engine.paste();
            closeMoreMenu();
          }}
        >
          <Icon name="paste" size={14} /> Paste
        </button>
      )}
    </div>,
    document.body,
  ) : null;

  if (!pos) return null;

  return (
    <div
      className="quick-action-box"
      style={{ left: pos.left, top: pos.top, transform: pos.transform }}
      role="group"
      aria-label="Quick actions"
    >
      <button
        className="quick-action-btn"
        onClick={() => engine.rotateSelection(90)}
        title="Rotate 90°"
        aria-label="Rotate 90°"
      >
        <Icon name="rotateCw" size={15} />
      </button>
      {showGroupAction && (
        <button
          className="quick-action-btn quick-action-label"
          onClick={() => (isGroup ? engine.ungroup() : engine.group())}
          title={isGroup ? 'Ungroup (Ctrl+Shift+G)' : 'Group (Ctrl+G)'}
        >
          <Icon name={isGroup ? 'ungroup' : 'group'} size={15} />
          {isGroup ? 'Ungroup' : 'Group'}
        </button>
      )}
      <button
        className="quick-action-btn"
        onClick={() => void engine.duplicate()}
        title="Duplicate (Ctrl+D)"
        aria-label="Duplicate (Ctrl+D)"
      >
        <Icon name="clone" size={15} />
      </button>
      <button
        className="quick-action-btn danger"
        onClick={() => engine.deleteSelection()}
        title="Delete"
        aria-label="Delete"
      >
        <Icon name="trash2" size={15} />
      </button>
      <div className="quick-action-menu-wrap">
        <button
          ref={moreRef}
          className="quick-action-btn"
          onClick={() => (menuOpen ? closeMoreMenu() : openMoreMenu())}
          title="More actions"
          aria-label="More actions"
          aria-expanded={menuOpen}
        >
          <Icon name="moreHorizontal" size={15} />
        </button>
        {moreMenu}
      </div>
    </div>
  );
}

/**
 * KDP safe-area overlay. The gutter sits on the left for right-hand (odd)
 * pages and flips for even pages, exactly as a bound book does. Content
 * outside the green box risks being trimmed or swallowed by the spine.
 */
function KdpGuides({
  pageWidth,
  pageHeight,
  pageNumber,
  pageCount,
  zoom,
  showBleed,
}: {
  pageWidth: number;
  pageHeight: number;
  pageNumber: number;
  pageCount: number;
  zoom: number;
  showBleed: boolean;
}) {
  const m = kdpMarginsFor(pageCount);
  const safe = safeAreaFor(pageWidth, pageHeight, pageNumber, m);
  const ok = isKdpTrim(pageWidth, pageHeight);

  return (
    <>
      <div
        className="kdp-safe"
        style={{
          left: safe.left * zoom,
          top: safe.top * zoom,
          width: safe.width * zoom,
          height: safe.height * zoom,
        }}
      />
      <div
        className={`kdp-gutter ${safe.isRecto ? 'left' : 'right'}`}
        style={{
          width: m.gutter * zoom,
          [safe.isRecto ? 'left' : 'right']: 0,
        }}
      />
      {showBleed && (
        <div
          className="kdp-bleed"
          style={{
            inset: 0,
            borderWidth: m.bleed * zoom,
          }}
        />
      )}
      <span className="kdp-tag">
        {safe.isRecto ? 'RIGHT PAGE' : 'LEFT PAGE'} · gutter {m.gutterInches}"
        {!ok && ' · non-standard trim'}
      </span>
    </>
  );
}

/** Fixed top ruler, anchored to the viewport top edge. Ticks are positioned
 *  using the page's zoom scale minus the current scroll offset, so they stay
 *  aligned with the page as you pan. */
function RulerH({
  width,
  zoom,
  scrollLeft,
}: {
  width: number;
  zoom: number;
  scrollLeft: number;
}) {
  const step = zoom < 0.5 ? 100 : zoom < 1.2 ? 50 : 25;
  const ticks: number[] = [];
  for (let x = 0; x <= width; x += step) ticks.push(x);
  return (
    <div className="ruler ruler-h">
      {ticks.map((t) => (
        <div key={t}>
          <div className="tick" style={{ left: t * zoom - scrollLeft }} />
          <div className="lbl" style={{ left: t * zoom - scrollLeft }}>
            {t}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Fixed left ruler, anchored to the viewport left edge. */
function RulerV({
  height,
  zoom,
  scrollTop,
}: {
  height: number;
  zoom: number;
  scrollTop: number;
}) {
  const step = zoom < 0.5 ? 100 : zoom < 1.2 ? 50 : 25;
  const ticks: number[] = [];
  for (let y = 0; y <= height; y += step) ticks.push(y);
  return (
    <div className="ruler ruler-v">
      {ticks.map((t) => (
        <div key={t}>
          <div className="tick" style={{ top: t * zoom - scrollTop }} />
          <div className="lbl" style={{ top: t * zoom - scrollTop }}>
            {t}
          </div>
        </div>
      ))}
    </div>
  );
}
