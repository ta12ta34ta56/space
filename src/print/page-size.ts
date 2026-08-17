/**
 * How big a page actually is (Unit 07b, D25).
 *
 * There is exactly ONE definition of page size in the codebase, and it is
 * here. The renderer, the thumbnails, the guides, preflight and export all
 * read it, so they cannot disagree about where the paper ends
 * (architecture.md §9).
 *
 * The fact this file exists to state: **a page set up for bleed is physically
 * larger than its trim size.** The printer cuts it down. Bleed is added on the
 * outer edge, the top and the bottom only — the gutter edge is bound into the
 * spine and is never trimmed, so it never bleeds.
 *
 *   6 x 9, bleed off -> 6      x 9    in
 *   6 x 9, bleed on  -> 6.125  x 9.25 in   (0.125 outer, 0.125 top + bottom)
 *
 * Width grows ONCE, not twice. Height grows twice, because both the top and
 * the bottom are cut.
 *
 * The page's coordinate origin stays at the top-left of the paper, which with
 * bleed on is the bleed edge. Which side the extra width sits on depends on
 * recto/verso, and that is what `bleedInsetIn` answers: on a recto (odd) page
 * the gutter is on the LEFT, so the paper grows to the right and the trim line
 * starts at x = 0; on a verso page the gutter is on the right, so the paper
 * grows to the left and the trim line starts 0.125 in in.
 */

import type { BookSettings } from '../model';
import { BLEED_IN } from './margins';
import { TRIM_SIZE_IN } from './trims';

/** The paper size of one page, in inches. Bleed included when the book bleeds. */
export type PageSize = {
  readonly widthIn: number;
  readonly heightIn: number;
};

/** Thrown when a page size is asked for a page that cannot exist. */
export class PageSizeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageSizeError';
  }
}

/**
 * Zero-based print order; the human page number is `pageIndex + 1`, so index 0
 * is page 1, a recto.
 */
export function isRectoPage(pageIndex: number): boolean {
  return (pageIndex + 1) % 2 === 1;
}

function assertPageIndex(pageIndex: number, where: string): void {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new PageSizeError(
      `${where}: pageIndex must be a whole number of 0 or more, received ${String(pageIndex)}.`,
    );
  }
}

/**
 * The size of the paper for one interior page, in inches.
 *
 * Bleed off: the trim size. Bleed on: trim width + 0.125 in, trim height +
 * 0.25 in. `pageIndex` does not change the size — only which side the extra
 * width sits on, which `bleedInsetIn` reports.
 */
export function pageSizeIn(book: BookSettings, pageIndex: number): PageSize {
  assertPageIndex(pageIndex, 'pageSizeIn');
  const trim = TRIM_SIZE_IN[book.trimId];
  if (!book.bleed) {
    return { widthIn: trim.widthIn, heightIn: trim.heightIn };
  }
  return {
    widthIn: trim.widthIn + BLEED_IN,
    heightIn: trim.heightIn + BLEED_IN * 2,
  };
}

/**
 * Where the trim box sits inside the paper, in inches from the paper's
 * top-left corner.
 *
 * With bleed off this is `{ 0, 0 }` — trim and paper coincide. With bleed on
 * the top inset is always 0.125 in, and the left inset is 0.125 in on a verso
 * page (its outer edge is on the left) and 0 on a recto page (its gutter edge
 * is on the left, and a gutter never bleeds).
 */
export function trimOffsetIn(book: BookSettings, pageIndex: number): { readonly xIn: number; readonly yIn: number } {
  assertPageIndex(pageIndex, 'trimOffsetIn');
  if (!book.bleed) return { xIn: 0, yIn: 0 };
  return { xIn: isRectoPage(pageIndex) ? 0 : BLEED_IN, yIn: BLEED_IN };
}
