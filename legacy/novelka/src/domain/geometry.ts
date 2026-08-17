import type {
  PageGeometry,
  PageSizeSpec,
  Margins,
  RectFrame,
  BleedInsets,
} from './types';

/** 1 inch = 72 points exactly. All internal layout math uses PDF points. */
export const POINTS_PER_INCH = 72;
export const IN = POINTS_PER_INCH;

/** KDP Bleed width on outer edges (0.125 in = 9 pt). */
export const BLEED_INCHES = 0.125;
export const BLEED_PT = BLEED_INCHES * IN; // 9 pt

/**
 * Validated standard and popular trim sizes in PDF points.
 */
export const VALIDATED_TRIM_SIZES: Record<string, PageSizeSpec> = {
  kdp6x9: {
    name: 'kdp6x9',
    label: '6 × 9 in',
    group: 'kdp',
    width: 6 * IN, // 432 pt
    height: 9 * IN, // 648 pt
    unit: 'pt',
  },
  kdp8x10: {
    name: 'kdp8x10',
    label: '8 × 10 in',
    group: 'kdp',
    width: 8 * IN, // 576 pt
    height: 10 * IN, // 720 pt
    unit: 'pt',
  },
  kdp85x11: {
    name: 'kdp85x11',
    label: '8.5 × 11 in',
    group: 'kdp',
    width: 8.5 * IN, // 612 pt
    height: 11 * IN, // 792 pt
    unit: 'pt',
  },
  A4: {
    name: 'A4',
    label: 'A4 (210 × 297 mm)',
    group: 'paper',
    width: 595, // standard 595.28 rounded for point grids
    height: 842, // standard 841.89
    unit: 'pt',
  },
  custom7x9: {
    name: 'custom7x9',
    label: '7 × 9 in (Custom)',
    group: 'custom',
    width: 7 * IN, // 504 pt
    height: 9 * IN, // 648 pt
    unit: 'pt',
  },
};

/** Gutter margin by page count bands according to Amazon KDP specifications. */
export const GUTTER_BANDS: { maxPages: number; inches: number }[] = [
  { maxPages: 150, inches: 0.375 },
  { maxPages: 300, inches: 0.5 },
  { maxPages: 500, inches: 0.625 },
  { maxPages: 700, inches: 0.75 },
  { maxPages: 828, inches: 0.875 },
];

/** Compute gutter width in PDF points from the total page count. */
export function gutterPtForPageCount(pageCount: number): number {
  const count = Math.max(24, pageCount);
  for (const band of GUTTER_BANDS) {
    if (count <= band.maxPages) {
      return band.inches * IN;
    }
  }
  return GUTTER_BANDS[GUTTER_BANDS.length - 1].inches * IN;
}

export interface ComputeGeometryOptions {
  width: number;
  height: number;
  pageNumber?: number;
  pageCount?: number;
  bleed?: boolean;
  intent?: 'safe' | 'minimum';
  customMargins?: Partial<Margins>;
}

/**
 * Pure calculation of PageGeometry (safe area, gutter, margins, recto/verso, trimBox).
 *
 * Recto (odd pageNumber):
 *   Gutter is on the LEFT edge. Outer margin is on the RIGHT edge.
 *   safeArea.left = gutter
 *   safeArea.width = pageWidth - gutter - outer
 *
 * Verso (even pageNumber):
 *   Gutter is on the RIGHT edge. Outer margin is on the LEFT edge.
 *   safeArea.left = outer
 *   safeArea.width = pageWidth - outer - gutter
 */
export function computePageGeometry(options: ComputeGeometryOptions): PageGeometry {
  const width = options.width;
  const height = options.height;
  const pageNumber = Math.max(1, options.pageNumber ?? 1);
  const pageCount = Math.max(24, options.pageCount ?? 100);
  const isBleed = !!options.bleed;
  const intent = options.intent ?? 'safe';
  const isRecto = pageNumber % 2 === 1;

  const gutterPt = options.customMargins?.gutter ?? gutterPtForPageCount(pageCount);

  const defaultOuterInches = isBleed
    ? 0.375
    : intent === 'safe'
      ? 0.375
      : 0.25;

  const outerPt = options.customMargins?.outer ?? defaultOuterInches * IN;
  const topPt = options.customMargins?.top ?? defaultOuterInches * IN;
  const bottomPt = options.customMargins?.bottom ?? defaultOuterInches * IN;

  const margins: Margins = {
    gutter: gutterPt,
    outer: outerPt,
    top: topPt,
    bottom: bottomPt,
    bleed: isBleed ? BLEED_PT : 0,
  };

  const leftMargin = isRecto ? gutterPt : outerPt;
  const rightMargin = isRecto ? outerPt : gutterPt;

  const safeArea: RectFrame = {
    left: leftMargin,
    top: topPt,
    width: Math.max(0, width - leftMargin - rightMargin),
    height: Math.max(0, height - topPt - bottomPt),
  };

  const bleedInsets: BleedInsets = {
    top: isBleed ? BLEED_PT : 0,
    bottom: isBleed ? BLEED_PT : 0,
    outer: isBleed ? BLEED_PT : 0,
    inner: 0, // KDP does not bleed into the gutter/spine
  };

  const trimBox: RectFrame = {
    left: isBleed ? (isRecto ? 0 : BLEED_PT) : 0,
    top: isBleed ? BLEED_PT : 0,
    width: isBleed ? Math.max(0, width - BLEED_PT) : width,
    height: isBleed ? Math.max(0, height - BLEED_PT * 2) : height,
  };

  return {
    width,
    height,
    pageNumber,
    pageCount,
    isRecto,
    margins,
    safeArea,
    bleed: bleedInsets,
    trimBox,
  };
}

/** Helper to construct PageGeometry from a validated trim size name. */
export function getGeometryForPreset(
  presetKey: keyof typeof VALIDATED_TRIM_SIZES | string,
  pageNumber = 1,
  pageCount = 100,
  options: Omit<ComputeGeometryOptions, 'width' | 'height' | 'pageNumber' | 'pageCount'> = {},
): PageGeometry {
  const preset = VALIDATED_TRIM_SIZES[presetKey] ?? VALIDATED_TRIM_SIZES.kdp6x9;
  return computePageGeometry({
    width: preset.width,
    height: preset.height,
    pageNumber,
    pageCount,
    ...options,
  });
}
