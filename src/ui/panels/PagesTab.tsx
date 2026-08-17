/**
 * PagesTab — the Pages panel, ported from the previous build (Unit 07, D17).
 *
 * PORTED, not redesigned. Same markup, same class names, same interactions,
 * same pixels as `legacy/novelka/src/components/editor/RightDock.tsx` L97-L397.
 * Only the colours are retokenised (D23) and only the data source changed:
 * the old panel read the canvas store and called the canvas engine directly;
 * this one reads the Document and dispatches Commands. If a reviewer who used
 * the old app can tell the difference, the port failed.
 *
 * The three subtle pieces that had to survive the port:
 *
 *  1. **The opaque white ground before capture.** A page with no background is
 *     stored as transparent, and JPEG encodes transparent as BLACK. Unit 05's
 *     `renderThumbnail` paints the ground and restores it; this panel uses
 *     that one rendering path and never defines a second.
 *  2. **`IntersectionObserver`.** Only on-screen rows render. A 200-page book
 *     has to stay smooth, which is the whole reason it exists.
 *  3. **rAF throttling.** Live edits re-snapshot on the next frame, at most
 *     once per frame.
 *
 * What changed is the invalidation signal. The old effect listened for the
 * canvas engine's modified and history events, and could miss one. This one
 * compares Page object references: Unit 02's structural sharing means an
 * unchanged page IS the same object, so a stale thumbnail is impossible
 * rather than unlikely.
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { BookSettings, Command, Page } from '../../model';
import { pageSizeIn } from '../../print';
import { renderThumbnail } from '../../render/thumbnail';
import { store } from '../../state/store';
import { useUiStore } from '../../state/ui-store';
import { Icon } from '../kit/Icon';
import { addPageAt, deletePage, duplicatePage, reorderPage } from './page-actions';
import { coverSpineLabelFor, pageNameFor, sideMarkerFor } from './pages-rows';
import { pagesNeedingThumbnails, type ThumbnailEntry } from './thumbnail-cache';
import { useGrabReorder } from './useGrabReorder';

/** Preflight severity for a page. Unit 11 supplies it; until then it is empty. */
export type PageSeverity = 'error' | 'warn';

export type PagesTabProps = {
  /**
   * Per-page preflight severity, keyed by page id. Preflight arrives in Unit
   * 11, so today this is always empty and no dot renders. The affordance is
   * built and wired; the data source is what is missing, and inventing a
   * placeholder severity would be a lie (honesty rule 3).
   */
  readonly severity?: Readonly<Record<string, PageSeverity>>;
  /** Injected id source, so the panel never calls nanoid itself. */
  readonly newId: () => string;
  /** Injected clock, for the same reason. */
  readonly now: () => number;
};

/** How far outside the viewport a row starts rendering its thumbnail. */
const ROOT_MARGIN = '240px';

