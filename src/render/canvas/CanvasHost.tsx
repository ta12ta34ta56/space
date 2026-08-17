import { useEffect, useRef } from 'react';
import { Canvas } from 'fabric';
import type { BookSettings, Page } from '../../model/types';
import { inToPt, PT_PER_IN } from '../../model/units';
import { pageSizeIn } from '../../print/page-size';
import { store } from '../../state/store';
import { renderPage } from './render-page';
import { pixelScaleFor } from './resolution';

export type CanvasHostProps = {
  readonly pageIndex?: number;
  readonly zoom?: number;
  readonly className?: string;
  readonly style?: React.CSSProperties;
};

/**
 * CanvasHost — the single React seam owning a Fabric Canvas instance (spec 05 §4).
 *
 * Rules:
 *  - Exactly one canvas created on mount, disposed on unmount.
 *  - At most two effect hooks (here: 1).
 *  - Repaints only when page reference or book settings change (structural sharing from Unit 02).
 */
export function CanvasHost({
  pageIndex = 0,
  zoom = 1,
  className,
  style,
}: CanvasHostProps) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const el = canvasElRef.current;
    if (el === null) return;

    const initialDoc = store.getState().doc;
    const initialSize = pageSizeIn(initialDoc.book, pageIndex);
    const baseW = inToPt(initialSize.widthIn);
    const baseH = inToPt(initialSize.heightIn);
    const cssW = Math.max(1, Math.round(baseW * zoom));
    const cssH = Math.max(1, Math.round(baseH * zoom));
    const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
    const { pixelScale } = pixelScaleFor({ cssW, cssH, dpr });

    const canvas = new Canvas(el, {
      width: cssW,
      height: cssH,
      backgroundColor: '#ffffff',
      selection: false,
    });

    canvas.enableRetinaScaling = true;
    canvas.getRetinaScaling = () => pixelScale;
    canvas.setDimensions({ width: cssW, height: cssH });
    canvas.setZoom(zoom);

    let lastPage: Page | undefined = initialDoc.pages[pageIndex];
    let lastBook: BookSettings = initialDoc.book;

    if (lastPage !== undefined) {
      renderPage(canvas, lastPage, lastBook, PT_PER_IN);
    }

    const unsubscribe = store.subscribe(() => {
      const currentDoc = store.getState().doc;
      const currentPage = currentDoc.pages[pageIndex];
      const currentBook = currentDoc.book;

      // Skip repaint if neither page reference nor book settings changed
      if (currentPage === lastPage && currentBook === lastBook) {
        return;
      }

      // Bleed changes the physical page size (Unit 07b), so the canvas box
      // has to follow the book, not just the trim it was mounted with.
      if (currentBook !== lastBook) {
        const size = pageSizeIn(currentBook, pageIndex);
        canvas.setDimensions({
          width: Math.max(1, Math.round(inToPt(size.widthIn) * zoom)),
          height: Math.max(1, Math.round(inToPt(size.heightIn) * zoom)),
        });
        canvas.setZoom(zoom);
      }

      lastPage = currentPage;
      lastBook = currentBook;

      if (currentPage !== undefined) {
        renderPage(canvas, currentPage, currentBook, PT_PER_IN);
      } else {
        canvas.clear();
        canvas.backgroundColor = '#ffffff';
        canvas.requestRenderAll();
      }
    });

    return () => {
      unsubscribe();
      void canvas.dispose();
    };
  }, [pageIndex, zoom]);

  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--paper, #ffffff)',
        boxShadow: '0 4px 20px var(--paper-edge, rgba(0, 0, 0, 0.45))',
        ...style,
      }}
    >
      <canvas ref={canvasElRef} />
    </div>
  );
}
