import { useEffect, useMemo, useRef, useState } from 'react';
import * as fabric from 'fabric';
import { useCanvasStore } from '../../stores/canvas-store';
import { useEditorUiStore } from '../../stores/editor-ui-store';
import { coverSpecFor } from '../../services/book';
import { formatIn } from '../../services/kdp-cover';
import { Icon } from '../Icon';
import { matchKdpPageSize, trimBoxForPage } from '../../services/kdp';
import { wsMetaOf } from '../../modules/word-search/build-pages';
import { runComprehensivePreflight } from '../../domain/preflight';
import type { Page } from '../../types/canvas.types';

type View = 'single' | 'spread' | 'grid' | 'cover';

/**
 * Full-screen book preview. Renders pages offscreen to images so scrolling a
 * 200-page interior stays smooth, and shows them the way a printed book reads:
 * page 1 alone (the cover side), then true left/right spreads.
 *
 * ## Why it is fast
 *
 *  - **Windowed rendering**: only the pages near the current position are ever
 *    rasterised (single/spread), or only the cells actually on screen (grid,
 *    via IntersectionObserver). A 200-page book no longer means 200 fabric
 *    canvases on open — that was the lag.
 *  - **Debounced zoom**: dragging the zoom slider re-renders 250 ms after you
 *    pause, and only the visible pages. The old image stays on screen while
 *    you drag (slightly soft for a moment, sharp once the re-render lands).
 *  - **One reusable canvas**: a single offscreen StaticCanvas is reused for
 *    every page instead of allocating a new one per page.
 *  - **Bounded cache**: rendered images are kept per page (any zoom level) so
 *    turning back to a page is instant; old zoom buckets are pruned so memory
 *    cannot balloon.
 *
 * ## Why it is sharp
 *
 * Every page image is rendered at exactly the physical resolution it will be
 * displayed at — display CSS size × devicePixelRatio. Slight overshoot is fine
 * (downscaling stays sharp); undershoot is not.
 */
