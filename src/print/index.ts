/**
 * The print layer — the numbers that know what Amazon will accept (Unit 03).
 *
 * Pure math, no rendering: the six trims and the one paper vocabulary
 * (`trims.ts`), the ported margins and safe area (`margins.ts`), the rebuilt
 * cover geometry (`cover.ts`), the locked cover reference table
 * (`reference-table.ts`), and the guide rectangles the overlays draw
 * (`guides.ts`, Unit 06). This layer imports only `model/`.
 */

export {
  PAPER_STOCKS,
  TRIM_IDS,
  TRIM_SIZE_IN,
  PAPER_STOCKS_INFO,
  PageCountError,
  UnsupportedBindingError,
  assertPageCountFor,
  pageCountLimitFor,
} from './trims';
export type { PageCountLimit, PaperStock, PaperStockInfo, TrimId } from './trims';

export {
  BLEED_IN,
  GUTTER_BY_PAGE_COUNT,
  KDP_MIN_PAGE_COUNT,
  OUTER_MARGIN_MIN_IN,
  OUTER_MARGIN_SAFE_IN,
  OUTER_MARGIN_WITH_BLEED_MIN_IN,
  gutterBandFor,
  gutterInchesFor,
  kdpMarginsFor,
  printedPageCount,
  safeAreaFor,
} from './margins';
export type { MarginIntent, MarginOptions, Margins, SafeArea } from './margins';

export {
  BARCODE_H_IN,
  BARCODE_OFFSET_IN,
  BARCODE_W_IN,
  COVER_BLEED_IN,
  SPINE_TEXT_MIN_PAGES,
  barcodeKeepOutIn,
  coverSpecFor,
} from './cover';
export type { BarcodeKeepOutIn, CoverSpec } from './cover';

export { COVER_REFERENCE_TABLE, COVER_REFERENCE_TOLERANCE_IN } from './reference-table';
export type { CoverReferenceRow } from './reference-table';

export { GUIDE_KINDS, GUIDE_SURFACES, GuideError, guidesFor } from './guides';
export type { Guide, GuideKind, GuideOptions, GuideSurface } from './guides';
