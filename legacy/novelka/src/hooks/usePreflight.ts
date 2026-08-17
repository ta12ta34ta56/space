import { useEffect, useState } from 'react';
import { useCanvasStore } from '../stores/canvas-store';
import {
  runComprehensivePreflight,
  type ComprehensivePreflightResult,
} from '../domain/preflight';
import { bookDiagnostics, withBookDiagnostics } from '../services/book';

/**
 * Debounced live preflight over the whole document.
 *
 * Runs the EXISTING `runComprehensivePreflight` (unchanged) whenever the pages
 * change, ~400ms after the last edit so typing never stutters, then folds in
 * the book-level diagnostics (spine / paper-binding page limits / cover
 * geometry) from services/book.ts. The result is shared by the Pages tab
 * (red/amber corner dots) and the KDP Check panel.
 *
 * `nonce` lets the KDP panel offer an explicit "Run checks again" button.
 */
export function usePreflight(nonce = 0): ComprehensivePreflightResult | null {
  const pages = useCanvasStore((s) => s.pages);
  const book = useCanvasStore((s) => s.book);
  const [result, setResult] = useState<ComprehensivePreflightResult | null>(null);

  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => {
      try {
        // 'all' keeps diagnostic pageNumbers aligned with document order.
        const base = runComprehensivePreflight(pages, { exportPreset: 'all' });
        const r = withBookDiagnostics(base, bookDiagnostics(pages, book));
        if (alive) setResult(r);
      } catch {
        if (alive) setResult(null);
      }
    }, 400);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [pages, book, nonce]);

  return result;
}

/** pageId -> worst severity on that page ('error' beats 'warn'). */
export function pageSeverityMap(
  result: ComprehensivePreflightResult | null,
): Record<string, 'error' | 'warn'> {
  if (!result) return {};
  const map: Record<string, 'error' | 'warn'> = {};
  for (const d of [...result.warnings, ...result.errors]) {
    if (!d.pageId) continue;
    if (d.severity === 'error') map[d.pageId] = 'error';
    else if (map[d.pageId] !== 'error') map[d.pageId] = 'warn';
  }
  return map;
}
