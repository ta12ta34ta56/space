/**
 * AppShell — the frame the editor lives in (spec 06, ui-context.md §7).
 *
 * Top bar (48px), left rail (56px), workspace, right dock (280px, the ported
 * Pages and Layers panels from Units 07 and 08), bottom bar (36px). Dark
 * chrome on `--surface`; the paper sits on `--workspace` neutral grey, never
 * near-black (D23).
 *
 * The shell owns no domain logic: guide geometry comes from `print/guides`,
 * paint comes from `render/canvas`, ephemeral view state lives in `ui-store`.
 * The two effects here synchronise with the outside world only — autosave
 * lifecycle and the window keyboard listener.
 */

import { useCallback, useEffect, useRef } from 'react';
import { inToPt } from '../../model';
import { pageSizeIn } from '../../print';
import { CanvasHost } from '../../render/canvas';
import { createAutosave } from '../../state/autosave';
import { storage } from '../../state/storage';
import { store } from '../../state/store';
import { useUiStore, ZOOM_MAX, ZOOM_MIN } from '../../state/ui-store';
import { GuideOverlay } from '../canvas/GuideOverlay';
import { RightDock } from '../panels/RightDock';
import { BottomBar } from './BottomBar';
import { LeftRail } from './LeftRail';
import { TopBar } from './TopBar';
import './AppShell.css';

/** The workspace padding kept around a fitted page: `--s6` (32px) per side. */
const FIT_PADDING_PX = 64;

export function AppShell() {
  const doc = store((s) => s.doc);
  const zoom = useUiStore((s) => s.zoom);
  const currentPageIndex = useUiStore((s) => s.currentPageIndex);
  const visibleGuides = useUiStore((s) => s.visibleGuides);

  const workspaceRef = useRef<HTMLElement | null>(null);

  // Unit 04 autosave wiring: starts with the app, stops on unload.
  useEffect(() => {
    const autosave = createAutosave({ store, storage, delayMs: 1500, now: Date.now });
    return () => {
      void autosave.stop();
    };
  }, []);

  const handleFit = useCallback(() => {
    const el = workspaceRef.current;
    if (el === null) return;
    const state = store.getState();
    const size = pageSizeIn(state.doc.book, useUiStore.getState().currentPageIndex);
    const fitW = (el.clientWidth - FIT_PADDING_PX) / inToPt(size.widthIn);
    const fitH = (el.clientHeight - FIT_PADDING_PX) / inToPt(size.heightIn);
    const fitted = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.min(fitW, fitH)));
    useUiStore.getState().setZoom(Math.floor(fitted * 100) / 100);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        useUiStore.getState().zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        useUiStore.getState().zoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        useUiStore.getState().setZoom(1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // The store validates but does not know the page count; clamp here so a
  // stale index (a page was deleted) still shows a real page.
  const pageCount = doc.pages.length;
  const pageIndex = pageCount === 0 ? 0 : Math.min(currentPageIndex, pageCount - 1);

  // Pixels per inch at this zoom. CanvasHost sizes its CSS box the same way
  // (points × zoom), so the overlay and the paint always agree.
  // One definition of how big a page is (Unit 07b): with bleed on the paper
  // grows, and the stage, the canvas and the guides grow with it together.
  const size = pageSizeIn(doc.book, pageIndex);
  const pxPerIn = inToPt(1) * zoom;

  return (
    <div className="shell">
      <TopBar />
      <div className="shell-body">
        <LeftRail />
        <main className="shell-workspace" ref={workspaceRef}>
          {pageCount > 0 ? (
            <div
              className="page-stage"
              style={{
                width: Math.max(1, Math.round(inToPt(size.widthIn) * zoom)),
                height: Math.max(1, Math.round(inToPt(size.heightIn) * zoom)),
              }}
            >
              <CanvasHost pageIndex={pageIndex} zoom={zoom} />
              <GuideOverlay
                book={doc.book}
                pageIndex={pageIndex}
                pageCount={pageCount}
                surface="interior"
                visibleGuides={visibleGuides}
                pxPerIn={pxPerIn}
              />
            </div>
          ) : (
            <p className="shell-empty">This book has no pages yet.</p>
          )}
        </main>
        <RightDock />
      </div>
      <BottomBar onFit={handleFit} />
    </div>
  );
}