export function PreviewMode({
  onClose,
  initialView,
  onOpenExport,
}: {
  onClose: () => void;
  initialView?: View;
  onOpenExport?: () => void;
}) {
  const { pages, activePageId, gotoPage, book } = useCanvasStore();
  const [view, setView] = useState<View>(initialView ?? 'spread');
  const [index, setIndex] = useState(() =>
    Math.max(0, pages.findIndex((p) => p.id === activePageId)),
  );

  const coverIdx = pages.findIndex((p) => p.role === 'cover');
  const coverPage = coverIdx >= 0 ? pages[coverIdx] : null;
  const interiorTotal = pages.length - (coverPage ? 1 : 0);
  const coverSpecLive = coverSpecFor(book, interiorTotal);

  /** The cover view pins the window to the cover page. */
  const openCoverView = () => {
    if (coverIdx >= 0) setIndex(coverIdx);
    setView('cover');
  };
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(1);
  const [resizeBump, setResizeBump] = useState(0);
  /** bumped 250 ms after the zoom slider settles, so dragging stays cheap */
  const [renderTick, setRenderTick] = useState(0);
  /** grid view: which page indices are actually on screen */
  const [visibleIdx, setVisibleIdx] = useState<Set<number>>(() => new Set());
  const shellRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const cellsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const zoomRef = useRef(zoom);
  const viewRef = useRef(view);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { viewRef.current = view; }, [view]);

  /** Preflight verification */
  const preflightResult = useMemo(
    () => runComprehensivePreflight(pages, { exportPreset: 'interior' }),
    [pages],
  );

  /** page id -> the newest cached key for that page */
  const latestKey = useRef<Record<string, string>>({});
  /** ids currently inside the render window (used for cache pruning) */
  const windowIds = useRef<Set<string>>(new Set());
  /** LRU order of cache keys (used for eviction) */
  const orderRef = useRef<string[]>([]);
  /** page id -> the page.data reference the cache was built from */
  const dataRef = useRef<Record<string, unknown>>({});
  /** page id -> revision counter (bumped when page.data changes) */
  const revRef = useRef<Record<string, number>>({});
  /**
   * page id -> highest scale this page has been rendered at (current view).
   * Zooming out never re-renders (the cached image is sharp enough and CSS
   * downscales it); zooming in re-renders only when the needed scale
   * exceeds this.
   */
  const bestScale = useRef<Record<string, number>>({});

  // A different view needs different resolutions — start fresh so grid does
  // not keep big spread images and vice versa.
  useEffect(() => {
    bestScale.current = {};
  }, [view]);

  // ---------------------------------------------------------- render pages
  useEffect(() => {
    let cancelled = false;
    const dpr = Math.max(1, window.devicePixelRatio || 1);

    // Data change detection: a new page.data reference invalidates the
    // per-page cache (revision bump + scale reset).
    for (const p of pages) {
      if (dataRef.current[p.id] !== p.data) {
        dataRef.current[p.id] = p.data;
        revRef.current[p.id] = (revRef.current[p.id] ?? 0) + 1;
        bestScale.current[p.id] = 0;
      }
    }

    // Which pages to render, most important first.
    const order: number[] = [];
    if (viewRef.current === 'grid') {
      order.push(...[...visibleIdx].sort((a, b) => Math.abs(a - index) - Math.abs(b - index)));
    } else {
      const WINDOW = 6;
      const start = Math.max(0, index - WINDOW);
      const end = Math.min(pages.length, index + WINDOW + 1);
      // Interleave outward from the current page: index, index-1, index+1, …
      const seen = new Set<number>();
      for (let d = 0; d <= WINDOW; d++) {
        if (index - d >= start) seen.add(index - d);
        if (d > 0 && index + d < end) seen.add(index + d);
      }
      order.push(...seen);
    }

    windowIds.current = new Set(order.map((i) => pages[i]?.id).filter(Boolean));

    (async () => {
      // Pages render serially through the shared canvas. With the parsed
      // cache, each page is rasterise-only after its first render.
      const pending: Record<string, string> = {};
      for (const i of order) {
        if (cancelled) return;
        const page = pages[i];
        if (!page) continue;
        const needed = targetScale(viewRef.current, page, i + 1, zoomRef.current, dpr);
        // Already rendered at or above this scale? Skip — the cached image
        // is shown via CSS scale, so zooming OUT is instant and sharp, and
        // zooming IN stays sharp (2x supersampled) until the upgrade render
        // lands.
        if (bestScale.current[page.id] >= needed) continue;
        const rev = revRef.current[page.id] ?? 0;
        const viewChar = viewRef.current === 'grid' ? 'g' : 'v';
        const key = `${page.id}|${viewChar}${rev}|s${Math.round(needed * 2) / 2}`;
        const url = await renderPage(page, i + 1, needed);
        if (cancelled) return;
        bestScale.current[page.id] = needed;
        latestKey.current[page.id] = key;
        pending[key] = url;
        // Flush once per frame so a burst of page renders does not trigger a
        // React re-render per page.
        scheduleFlush(pending, (batch) =>
          setThumbs((s) =>
            mergeThumbs(s, batch, windowIds.current, latestKey.current, orderRef.current),
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, view, index, renderTick, resizeBump, visibleIdx]);

  // Re-render when the window is resized (or the preview goes fullscreen) so
  // the images always match the display, debounced so a drag-resize does not
  // thrash the offscreen renderer.
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const onResize = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => setResizeBump((n) => n + 1), 300);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      if (t) clearTimeout(t);
    };
  }, []);

  // Debounce zoom: while the slider is being dragged, keep showing the old
  // images; 250 ms after it settles, re-render the visible pages sharp.
  useEffect(() => {
    const t = setTimeout(() => setRenderTick((n) => n + 1), 250);
    return () => clearTimeout(t);
  }, [zoom]);

  // Grid view: watch which cells are actually on screen.
  useEffect(() => {
    if (view !== 'grid') return;
    const body = bodyRef.current;
    if (!body) return;
    const visible = new Set<number>();
    const obs = new IntersectionObserver(
      (entries) => {
        let changed = false;
        for (const en of entries) {
          if (en.isIntersecting) {
            const idx = Number((en.target as HTMLElement).dataset.idx);
            if (!visible.has(idx)) { visible.add(idx); changed = true; }
          }
        }
        if (changed) {
          // Keep the set bounded to a sliding window: pages scrolled far past
          // never re-render on zoom/resize (they re-enter via the observer
          // when scrolled back to).
          const sorted = [...visible].sort((a, b) => a - b);
          const WINDOW = 60;
          const bounded = sorted.length > WINDOW ? new Set(sorted.slice(-WINDOW)) : visible;
          setVisibleIdx(new Set(bounded));
        }
      },
      { root: body, rootMargin: '200px', threshold: 0.01 },
    );
    cellsRef.current.forEach((el, i) => {
      if (el) {
        el.dataset.idx = String(i);
        obs.observe(el);
      }
    });
    return () => obs.disconnect();
  }, [view, pages]);

  // ------------------------------------------------------------- keyboard
  useEffect(() => {
    const step = view === 'spread' ? 2 : 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        setIndex((i) => Math.min(pages.length - 1, i + step));
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        setIndex((i) => Math.max(0, i - step));
      } else if (e.key === 'Home') {
        setIndex(0);
      } else if (e.key === 'End') {
        setIndex(pages.length - 1);
      } else if (e.key === '1') setView('single');
      else if (e.key === '2') setView('spread');
      else if (e.key === '3') setView('grid');
      else if ((e.key === '4' || e.key.toLowerCase() === 'c') && coverIdx >= 0) {
        setIndex(coverIdx);
        setView('cover');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pages.length, view, onClose, coverIdx]);

  // real browser fullscreen
  const goFullscreen = async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {
      /* browser may refuse without a gesture */
    }
  };

  // ------------------------------------------------------------ cleanup
  useEffect(() => () => { disposePreviewRenderer(); }, []);

  /** Spread pairing: page 1 stands alone, then (2,3), (4,5)… like a real book. */
  const spread = useMemo(() => {
    if (index === 0) return [pages[0]].filter(Boolean);
    const left = index % 2 === 0 ? index - 1 : index;
    return [pages[left], pages[left + 1]].filter(Boolean);
  }, [index, pages]);

  const openInEditor = async (p: Page) => {
    await gotoPage(p.id);
    onClose();
  };

  /** The cached image for a page — its highest rendered scale wins. */
  const imgFor = (pageId: string): string | undefined => {
    const k = latestKey.current[pageId];
    return k ? thumbs[k] : undefined;
  };

  const pageNumberFor = (p: Page) => pages.indexOf(p) + 1;
  const displaySize = (p: Page): { width: number; height: number } => {
    const match = matchKdpPageSize(p.width, p.height, { bleed: 'auto' });
    if (match?.bleed === 'bleed') {
      const t = trimBoxForPage(p.width, p.height, pageNumberFor(p), true);
      return { width: t.width, height: t.height };
    }
    return { width: p.width, height: p.height };
  };

  const pageRoleLabel = (p: Page) => {
    if (p.role === 'cover') return 'Wraparound Cover';
    const meta = wsMetaOf(p);
    const num = pageNumberFor(p);
    const side = num % 2 === 1 ? 'Recto (Left Spine)' : 'Verso (Right Spine)';
    if (meta?.kind === 'solution') return `Answers · ${side}`;
    if (meta?.kind === 'puzzle') return `Puzzle Page · ${side}`;
    return `Page ${num} · ${side}`;
  };

  return (
    <div className="preview-shell" ref={shellRef} role="dialog" aria-modal="true" aria-label="Book Preview">
      <header className="preview-bar">
        <button className="btn sm" onClick={onClose} title="Close Preview (Esc)" aria-label="Close Preview (Esc)">
          <Icon name="close" size={14} /> Close
        </button>
        <div className="divider" />

        <div className="chips" role="tablist" aria-label="Preview Modes">
          {(['single', 'spread', 'grid'] as View[]).map((v, i) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              className={`chip ${view === v ? 'active' : ''}`}
              onClick={() => setView(v)}
              title={`${v === 'single' ? 'One page' : v === 'spread' ? 'Two-page spread' : 'All pages'} (${i + 1})`}
            >
              {v === 'single' ? 'One page' : v === 'spread' ? 'Two-page spread' : 'All pages'}
            </button>
          ))}
          {coverPage && (
            <button
              role="tab"
              aria-selected={view === 'cover'}
              className={`chip ${view === 'cover' ? 'active' : ''}`}
              onClick={openCoverView}
              title="Flat cover — back, spine, front + bleed (4 / C)"
            >
              Cover
            </button>
          )}
        </div>

        <div className="divider" />

        {/* Preflight status — a small chip only. Full diagnostics live in the
            right-side KDP Check panel; clicking the chip takes you there. */}
        <button
          className={`chip ${preflightResult.status === 'pass' ? 'active' : ''}`}
          style={{
            background:
              preflightResult.status === 'pass'
                ? '#16a34a'
                : preflightResult.status === 'warnings'
                  ? '#d97706'
                  : '#dc2626',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: 12,
          }}
          onClick={() => {
            useEditorUiStore.getState().setRightDock('kdp');
            onClose();
          }}
          title="Open KDP Check in the side panel"
          aria-label="Preflight status — open KDP Check"
        >
          {preflightResult.status === 'pass'
            ? '✓ Preflight Passed'
            : preflightResult.status === 'warnings'
              ? `⚠ ${preflightResult.warnings.length} warning${preflightResult.warnings.length === 1 ? '' : 's'}`
              : `⛔ ${preflightResult.errors.length} blocking issue${preflightResult.errors.length === 1 ? '' : 's'}`}
        </button>

        <div className="spacer" />

        {view !== 'grid' && (
          <>
            <button
              className="btn icon"
              onClick={() => setIndex((i) => Math.max(0, i - (view === 'spread' ? 2 : 1)))}
              disabled={index === 0}
              title="Previous (←)"
              aria-label="Previous (←)"
            >
              <Icon name="chevronDown" size={15} />
            </button>
            <span className="preview-count" aria-live="polite">
              {index + 1} / {pages.length}
            </span>
            <button
              className="btn icon"
              onClick={() =>
                setIndex((i) => Math.min(pages.length - 1, i + (view === 'spread' ? 2 : 1)))
              }
              disabled={index >= pages.length - 1}
              title="Next (→)"
              aria-label="Next (→)"
            >
              <Icon name="chevronUp" size={15} />
            </button>
            <div className="divider" />
            <input
              type="range"
              min={0.4}
              max={2.2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              style={{ width: 96 }}
              title="Zoom"
              aria-label="Zoom"
            />
          </>
        )}

        {onOpenExport && (
          <button
            className="btn primary sm"
            onClick={onOpenExport}
            disabled={preflightResult.status === 'blocked'}
            title={preflightResult.status === 'blocked' ? 'Resolve preflight blockers before export' : 'Export PDF'}
          >
            <Icon name="download" size={14} /> Export PDF
          </button>
        )}

        <button className="btn sm" onClick={goFullscreen} title="Browser fullscreen (F11)" aria-label="Browser fullscreen (F11)">
          <Icon name="fit" size={14} /> Fullscreen
        </button>
      </header>

      {/* Diagnostics deliberately have ONE home: the right-side KDP Check
          panel. No inline banner here — the status chip above links to it. */}

      <div className="preview-body" ref={bodyRef}>
        {view === 'cover' && coverPage ? (
          (() => {
            // Flat-cover verification view: back + spine + front with the
            // fold/bleed guides drawn over the real render, so spine width
            // can be checked before export. Geometry derives from the book
            // settings (kdp-cover.ts) applied to the actual cover page.
            const W = coverPage.width;
            const H = coverPage.height;
            const bleed = coverSpecLive.bleed;
            const wrap = W - 2 * book.trimWidth - 2 * bleed - coverSpecLive.spine > 1
              ? (W - 2 * book.trimWidth - 2 * bleed - coverSpecLive.spine) / 2
              : 0;
            const x0 = bleed + wrap;
            const spineL = x0 + book.trimWidth;
            const spineW = Math.max(0, W - 2 * book.trimWidth - 2 * x0);
            const spineR = spineL + spineW;
            const pct = (v: number, total: number) => `${(v / total) * 100}%`;
            return (
              <div className="preview-stage single">
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <div
                    className="preview-cover-wrap"
                    style={{ height: `${68 * zoom}vh`, aspectRatio: `${W} / ${H}` }}
                  >
                    <div
                      className="sheet big"
                      style={{ aspectRatio: `${W} / ${H}`, height: '100%', background: coverPage.background ?? '#fff' }}
                    >
                      {imgFor(coverPage.id) ? <img src={imgFor(coverPage.id)} alt="" /> : <span className="shimmer" />}
                    </div>
                    <div className="preview-cover-overlay" aria-hidden>
                      {/* bleed frame */}
                      <div
                        className="pc-bleed"
                        style={{
                          left: pct(bleed, W), top: pct(bleed, H),
                          width: pct(W - bleed * 2, W), height: pct(H - bleed * 2, H),
                        }}
                      />
                      {/* spine folds */}
                      <div className="pc-line" style={{ left: pct(spineL, W) }} />
                      <div className="pc-line" style={{ left: pct(spineR, W) }} />
                      <span className="pc-tag" style={{ left: pct(x0 + book.trimWidth / 2, W) }}>Back</span>
                      <span className="pc-tag" style={{ left: pct(spineL + spineW / 2, W) }}>Spine</span>
                      <span className="pc-tag" style={{ left: pct(spineR + book.trimWidth / 2, W) }}>Front</span>
                      <span className="pc-tag spine" style={{ left: pct(spineL + spineW / 2, W) }}>
                        {formatIn(coverSpecLive.spine)}{coverSpecLive.spineTextAllowed ? '' : ' · no text'}
                      </span>
                    </div>
                  </div>
                  <span className="hint">
                    Flat cover {formatIn(W, 2)} × {formatIn(H, 2)} · spine {formatIn(coverSpecLive.spine)} ·{' '}
                    {coverSpecLive.spineTextAllowed
                      ? 'spine text allowed'
                      : `spine text needs more than 79 pages (${interiorTotal} now)`}
                  </span>
                </div>
              </div>
            );
          })()
        ) : view === 'grid' ? (
          <div className="preview-grid">
            {pages.map((p, i) => {
              const ds = displaySize(p);
              const isCover = p.role === 'cover';
              return (
                <button
                  key={p.id}
                  ref={(el) => { cellsRef.current[i] = el; }}
                  className={`preview-cell ${p.id === activePageId ? 'active' : ''}`}
                  onClick={() => openInEditor(p)}
                  title={`Open page ${i + 1} (${p.name}) in the editor`}
                >
                  <div
                    className="sheet"
                    style={{ aspectRatio: `${ds.width} / ${ds.height}`, background: p.background ?? '#fff' }}
                  >
                    {imgFor(p.id) ? <img src={imgFor(p.id)} alt="" /> : <span className="shimmer" />}
                  </div>
                  <span className="n">
                    {isCover ? 'Cover' : i + 1}
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className={`preview-stage ${view}`}>
            {(view === 'single' ? [pages[index]] : spread).filter(Boolean).map((p) => {
              const ds = displaySize(p);
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <div
                    className="sheet big"
                    style={{
                      aspectRatio: `${ds.width} / ${ds.height}`,
                      height: `${68 * zoom}vh`,
                      background: p.background ?? '#fff',
                      boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
                    }}
                    onDoubleClick={() => openInEditor(p)}
                    title="Double-click to edit this page"
                    aria-label={`Page ${pageNumberFor(p)}: Double-click to edit`}
                  >
                    {imgFor(p.id) ? <img src={imgFor(p.id)} alt="" /> : <span className="shimmer" />}
                  </div>
                  <span
                    className="badge"
                    style={{
                      background: 'var(--bg-2, #1e293b)',
                      color: 'var(--text-1, #f8fafc)',
                      border: '1px solid var(--line, #334155)',
                      fontSize: 11.5,
                      padding: '3px 10px',
                    }}
                  >
                    {pageRoleLabel(p)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <footer className="preview-foot">
        <span className="hint">
          <span className="kbd">←</span> <span className="kbd">→</span> turn pages ·{' '}
          <span className="kbd">1</span> (single) / <span className="kbd">2</span> (spread) /{' '}
          <span className="kbd">3</span> (grid) / <span className="kbd">C</span> (cover) ·
          double-click a page to edit it · <span className="kbd">Esc</span> to close
        </span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------- rendering

/**
 * One shared offscreen canvas, reused for every page render, plus a cache of
 * *parsed* page objects.
 *
 * Why the parsed cache matters: the expensive part of a preview render is
 * `loadFromJSON` (JSON.parse + fabric object construction). Zoom changes and
 * page turns used to re-parse the same pages every time — that was the lag.
 * Now a page is parsed once and its objects are re-attached for each render,
 * so a zoom re-render is just rasterisation (~30-80 ms per page instead of
 * 200+). Fabric's add/remove semantics make this safe: removing an object
 * clears its canvas reference, adding re-attaches it.
 *
 * Images are PNG (lossless). JPEG at 0.85 was visibly smearing text glyphs —
 * that was the "still blurry" complaint.
 */
let sharedCanvas: fabric.StaticCanvas | null = null;
const parseCache = new Map<string, { ref: unknown; objects: fabric.Object[] }>();
const PARSE_CACHE_MAX = 24;

/** Renders are serialised: the shared canvas can only be used by one at a time. */
let renderChain: Promise<unknown> = Promise.resolve();

function disposePreviewRenderer() {
  renderChain = renderChain.then(() => {
    sharedCanvas?.dispose();
    sharedCanvas = null;
    parseCache.clear();
  });
}

/** Parse a page once (cached, invalidated when its data reference changes). */
async function getPageObjects(page: Page): Promise<fabric.Object[]> {
  const hit = parseCache.get(page.id);
  if (hit && hit.ref === page.data) return hit.objects;
  const fabricNs = await import('fabric');
  const el = document.createElement('canvas');
  const c = new fabricNs.StaticCanvas(el, {
    width: page.width,
    height: page.height,
    backgroundColor: page.background ?? '#ffffff',
  });
  if (page.data) {
    try {
      await c.loadFromJSON(page.data);
    } catch {
      /* skip unreadable pages */
    }
  }
  // Belt and braces: never inherit a saved viewport (zoom/pan) into renders.
  c.setViewportTransform([1, 0, 0, 1, 0, 0]);
  const objects = c.getObjects();
  c.dispose();
  parseCache.set(page.id, { ref: page.data, objects });
  if (parseCache.size > PARSE_CACHE_MAX) {
    const first = parseCache.keys().next().value;
    if (first !== undefined) parseCache.delete(first);
  }
  return objects;
}

/**
 * Offscreen render of a stored page into the shared canvas.
 * Sequential use only — queued behind any render already in flight.
 */
function renderPage(page: Page, pageNumber: number, scale: number): Promise<string> {
  const run = renderChain.then(() => doRender(page, pageNumber, scale));
  renderChain = run.catch(() => undefined);
  return run;
}

async function doRender(page: Page, pageNumber: number, scale: number): Promise<string> {
  const fabricNs = await import('fabric');
  // Print-trim view: when the page is a KDP bleed submission, render ONLY the
  // final trim rectangle (bleed edges cropped away) — the reader sees exactly
  // what Amazon prints. The objects are kept in full-page coordinates and the
  // viewport is translated so the trim window fills the raster.
  const sizeMatch = matchKdpPageSize(page.width, page.height, { bleed: 'auto' });
  const trim = sizeMatch?.bleed === 'bleed'
    ? trimBoxForPage(page.width, page.height, pageNumber, true)
    : null;
  const renderW = trim ? trim.width : page.width;
  const renderH = trim ? trim.height : page.height;

  if (!sharedCanvas) {
    const el = document.createElement('canvas');
    sharedCanvas = new fabricNs.StaticCanvas(el, {
      width: renderW,
      height: renderH,
      backgroundColor: page.background ?? '#ffffff',
    });
  }
  const objects = await getPageObjects(page);
  const c = sharedCanvas;
  c.setDimensions({ width: renderW, height: renderH });
  c.backgroundColor = page.background ?? '#ffffff';
  const prevRenderOnAdd = c.renderOnAddRemove;
  c.renderOnAddRemove = false;
  c.clear();
  c.add(...objects);
  c.renderOnAddRemove = prevRenderOnAdd;
  c.setViewportTransform([1, 0, 0, 1, 0, 0]);
  if (trim) c.setViewportTransform([1, 0, 0, 1, -trim.left, -trim.top]);
  // toDataURL renders straight into the target canvas — no pre-render pass.
  const url = c.toDataURL({
    format: 'png',
    multiplier: scale,
    enableRetinaScaling: false,
  });
  return url;
}

/**
 * How big (CSS px) a page's long edge will be on screen in the current view.
 * The preview stage pins the sheet height to 68vh × the zoom slider; grid
 * cells are ~18vh tall. Estimates are generous on purpose — the image is
 * allowed to be slightly larger than the display (downscaling is sharp).
 */
function displayLongEdge(view: View, zoom: number): number {
  if (view === 'grid') return Math.max(150, window.innerHeight * 0.18);
  return window.innerHeight * 0.68 * zoom;
}

/**
 * The multiplier that renders a page at physical display resolution:
 * display size in CSS px × devicePixelRatio, divided by the page's display
 * size (trim size for KDP bleed pages — bleed edges are cropped, so they must
 * not inflate the resolution budget).
 * Clamped so huge pages or tiny pages cannot produce absurd canvases.
 */
function targetScale(
  view: View,
  page: Page,
  pageNumber: number,
  zoom: number,
  dpr: number,
): number {
  const match = matchKdpPageSize(page.width, page.height, { bleed: 'auto' });
  const longEdge = match?.bleed === 'bleed'
    ? (() => {
        const t = trimBoxForPage(page.width, page.height, pageNumber, true);
        return Math.max(t.width, t.height);
      })()
    : Math.max(page.width, page.height);
  const cssLong = displayLongEdge(view, zoom);
  const scale = (cssLong * dpr) / longEdge;
  // 2x supersample: the image is rendered at twice the needed resolution so
  // it stays sharp while zooming in and when the browser downscales it.
  const withSs = scale * 2;
  return Math.min(view === 'grid' ? 3 : 4, Math.max(0.5, Math.round(withSs * 100) / 100));
}

// ------------------------------------------------------------ cache helpers

/** Batch several rendered pages into one state update per animation frame. */
let flushRaf = 0;
let flushBatch: Record<string, string> = {};
let flushApply: ((batch: Record<string, string>) => void) | null = null;

function scheduleFlush(pending: Record<string, string>, apply: (b: Record<string, string>) => void) {
  Object.assign(flushBatch, pending);
  for (const k of Object.keys(pending)) delete pending[k];
  flushApply = apply;
  if (flushRaf) return;
  flushRaf = requestAnimationFrame(() => {
    flushRaf = 0;
    const batch = flushBatch;
    flushBatch = {};
    flushApply?.(batch);
  });
}

/**
 * Merge a batch into the cache.
 *
 * Rule: **one render per page** — a new zoom bucket replaces the page's old
 * image instead of accumulating. That alone bounds memory to the page count
 * (and only ~13 pages are ever rendered outside grid view). As a safety net,
 * the LRU cap evicts the oldest renders, never the newest render of a page
 * that is currently on screen.
 */
function mergeThumbs(
  prev: Record<string, string>,
  batch: Record<string, string>,
  windowIds: Set<string>,
  latest: Record<string, string>,
  order: string[],
): Record<string, string> {
  const next = { ...prev };
  for (const [k, v] of Object.entries(batch)) {
    // One image per page: a re-render replaces the page's previous image
    // (any view/rev) instead of accumulating.
    const prefix = `${k.split('|')[0]}|`;
    for (const old of Object.keys(next)) {
      if (old.startsWith(prefix)) delete next[old];
    }
    next[k] = v;
  }
  for (const k of Object.keys(batch)) {
    const i = order.indexOf(k);
    if (i !== -1) order.splice(i, 1);
    order.push(k);
  }
  const isGrid = Object.keys(batch).some((k) => k.includes('|g'));
  const cap = isGrid ? 140 : 18;
  if (Object.keys(next).length <= cap) return next;
  for (const k of [...order]) {
    if (Object.keys(next).length <= cap - 4) break;
    const pageId = k.split('|')[0];
    if (windowIds.has(pageId) && latest[pageId] === k) continue;
    delete next[k];
  }
  return next;
}
