/**
 * Offscreen page-to-image thumbnail generator (spec 05 §5, D17).
 *
 * Renders a Page into a JPEG data URL.
 *  - Same code path as the main renderer (invariant: one definition of where things are).
 *  - Opaque white ground painted before toDataURL (D17 fix for transparent/black JPEGs).
 *  - JPEG, quality 0.6, multiplier: min(1, maxPx / pageWidthPx).
 *  - Guides are never included.
 */

import { StaticCanvas } from 'fabric';
import type { BookSettings, Page } from '../../model/types';
import { inToPt, PT_PER_IN } from '../../model/units';
import { TRIM_SIZE_IN } from '../../print/trims';
import { renderPage } from './render-page';

export async function renderThumbnail(
  page: Page,
  book: BookSettings,
  maxPx = 480,
): Promise<string> {
  const trim = TRIM_SIZE_IN[book.trimId];
  const pageWidthPx = inToPt(trim.widthIn);
  const pageHeightPx = inToPt(trim.heightIn);

  const el = typeof document !== 'undefined' ? document.createElement('canvas') : undefined;
  const c = new StaticCanvas(el, {
    width: pageWidthPx,
    height: pageHeightPx,
    backgroundColor: '#ffffff',
  });

  // Opaque white ground painted before toDataURL (D17 fix)
  c.backgroundColor = '#ffffff';
  c.setViewportTransform([1, 0, 0, 1, 0, 0]);

  renderPage(c, page, book, PT_PER_IN);

  const multiplier = Math.min(1, maxPx / Math.max(1, pageWidthPx));

  const dataUrl = c.toDataURL({
    format: 'jpeg',
    quality: 0.6,
    multiplier: Math.max(0.01, multiplier),
    enableRetinaScaling: false,
  });

  await c.dispose();
  return dataUrl;
}
