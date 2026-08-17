/**
 * Interior margins — the gutter bands, outer/top/bottom margins, and the
 * safe area.
 *
 * PORTED from `legacy/novelka/src/services/kdp.ts` with exactly two changes
 * required by the new architecture (architecture.md §3), and nothing else:
 *
 *  1. **Inches only.** The legacy version returned both points and inches
 *     (`gutter` and `gutterInches`). Document geometry is inches everywhere;
 *     conversion happens only at the render boundary, so the point fields are
 *     dropped entirely.
 *  2. **`safeAreaFor` takes a `TrimId` and a `PaperStock`, not raw numbers.**
 *     The legacy signature took `pageWidth`/`pageHeight` as bare points,
 *     which is how a caller passes the wrong units. The page size now comes
 *     from the trim table, and the paper is used to reject page counts KDP
 *     would refuse for that book before any geometry is produced.
 *
 * Everything else — the band boundaries, the recto/verso gutter placement,
 * the margin values — is the legacy logic verbatim. If a number here differs
 * from the legacy service for the same inputs, the port went wrong
 * (`margins.test.mjs` proves it against the legacy bundle).
 */

import { type PaperStock, type TrimId } from '../model';
import { TRIM_SIZE_IN, assertPageCountFor } from './trims';

/** Bleed, when artwork must run off the edge. Applied to top/bottom/outside. */
export const BLEED_IN = 0.125;

/** Top/bottom/outside margin, no bleed, KDP's absolute minimum. */
export const OUTER_MARGIN_MIN_IN = 0.25;

/** With bleed, KDP's margin value includes the bleed. */
export const OUTER_MARGIN_WITH_BLEED_MIN_IN = 0.375;

/** The margin Novelka uses by default: comfortably inside KDP's minimum. */
export const OUTER_MARGIN_SAFE_IN = 0.375;

/** KDP's smallest printable interior. */
export const KDP_MIN_PAGE_COUNT = 24;

/** Whether to use KDP's bare minimum margins or Novelka's safer default. */
export type MarginIntent = 'minimum' | 'safe';

export type MarginOptions = {
  readonly bleed?: boolean;
  readonly intent?: MarginIntent;
};

/** The widest band; the fallback for a count past every listed band. */
const GUTTER_LAST: { maxPages: number; gutterIn: number } = { maxPages: 828, gutterIn: 0.875 };

/**
 * Inside (gutter) margin grows with page count — the spine eats more paper.
 * Ported verbatim from legacy `GUTTER_BY_PAGE_COUNT` (kdp.ts L120–126).
 */
export const GUTTER_BY_PAGE_COUNT: readonly { maxPages: number; gutterIn: number }[] = [
  { maxPages: 150, gutterIn: 0.375 },
  { maxPages: 300, gutterIn: 0.5 },
  { maxPages: 500, gutterIn: 0.625 },
  { maxPages: 700, gutterIn: 0.75 },
  GUTTER_LAST,
];

/** Rounds a page count up to the next even number, as KDP requires. */
export function printedPageCount(pageCount: number): number {
  const n = Math.max(0, Math.floor(pageCount));
  return n % 2 === 0 ? n : n + 1;
}

/**
 * The gutter band a page count lands in. The band, not just the width, is
 * what D16 needs: adding pages across a band boundary changes the safe area
 * of every page, and comparing bands is clearer than comparing widths.
 */
export function gutterBandFor(pageCount: number): { maxPages: number; gutterIn: number } {
  const effectiveCount = Math.max(KDP_MIN_PAGE_COUNT, printedPageCount(pageCount));
  for (const band of GUTTER_BY_PAGE_COUNT) {
    if (effectiveCount <= band.maxPages) return band;
  }
  return GUTTER_LAST;
}

/** Inches of gutter for a page count. Ported from legacy `gutterInchesFor`. */
export function gutterInchesFor(pageCount: number): number {
  return gutterBandFor(pageCount).gutterIn;
}

/** Interior margins, all in inches. Ported from legacy `kdpMarginsFor`. */
export type Margins = {
  readonly gutterIn: number;
  readonly outerIn: number;
  readonly topIn: number;
  readonly bottomIn: number;
  readonly bleedIn: number;
};

/**
 * Interior margins for a page count, in inches. The legacy point fields are
 * gone (architecture §3); the values are the legacy values verbatim.
 *
 * `bleed: true` widens the outer/top/bottom margin to 0.375 in, because with
 * bleed KDP's margin value includes the bleed itself.
 */
export function kdpMarginsFor(pageCount: number, options: MarginOptions = {}): Margins {
  const bleed = options.bleed ?? false;
  const intent = options.intent ?? 'safe';
  const gutterIn = gutterInchesFor(pageCount);
  const outerIn = bleed
    ? OUTER_MARGIN_WITH_BLEED_MIN_IN
    : intent === 'safe'
      ? OUTER_MARGIN_SAFE_IN
      : OUTER_MARGIN_MIN_IN;
  const topIn = bleed ? OUTER_MARGIN_WITH_BLEED_MIN_IN : outerIn;
  return {
    gutterIn,
    outerIn,
    topIn,
    bottomIn: topIn,
    bleedIn: BLEED_IN,
  };
}

/** The rectangle protected content must stay inside, in inches. */
export type SafeArea = {
  readonly xIn: number;
  readonly yIn: number;
  readonly wIn: number;
  readonly hIn: number;
  readonly isRecto: boolean;
};

/**
 * The safe area of one interior page, in inches. Ported from legacy
 * `safeAreaFor`; the page size now comes from the trim table instead of
 * caller-supplied points.
 *
 * Recto/verso is the part that silently ruins books: **odd pages are
 * right-hand (recto) and their gutter is on the LEFT.** The legacy behaviour
 * is kept exactly.
 */
export function safeAreaFor(
  trimId: TrimId,
  paper: PaperStock,
  pageCount: number,
  pageNumber: number,
  options: MarginOptions = {},
): SafeArea {
  assertPageCountFor(trimId, paper, pageCount);
  const size = TRIM_SIZE_IN[trimId];
  const m = kdpMarginsFor(pageCount, options);
  const isRecto = pageNumber % 2 === 1;
  const leftIn = isRecto ? m.gutterIn : m.outerIn;
  const rightIn = isRecto ? m.outerIn : m.gutterIn;
  return {
    xIn: leftIn,
    yIn: m.topIn,
    wIn: Math.max(0, size.widthIn - leftIn - rightIn),
    hIn: Math.max(0, size.heightIn - m.topIn - m.bottomIn),
    isRecto,
  };
}
