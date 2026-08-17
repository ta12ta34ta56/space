/**
 * Which page thumbnails actually need rendering (spec 07 §2).
 *
 * Pure, so the caching rule is testable without a DOM or a canvas. The rule
 * itself is Unit 02's structural sharing, used as a signal rather than an
 * optimisation: **if the Page is the same object reference, the thumbnail it
 * produced is still valid.** A command that edits page 4 returns a new
 * Document in which pages 1 to 3 are the very same objects, so their
 * thumbnails are never re-rendered.
 *
 * The legacy panel listened for the canvas engine's modified and history
 * events and hoped it had not missed one. This cannot miss one.
 */

import type { Page } from '../../model';

/** What a cached thumbnail was rendered from, and what came out. */
export type ThumbnailEntry = {
  /** The exact Page object reference this url was rendered from. */
  readonly source: Page;
  readonly url: string;
};

export type ThumbnailCache = ReadonlyMap<string, ThumbnailEntry>;

/** True when the cached thumbnail for this page is still the right picture. */
export function isFresh(cache: ThumbnailCache, page: Page): boolean {
  return cache.get(page.id)?.source === page;
}

/**
 * The pages that must be rendered right now: on screen, and either never
 * rendered or rendered from a Page that has since been replaced.
 *
 * Off-screen rows are skipped entirely — that is what keeps a 200-page book
 * smooth, and it is why the caller runs an `IntersectionObserver`.
 */
export function pagesNeedingThumbnails(
  pages: readonly Page[],
  visibleIds: ReadonlySet<string>,
  cache: ThumbnailCache,
): readonly Page[] {
  return pages.filter((page) => visibleIds.has(page.id) && !isFresh(cache, page));
}
