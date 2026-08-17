/**
 * The locked cover reference table — the thing that makes cover geometry a
 * yes/no question (D8).
 *
 * Every row is a known-good (trim × paper × pages) → (spine, cover size)
 * triple. The headline test of this unit computes `coverSpecFor` for every
 * row and asserts it matches within 0.0005″. Any future change that breaks a
 * reference value fails the build — the table and the formula are pinned
 * together, so neither can drift alone.
 *
 * Provenance, stated honestly: these are **derived** values, not scraped from
 * Amazon's generator. Amazon's help pages cannot be fetched programmatically,
 * and the paper thicknesses come from cross-referencing several independent
 * third-party calculators (recorded in decisions.md D8). They are our locked
 * contract, not gospel. If the owner ever downloads a real KDP cover template
 * and a value disagrees, the table is corrected and the test follows the
 * table — that is the whole point of having one.
 */

import { type PaperStock, type TrimId } from '../model';

/** One known-good cover value triple, inches. */
export type CoverReferenceRow = {
  readonly trimId: TrimId;
  readonly paper: PaperStock;
  readonly pages: number;
  readonly spineIn: number;
  readonly coverWidthIn: number;
  readonly coverHeightIn: number;
};

/** Tolerance the reference test uses: 0.0005 in. */
export const COVER_REFERENCE_TOLERANCE_IN = 0.0005;

/**
 * Frozen, ordered. Every value is `pages × perPageIn` under the D8 formula,
 * computed from this spec's own paper table — consistent by construction,
 * which is exactly what the test checks: it pins the formula and the
 * constants together.
 */
export const COVER_REFERENCE_TABLE: readonly CoverReferenceRow[] = Object.freeze([
  { trimId: '6x9', paper: 'bw-white', pages: 24, spineIn: 0.054048, coverWidthIn: 12.304048, coverHeightIn: 9.25 },
  { trimId: '6x9', paper: 'bw-white', pages: 100, spineIn: 0.2252, coverWidthIn: 12.4752, coverHeightIn: 9.25 },
  { trimId: '6x9', paper: 'bw-cream', pages: 200, spineIn: 0.5, coverWidthIn: 12.75, coverHeightIn: 9.25 },
  { trimId: '6x9', paper: 'color-premium', pages: 300, spineIn: 0.7041, coverWidthIn: 12.9541, coverHeightIn: 9.25 },
  { trimId: '6x9', paper: 'bw-white', pages: 828, spineIn: 1.864656, coverWidthIn: 14.114656, coverHeightIn: 9.25 },
  { trimId: '5.5x8.5', paper: 'bw-white', pages: 120, spineIn: 0.27024, coverWidthIn: 11.52024, coverHeightIn: 8.75 },
  { trimId: '7x10', paper: 'bw-groundwood', pages: 250, spineIn: 0.5875, coverWidthIn: 14.8375, coverHeightIn: 10.25 },
  { trimId: '8x10', paper: 'bw-white', pages: 60, spineIn: 0.13512, coverWidthIn: 16.38512, coverHeightIn: 10.25 },
  { trimId: '8.5x11', paper: 'bw-white', pages: 24, spineIn: 0.054048, coverWidthIn: 17.304048, coverHeightIn: 11.25 },
  { trimId: '8.5x11', paper: 'bw-cream', pages: 400, spineIn: 1.0, coverWidthIn: 18.25, coverHeightIn: 11.25 },
  { trimId: 'a4', paper: 'bw-white', pages: 150, spineIn: 0.3378, coverWidthIn: 17.1278, coverHeightIn: 11.94 },
  { trimId: 'a4', paper: 'color-premium', pages: 590, spineIn: 1.38473, coverWidthIn: 18.17473, coverHeightIn: 11.94 },
]);
