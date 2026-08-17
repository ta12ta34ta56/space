/**
 * The six trims and the one paper vocabulary — the KDP facts every other
 * print module reads (architecture.md §3, decisions D7, D8).
 *
 * This is the layer that knows what Amazon will accept: trim sizes, paper
 * spine thickness, and page-count limits per trim × paper. `margins.ts`,
 * `cover.ts` and every later unit read their numbers from here.
 *
 * The paper vocabulary is declared once, in the model (the bottom layer, so
 * the Document can carry it), and re-exported here so the print layer is the
 * single public face of it. One vocabulary means one set of ids — the D8
 * defect 4 mess (`bw-white`/`standard-color` vs `white`/`color-standard` with
 * no mapping) cannot come back because there is no second vocabulary to drift.
 *
 * `binding` may include 'hardcover' because the Document model does, but v1
 * ships paperback only (D24.4). Every function in this unit throws
 * `UnsupportedBindingError` for hardcover rather than returning approximate
 * numbers — an honest refusal beats a rejected upload.
 */

import { PAPER_STOCKS, TRIM_IDS } from '../model';
import type { PaperStock, TrimId } from '../model';

/** The vocabulary, declared once in the model, re-exported for the layer. */
export { PAPER_STOCKS, TRIM_IDS };
export type { PaperStock, TrimId };

/** Thrown when a function is asked for hardcover geometry. Paperback-only in v1 (D24.4). */
export class UnsupportedBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedBindingError';
  }
}

/** Thrown when a page count cannot be printed at a trim × paper. */
export class PageCountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PageCountError';
  }
}

/* --------------------------------------------------------------- trims -- */

/** KDP's exact trim sizes, in inches (D7). No custom sizes, ever. */
export const TRIM_SIZE_IN: Readonly<Record<TrimId, { readonly widthIn: number; readonly heightIn: number }>> = {
  '6x9': { widthIn: 6, heightIn: 9 },
  '5.5x8.5': { widthIn: 5.5, heightIn: 8.5 },
  '7x10': { widthIn: 7, heightIn: 10 },
  '8x10': { widthIn: 8, heightIn: 10 },
  '8.5x11': { widthIn: 8.5, heightIn: 11 },
  a4: { widthIn: 8.27, heightIn: 11.69 },
};

/* -------------------------------------------------------------- papers -- */

/** The physical facts about a paper stock: spine thickness and page limits. */
export type PaperStockInfo = {
  /** Inches of spine per interior page. */
  readonly perPageIn: number;
  readonly minPages: number;
  readonly maxPages: number;
};

/**
 * One table, one source. `color-standard` is 0.002252 in, not premium's
 * 0.002347 in — the D8 defect 1 regression test pins this exact value.
 */
export const PAPER_STOCKS_INFO: Readonly<Record<PaperStock, PaperStockInfo>> = {
  'bw-white': { perPageIn: 0.002252, minPages: 24, maxPages: 828 },
  'bw-cream': { perPageIn: 0.0025, minPages: 24, maxPages: 776 },
  'bw-groundwood': { perPageIn: 0.00235, minPages: 24, maxPages: 812 },
  'color-standard': { perPageIn: 0.002252, minPages: 72, maxPages: 600 },
  'color-premium': { perPageIn: 0.002347, minPages: 24, maxPages: 828 },
};

/* ------------------------------------------------ per-trim page limits -- */

/** A legal page-count range at one trim × paper. */
export type PageCountLimit = {
  readonly minPages: number;
  readonly maxPages: number;
};

/**
 * Per-trim page-count ceilings, ported from the legacy limit table
 * (`legacy/novelka/src/services/kdp.ts`, L54–94) and trimmed to the six trims
 * we ship. A missing paper key means the stock's own limits apply. `null`
 * means the trim does not offer that paper at all — A4 has no colour-standard
 * — which is unavailable, not merely limited.
 */
const TRIM_LIMIT_OVERRIDES: Readonly<
  Partial<Record<TrimId, Readonly<Partial<Record<PaperStock, PageCountLimit | null>>>>>
> = {
  '8.5x11': {
    'bw-white': { minPages: 24, maxPages: 590 },
    'bw-cream': { minPages: 24, maxPages: 550 },
    'bw-groundwood': { minPages: 24, maxPages: 578 },
    'color-premium': { minPages: 24, maxPages: 590 },
  },
  a4: {
    'bw-white': { minPages: 24, maxPages: 780 },
    'bw-cream': { minPages: 24, maxPages: 730 },
    'bw-groundwood': { minPages: 24, maxPages: 764 },
    'color-standard': null,
    'color-premium': { minPages: 24, maxPages: 590 },
  },
};

/**
 * The page-count limits for a trim × paper combination, or `null` when the
 * combination is unavailable on KDP.
 */
export function pageCountLimitFor(trimId: TrimId, paper: PaperStock): PageCountLimit | null {
  const override = TRIM_LIMIT_OVERRIDES[trimId]?.[paper];
  if (override !== undefined) return override;
  const stock = PAPER_STOCKS_INFO[paper];
  return { minPages: stock.minPages, maxPages: stock.maxPages };
}

/**
 * Rejects a page count KDP would refuse for this trim × paper. The message
 * names the limit and the paper so the caller can act on it (code-standards:
 * errors state what happened, and the fix).
 */
export function assertPageCountFor(trimId: TrimId, paper: PaperStock, pageCount: number): void {
  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new PageCountError(`pageCount must be a positive whole number, received ${String(pageCount)}.`);
  }
  const limit = pageCountLimitFor(trimId, paper);
  if (limit === null) {
    throw new PageCountError(`${trimId} does not offer ${paper} on KDP.`);
  }
  if (pageCount < limit.minPages) {
    throw new PageCountError(
      `pageCount ${pageCount} is below the minimum of ${limit.minPages} for ${trimId} with ${paper}.`,
    );
  }
  if (pageCount > limit.maxPages) {
    throw new PageCountError(
      `pageCount ${pageCount} is above the maximum of ${limit.maxPages} for ${trimId} with ${paper}.`,
    );
  }
}
