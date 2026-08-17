/**
 * Thumbnail export seam (spec 05 §5).
 *
 * Re-exports the thumbnail renderer without exposing Fabric types outside
 * `src/render/canvas/`.
 */

import type { BookSettings, Page } from '../model/types';
import { renderThumbnail as renderCanvasThumbnail } from './canvas/thumbnail';

export async function renderThumbnail(
  page: Page,
  book: BookSettings,
  maxPx = 480,
): Promise<string> {
  return renderCanvasThumbnail(page, book, maxPx);
}
