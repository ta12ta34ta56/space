/**
 * Cover geometry — REBUILT, not ported (D8).
 *
 * `legacy/novelka/src/services/kdp-cover.ts` has four verified defects, and is
 * reference only for its API *shape*, not its numbers:
 *
 *  1. Standard colour used premium's `0.002347 in` per page — the spine came
 *     out wrong and the cover was rejected.
 *  2. Hardcover was modelled as paperback plus a fudge — no hinge, no board
 *     thickness, no board overhang.
 *  3. Spine text was allowed only past 79 pages; KDP allows it at 79+.
 *  4. A second paper vocabulary with no mapping between the two.
 *
 * The numbers here are written fresh from the spec and pinned by
 * `reference-table.ts`, so "is the cover right?" is a yes/no question.
 *
 * Formula (paperback):
 *
 * ```
 * spine  = pageCount × paper.perPageIn       // NO +0.06″ allowance
 * width  = 0.125 + trimW + spine + trimW + 0.125
 * height = 0.125 + trimH + 0.125
 * ```
 *
 * Sources disagree about the +0.06″ allowance; we match Amazon's own cover
 * template generator, which is the thing that accepts or rejects the file.
 * A safety allowance Amazon does not apply produces a spine that is too wide
 * and spine text that sits off-centre on the printed book.
 *
 * Hardcover throws `UnsupportedBindingError` (D24.4) — paperback-only until
 * wrap, hinge and board geometry can be verified to reference-table standard.
 */

import { type Binding, type PaperStock, type TrimId } from '../model';
import { PAPER_STOCKS_INFO, TRIM_SIZE_IN, UnsupportedBindingError, assertPageCountFor } from './trims';

/** Bleed on every outer edge of a cover. */
export const COVER_BLEED_IN = 0.125;

/** KDP prints spine text from 79 pages up. The legacy `> 79` was off by one. */
export const SPINE_TEXT_MIN_PAGES = 79;

/** The KDP barcode keep-out box: 2″ × 1.2″, bottom-right of the back cover. */
export const BARCODE_W_IN = 2;
export const BARCODE_H_IN = 1.2;

/** How far the keep-out box sits inside the back cover's trim edges. */
export const BARCODE_OFFSET_IN = 0.25;

/** The geometry of a paperback cover, all in inches. */
export type CoverSpec = {
  readonly trimId: TrimId;
  readonly paper: PaperStock;
  readonly pageCount: number;
  /** `pageCount × paper.perPageIn`. No +0.06″ allowance (D8). */
  readonly spineIn: number;
  /** The full flat cover, bleed included on all four sides. */
  readonly widthIn: number;
  readonly heightIn: number;
  /** x of the spine's left edge within the flat cover. */
  readonly spineLeftIn: number;
  /** True from 79 pages up — the UI disables spine text below that (D8 defect 3). */
  readonly spineTextAllowed: boolean;
};

/**
 * The flat cover geometry for a paperback book. Throws `UnsupportedBindingError`
 * for hardcover and `PageCountError` for a page count KDP would refuse.
 */
export function coverSpecFor(
  trimId: TrimId,
  paper: PaperStock,
  pageCount: number,
  binding: Binding = 'paperback',
): CoverSpec {
  if (binding === 'hardcover') {
    throw new UnsupportedBindingError(
      `coverSpecFor: hardcover is not supported in v1 (D24.4). KDP hardcover needs wrap, hinge, ` +
        `board thickness and board overhang, verified against reference values. Paperback-only for now.`,
    );
  }
  assertPageCountFor(trimId, paper, pageCount);
  const size = TRIM_SIZE_IN[trimId];
  const spineIn = pageCount * PAPER_STOCKS_INFO[paper].perPageIn;
  return {
    trimId,
    paper,
    pageCount,
    spineIn,
    widthIn: COVER_BLEED_IN + size.widthIn + spineIn + size.widthIn + COVER_BLEED_IN,
    heightIn: COVER_BLEED_IN + size.heightIn + COVER_BLEED_IN,
    spineLeftIn: COVER_BLEED_IN + size.widthIn,
    spineTextAllowed: pageCount >= SPINE_TEXT_MIN_PAGES,
  };
}

/** The barcode keep-out box, in inches within the flat cover (bleed included). */
export type BarcodeKeepOutIn = {
  readonly xIn: number;
  readonly yIn: number;
  readonly wIn: number;
  readonly hIn: number;
};

/**
 * The box Amazon prints its barcode in: 2″ × 1.2″, bottom-right of the back
 * cover, offset 0.25″ from the trim. Placement ported from
 * `legacy/novelka/src/services/cover-guides.ts`; coordinates match `CoverSpec`
 * (flat cover, bleed included).
 */
export function barcodeKeepOutIn(trimId: TrimId): BarcodeKeepOutIn {
  const size = TRIM_SIZE_IN[trimId];
  return {
    xIn: COVER_BLEED_IN + size.widthIn - (BARCODE_W_IN + BARCODE_OFFSET_IN),
    yIn: COVER_BLEED_IN + size.heightIn - (BARCODE_H_IN + BARCODE_OFFSET_IN),
    wIn: BARCODE_W_IN,
    hIn: BARCODE_H_IN,
  };
}