export function PagesTab({ severity = {}, newId, now }: PagesTabProps) {
  const doc = store((s) => s.doc);
  const currentPageIndex = useUiStore((s) => s.currentPageIndex);
  const setCurrentPageIndex = useUiStore((s) => s.setCurrentPageIndex);

  const [thumbs, setThumbs] = useState<ReadonlyMap<string, ThumbnailEntry>>(new Map());
  const [refusal, setRefusal] = useState<string | null>(null);

  const pages = doc.pages;
  const activeIndex = pages.length === 0 ? -1 : Math.min(currentPageIndex, pages.length - 1);
  const activeId = activeIndex < 0 ? null : (pages[activeIndex]?.id ?? null);

  /** The one place a page action reaches the Document. A refusal is shown, not swallowed. */
  const run = useCallback(
    (action: { ok: true; command: Command } | { ok: false; reason: string }) => {
      if (!action.ok) {
        setRefusal(action.reason);
        return;
      }
      setRefusal(null);
      store.getState().dispatch(action.command, now());
    },
    [now],
  );

  const handleReorder = useCallback(
    (from: number, to: number) => {
      // One Command on release, never one per pointer-move: a drag is one undo
      // entry (spec 02 §3).
      run(reorderPage(store.getState().doc, from, to));
      setCurrentPageIndex(to);
    },
    [run, setCurrentPageIndex],
  );

  const reorder = useGrabReorder(pages, handleReorder);
  const { listRef } = reorder;

  const visibleRef = useRef<Set<string>>(new Set());
  const thumbsRef = useRef<ReadonlyMap<string, ThumbnailEntry>>(thumbs);
  thumbsRef.current = thumbs;
  const renderingRef = useRef(false);
  const rafRef = useRef(0);

  /* -------------------------------------------------------- thumbnails -- */

  useEffect(() => {
    let cancelled = false;

    const renderVisible = async (): Promise<void> => {
      if (renderingRef.current || cancelled) return;
      renderingRef.current = true;
      try {
        const pending = pagesNeedingThumbnails(pages, visibleRef.current, thumbsRef.current);
        for (const page of pending) {
          if (cancelled) return;
          try {
            const url = await renderThumbnail(page, doc.book, 480, pages.indexOf(page));
            if (cancelled) return;
            setThumbs((current) => {
              const next = new Map(current);
              next.set(page.id, { source: page, url });
              return next;
            });
          } catch {
            // A page that fails to render is skipped, not retried in a loop.
          }
        }
      } finally {
        renderingRef.current = false;
      }
    };

    // Live edits during drawing re-snapshot on the next frame, at most once.
    const schedule = () => {
      if (rafRef.current !== 0) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        void renderVisible();
      });
    };

    const root = listRef.current;
    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              for (const entry of entries) {
                const id = (entry.target as HTMLElement).dataset['pageId'];
                if (id === undefined) continue;
                if (entry.isIntersecting) visibleRef.current.add(id);
                else visibleRef.current.delete(id);
              }
              schedule();
            },
            { root, rootMargin: ROOT_MARGIN },
          )
        : null;

    if (observer !== null && root !== null) {
      root.querySelectorAll('[data-page-id]').forEach((el) => observer.observe(el));
    } else {
      // No IntersectionObserver (jsdom): every row counts as visible.
      for (const page of pages) visibleRef.current.add(page.id);
    }
    schedule();

    return () => {
      cancelled = true;
      observer?.disconnect();
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };
  }, [pages, doc.book, listRef]);

  /* ------------------------------------------------------------- rows -- */

  // Two-way sync: the open page scrolls itself into view, so the panel always
  // answers "which page am I on?".
  useEffect(() => {
    if (activeId === null) return;
    const el = listRef.current?.querySelector(`[data-page-id="${activeId}"]`);
    if (el instanceof HTMLElement) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeId, listRef]);

  const spineLabel = coverSpineLabelFor(doc.book, pages.length);

  return (
    <div className="dockpages" ref={listRef}>
      {doc.cover !== null && (
        <CoverRow
          coverId={doc.cover.id}
          spineLabel={spineLabel}
          onDelete={() => run({ ok: true, command: { t: 'cover/clear' } })}
        />
      )}

      {pages.map((page, index) => (
        <Fragment key={page.id}>
          <PageRow
            page={page}
            index={index}
            active={page.id === activeId}
            grabbing={reorder.grabId === page.id}
            severity={severity[page.id]}
            thumbUrl={thumbs.get(page.id)?.url}
            book={doc.book}
            onOpen={() => setCurrentPageIndex(index)}
            onGrab={() => reorder.grab(page.id)}
            onMove={(to) => run(reorderPage(store.getState().doc, index, to))}
            onDuplicate={() => run(duplicatePage(store.getState().doc, page.id, newId()))}
            onDelete={() => run(deletePage(store.getState().doc, page.id))}
          />
          <InsertGutter
            index={index}
            onInsert={() => run(addPageAt(store.getState().doc, index + 1, newId()))}
          />
        </Fragment>
      ))}

      {reorder.grabId !== null && reorder.indicatorTop !== null && (
        <div className="dockpage-dropline" style={{ top: reorder.indicatorTop }} />
      )}

      {refusal !== null && (
        <p className="dockpage-refusal" role="status">
          {refusal}
        </p>
      )}

      <div className="dockpage-add">
        <button
          type="button"
          className="dockpage-addlink"
          onClick={() => run(addPageAt(store.getState().doc, pages.length, newId()))}
        >
          <Icon name="plus" size={13} /> Add page
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- one row -- */

type PageRowProps = {
  readonly page: Page;
  readonly index: number;
  readonly active: boolean;
  readonly grabbing: boolean;
  readonly severity: PageSeverity | undefined;
  readonly thumbUrl: string | undefined;
  readonly book: BookSettings;
  readonly onOpen: () => void;
  readonly onGrab: () => void;
  readonly onMove: (to: number) => void;
  readonly onDuplicate: () => void;
  readonly onDelete: () => void;
};

function PageRow({
  page,
  index,
  active,
  grabbing,
  severity,
  thumbUrl,
  book,
  onOpen,
  onGrab,
  onMove,
  onDuplicate,
  onDelete,
}: PageRowProps) {
  const interiorNumber = index + 1;
  const name = pageNameFor(interiorNumber);
  const side = sideMarkerFor(interiorNumber);
  // The real paper proportions, from the one page-size function (Unit 07b).
  // The panel reads geometry; it never computes it.
  const paper = pageSizeIn(book, index);
  const classes = ['dockpage'];
  if (active) classes.push('active');
  if (grabbing) classes.push('grabbing');
  if (severity === 'error') classes.push('sev-err');
  else if (severity === 'warn') classes.push('sev-warn');

  return (
    <div
      data-page-id={page.id}
      data-reorder-id={page.id}
      className={classes.join(' ')}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onDoubleClick={onGrab}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          onMove(index - 1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          onMove(index + 1);
        }
      }}
      title={`${name}. Click to open, double-click to drag into a new order, up and down arrows to move.`}
    >
      <div
        className="dockpage-thumb"
        style={{
          // The real page ratio, so an 8.5 x 11 page is not squeezed into a
          // 6 x 9 box. Always an opaque white surface: the panel background
          // can never show through a page.
          aspectRatio: `${paper.widthIn} / ${paper.heightIn}`,
          background: 'var(--paper)',
        }}
      >
        {/* The thumbnail must not be draggable. The legacy row said so with a
            HTML drag attribute; D21 bans that word from the codebase,
            so the same result comes from `.dockpage-thumb img` in the
            stylesheet plus this refusal, which holds without CSS. */}
        {thumbUrl !== undefined && (
          <img src={thumbUrl} alt="" onDragStart={(e) => e.preventDefault()} />
        )}
        {severity !== undefined && (
          <span
            className={`dockpage-dot ${severity === 'error' ? 'err' : 'warn'}`}
            title={
              severity === 'error'
                ? 'This page has preflight errors'
                : 'This page has preflight warnings'
            }
          />
        )}
        <div className="dockpage-tools">
          <button
            type="button"
            className="mini-btn"
            title="Duplicate page"
            aria-label="Duplicate page"
            onClick={(e) => {
              e.stopPropagation();
              onDuplicate();
            }}
          >
            <Icon name="clone" size={12} />
          </button>
          <button
            type="button"
            className="mini-btn"
            title="Delete page"
            aria-label="Delete page"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Icon name="trash2" size={12} />
          </button>
        </div>
      </div>
      <div className="dockpage-label">
        <span className="dockpage-name">{name}</span>
        <span className="dockpage-side">{side}</span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- cover row -- */

function CoverRow({
  coverId,
  spineLabel,
  onDelete,
}: {
  readonly coverId: string;
  readonly spineLabel: string | null;
  readonly onDelete: () => void;
}) {
  return (
    <div data-page-id={coverId} className="dockpage is-cover" role="button" tabIndex={0} title="Cover">
      <div className="dockpage-thumb" style={{ background: 'var(--paper)' }}>
        <div className="dockpage-tools">
          <button
            type="button"
            className="mini-btn"
            title="Delete page"
            aria-label="Delete page"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Icon name="trash2" size={12} />
          </button>
        </div>
      </div>
      <div className="dockpage-label">
        <span className="dockpage-name">Cover</span>
        {spineLabel !== null && <span className="dockpage-side">{spineLabel}</span>}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- insert gutter -- */

/**
 * The quiet inline "+" between page rows: a thin divider that expands into a
 * small round insert button on hover. Ported unchanged (spec 07 §5).
 */
function InsertGutter({ index, onInsert }: { readonly index: number; readonly onInsert: () => void }) {
  return (
    <div className="dockpage-insert" aria-label={`Insert a page after position ${index + 1}`}>
      <button
        type="button"
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
