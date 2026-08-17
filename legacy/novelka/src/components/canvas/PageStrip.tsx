import { useEffect, useRef, useState } from 'react';
import { useCanvasStore } from '../../stores/canvas-store';
import { useEditorUiStore } from '../../stores/editor-ui-store';
import { engine } from '../../engine/canvas-engine';
import { renderPageImage } from '../../engine/page-thumbnails';
import { Icon } from '../Icon';

/**
 * Canva-style page filmstrip pinned to the bottom of the editor.
 * Collapsible, drag-to-reorder, live thumbnail of the active page.
 */
export function PageStrip({ onBulkAdd }: { onBulkAdd?: () => void }) {
  const {
    pages,
    activePageId,
    gotoPage,
    addPage,
    duplicatePage,
    deletePage,
    movePage,
  } = useCanvasStore();
  const pageStripOpen = useEditorUiStore((s) => s.pageStripOpen);

  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [dragPageId, setDragPageId] = useState<string | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // live-refresh the thumbnail of whichever page is on screen — IMMEDIATELY on
  // page/content change (engine events, rAF-throttled), no slow poll. Always
  // capture onto an OPAQUE WHITE ground — a page with no background is stored
  // as "transparent", which JPEG would otherwise encode as black.
  const activePageData = pages.find((p) => p.id === activePageId)?.data;
  useEffect(() => {
    const snap = () => {
      const c = engine.canvas as unknown as { backgroundColor?: unknown; requestRenderAll?: () => void } | null;
      if (!c) return;
      try {
        const page = useCanvasStore.getState().pages.find((p) => p.id === activePageId);
        const prev = c.backgroundColor;
        c.backgroundColor = page?.background ?? '#ffffff';
        c.requestRenderAll?.();
        const url = engine.canvas!.toDataURL({
          format: 'jpeg',
          quality: 0.55,
          multiplier: Math.min(1, 150 / Math.max(1, engine.pageWidth)),
          enableRetinaScaling: false,
        });
        c.backgroundColor = prev;
        c.requestRenderAll?.();
        setThumbs((s) => (s[activePageId] === url ? s : { ...s, [activePageId]: url }));
      } catch {
        /* canvas mid-teardown */
      }
    };
    snap();
    let raf = 0;
    const throttled = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        snap();
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

  // Render thumbnails lazily: only the cards near the scroll position, one at
  // a time. A 200-page book used to render ALL pages on every update (and the
  // effect re-ran whenever a thumbnail changed) — that blocked the main
  // thread for seconds. Now scrolling the strip renders a handful per frame.
  const stripRef = useRef<HTMLDivElement>(null);
  /** pageId -> the data reference it was rendered from; re-renders on edits */
  const renderedRef = useRef<Map<string, unknown>>(new Map());
  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    const renderVisible = async () => {
      const strip = stripRef.current;
      if (!strip) return;
      const first = strip.querySelector('.page-card');
      // card width + gap; measured once so the window is right on any screen
      const cardW = first ? first.getBoundingClientRect().width + 8 : 80;
      const start = Math.max(0, Math.floor(strip.scrollLeft / cardW) - 1);
      const end = Math.min(pages.length, Math.ceil((strip.scrollLeft + strip.clientWidth) / cardW) + 1);
      if (start >= end) return;
      for (let i = start; i < end; i++) {
        if (cancelled) return;
        const page = pages[i];
        if (!page?.data) continue;
        // Already rendered from this exact data? Keep the cached thumbnail.
        // (Edits produce a new data reference, so changed pages re-render.)
        if (page.id === activePageId || renderedRef.current.get(page.id) === page.data) continue;
        try {
          const url = await renderPageImage(
            page.data,
            page.background,
            page.width,
            page.height,
            Math.min(1, 150 / page.width),
            'jpeg',
            0.55,
          );
          if (cancelled) return;
          renderedRef.current.set(page.id, page.data);
          setThumbs((s) => (s[page.id] === url ? s : { ...s, [page.id]: url }));
        } catch {
          /* skip pages that fail to render */
        }
      }
    };
    void renderVisible();
    const strip = stripRef.current;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => void renderVisible());
    };
    strip?.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      strip?.removeEventListener('scroll', onScroll);
    };
  }, [pages, activePageId]);

  const onDrop = (i: number) => {
    if (dragPageId) {
      const from = pages.findIndex((p) => p.id === dragPageId);
      if (from >= 0 && from !== i) movePage(from, i);
    }
    setDragPageId(null);
    setOverIdx(null);
  };

  if (!pageStripOpen) return null;

  return (
    <div className="pagestrip">
        <div className="strip-scroll" ref={stripRef}>
        {pages.map((page, i) => {
          const active = page.id === activePageId;
          const cover = page.role === 'cover';
          // interior pages are numbered independently of the cover
          const label = cover
            ? 'Cover'
            : String(i + 1 - pages.slice(0, i + 1).filter((p) => p.role === 'cover').length);
          return (
            <div
              key={page.id}
              className={`page-card ${active ? 'active' : ''} ${overIdx === i ? 'dragover' : ''} ${cover ? 'is-cover' : ''}`}
              draggable
              onDragStart={() => setDragPageId(page.id)}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIdx(i);
              }}
              onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
              onDrop={() => onDrop(i)}
              onDragEnd={() => {
                setDragPageId(null);
                setOverIdx(null);
              }}
              tabIndex={0}
              role="button"
              onFocus={() => {
                document.body.dataset.pageFocused = page.id;
              }}
              onBlur={() => {
                if (document.body.dataset.pageFocused === page.id)
                  delete document.body.dataset.pageFocused;
              }}
              onMouseEnter={() => {
                document.body.dataset.pageFocused = page.id;
              }}
              onMouseLeave={() => {
                if (document.body.dataset.pageFocused === page.id)
                  delete document.body.dataset.pageFocused;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Delete' || e.key === 'Backspace') {
                  e.preventDefault();
                  e.stopPropagation();
                  void deletePage(page.id);
                } else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  void gotoPage(page.id);
                }
              }}
              onClick={() => gotoPage(page.id)}
              title={`${page.name} — click to open, drag to reorder, Delete to remove`}
            >
              <div
                className="page-card-canvas"
                style={{
                  aspectRatio: `${page.width} / ${page.height}`,
                  // Always an opaque white page surface (see .page-card-canvas).
                  background: '#ffffff',
                }}
              >
                {thumbs[page.id] && <img src={thumbs[page.id]} alt="" />}
                <div className="page-card-tools">
                  <button
                    className="mini-btn"
                    title="Duplicate page" aria-label="Duplicate page"
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicatePage(page.id);
                    }}
                  >
                    <Icon name="clone" size={12} />
                  </button>
                  <button
                    className="mini-btn"
                    title="Delete page" aria-label="Delete page"
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePage(page.id);
                    }}
                  >
                    <Icon name="trash2" size={12} />
                  </button>
                </div>
                {/* Number badge overlaid at the bottom of the thumbnail. */}
                <span className="page-card-num">{label}</span>
              </div>
            </div>
          );
        })}
          </div>

      {/* Action buttons: + Add page. */}
      <div className="strip-actions">
        <button
          className="strip-add"
          onClick={() => addPage()}
          title="Add page"
          aria-label="Add page"
        >
          <Icon name="plus" size={16} />
        </button>
        {onBulkAdd && (
          <button
            className="strip-add strip-bulk"
            onClick={onBulkAdd}
            title="Add several pages at once"
            aria-label="Add several pages at once"
          >
            <Icon name="plus" size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
