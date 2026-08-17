import { IN } from '../types/canvas.types';

/**
 * Amazon KDP print specification engine.
 *
 * Canonical unit rule for this app:
 *   - KDP publishes dimensions in inches.
 *   - PDF pages are measured in points.
 *   - Fabric canvas coordinates are treated as PDF points.
 *   - 1 inch === 72 points exactly.
 */

export const POINTS_PER_INCH = IN;
export const KDP_DIMENSION_TOLERANCE_PT = 0.5; // Word's 0.125" -> 0.13" rounding is 0.36pt.
export const KDP_MIN_IMAGE_DPI = 300;
export const KDP_RECOMMENDED_MAX_IMAGE_DPI = 600;
export const KDP_MIN_LINE_WIDTH_PT = 0.75;

export const KDP_MIN_PAGE_COUNT = 24;
export const KDP_MAX_PAGE_COUNT = 828;

/** Bleed, when artwork must run off the edge. Applied to top/bottom/outside. */
export const BLEED_IN = 0.125;

/** Top/bottom/outside margins. With bleed, KDP's margin value includes bleed. */
export const OUTER_MARGIN_MIN_IN = 0.25;
export const OUTER_MARGIN_WITH_BLEED_MIN_IN = 0.375;
export const OUTER_MARGIN_SAFE_IN = 0.375;

export type KdpBleed = 'none' | 'bleed';
export type KdpBleedOption = KdpBleed | 'auto';
export type KdpMarginIntent = 'minimum' | 'safe';
export type KdpInteriorPaper =
  | 'bw-white'
  | 'bw-cream'
  | 'bw-groundwood'
  | 'standard-color'
  | 'premium-color';

export interface KdpPageCountLimit {
  min: number;
  max: number;
}

export interface KdpTrimSize {
  id: string;
  label: string;
  widthIn: number;
  heightIn: number;
  /** Page-count limits by KDP interior/paper choice. `null` means unavailable. */
  limits: Record<KdpInteriorPaper, KdpPageCountLimit | null>;
}

const L = (max: number, min = KDP_MIN_PAGE_COUNT): KdpPageCountLimit => ({ min, max });
const standardLimits = (maxBw = 828, maxCream = 776, maxGroundwood = 812, maxPremium = 828) => ({
  'bw-white': L(maxBw),
  'bw-cream': L(maxCream),
  'bw-groundwood': L(maxGroundwood),
  'standard-color': L(600, 72),
  'premium-color': L(maxPremium),
}) satisfies Record<KdpInteriorPaper, KdpPageCountLimit | null>;

/** KDP US paperback trim sizes, exact inches from KDP's trim-size table. */
export const KDP_TRIM_SIZES: KdpTrimSize[] = [
  { id: '5x8', label: '5 × 8 in', widthIn: 5, heightIn: 8, limits: standardLimits() },
  { id: '5.06x7.81', label: '5.06 × 7.81 in', widthIn: 5.06, heightIn: 7.81, limits: standardLimits() },
  { id: '5.25x8', label: '5.25 × 8 in', widthIn: 5.25, heightIn: 8, limits: standardLimits() },
  { id: '5.5x8.5', label: '5.5 × 8.5 in', widthIn: 5.5, heightIn: 8.5, limits: standardLimits() },
  { id: '6x9', label: '6 × 9 in', widthIn: 6, heightIn: 9, limits: standardLimits() },
  { id: '6.14x9.21', label: '6.14 × 9.21 in', widthIn: 6.14, heightIn: 9.21, limits: standardLimits() },
  { id: '6.69x9.61', label: '6.69 × 9.61 in', widthIn: 6.69, heightIn: 9.61, limits: standardLimits() },
  { id: '7x10', label: '7 × 10 in', widthIn: 7, heightIn: 10, limits: standardLimits() },
  { id: '7.44x9.69', label: '7.44 × 9.69 in', widthIn: 7.44, heightIn: 9.69, limits: standardLimits() },
  { id: '7.5x9.25', label: '7.5 × 9.25 in', widthIn: 7.5, heightIn: 9.25, limits: standardLimits() },
  { id: '8x10', label: '8 × 10 in', widthIn: 8, heightIn: 10, limits: standardLimits() },
  { id: '8.25x6', label: '8.25 × 6 in', widthIn: 8.25, heightIn: 6, limits: standardLimits(800, 750, 784, 800) },
  { id: '8.25x8.25', label: '8.25 × 8.25 in', widthIn: 8.25, heightIn: 8.25, limits: standardLimits(800, 750, 784, 800) },
  { id: '8.5x8.5', label: '8.5 × 8.5 in', widthIn: 8.5, heightIn: 8.5, limits: standardLimits(590, 550, 578, 590) },
  { id: '8.5x11', label: '8.5 × 11 in', widthIn: 8.5, heightIn: 11, limits: standardLimits(590, 550, 578, 590) },
  {
    id: '8.27x11.69',
    label: '8.27 × 11.69 in / A4',
    widthIn: 8.27,
    heightIn: 11.69,
    limits: {
      'bw-white': L(780),
      'bw-cream': L(730),
      'bw-groundwood': L(764),
      'standard-color': null,
      'premium-color': L(590),
    },
  },
];

/** Back-compat tuple export. Prefer KDP_TRIM_SIZES for new code. */
export const KDP_TRIM_SIZES_IN: [number, number][] = KDP_TRIM_SIZES.map((s) => [s.widthIn, s.heightIn]);

export const inchesToPt = (inches: number): number => inches * IN;
export const ptToInches = (pt: number): number => pt / IN;

function finite(n: unknown, fallback = 0): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function within(actual: number, expected: number, tolerancePt: number): boolean {
  return Math.abs(actual - expected) <= tolerancePt;
}

function printedPageCount(pageCount: number): number {
  const n = Math.max(0, Math.floor(finite(pageCount)));
  return n % 2 === 0 ? n : n + 1;
}

export function kdpPrintedPageCount(pageCount: number): number {
  return printedPageCount(pageCount);
}

/** Inside (gutter) margin grows with page count — the spine eats more paper. */
export const GUTTER_BY_PAGE_COUNT: { max: number; inches: number }[] = [
  { max: 150, inches: 0.375 },
  { max: 300, inches: 0.5 },
  { max: 500, inches: 0.625 },
  { max: 700, inches: 0.75 },
  { max: 828, inches: 0.875 },
];

export interface KdpMargins {
  /** points */
  gutter: number;
  outer: number;
  top: number;
  bottom: number;
  bleed: number;
  gutterInches: number;
  outerInches: number;
  topInches: number;
  bottomInches: number;
  bleedInches: number;
}

export interface KdpMarginOptions {
  bleed?: boolean;
  intent?: KdpMarginIntent;
}

export function gutterInchesFor(pageCount: number): number {
  const effectiveCount = Math.max(KDP_MIN_PAGE_COUNT, printedPageCount(pageCount));
  for (const band of GUTTER_BY_PAGE_COUNT) {
    if (effectiveCount <= band.max) return band.inches;
  }
  return GUTTER_BY_PAGE_COUNT[GUTTER_BY_PAGE_COUNT.length - 1].inches;
}

export function kdpMarginsFor(
  pageCount: number,
  generousOrOptions: boolean | KdpMarginOptions = true,
): KdpMargins {
  const opts: KdpMarginOptions =
    typeof generousOrOptions === 'boolean'
      ? { intent: generousOrOptions ? 'safe' : 'minimum', bleed: false }
      : generousOrOptions;
  const bleed = !!opts.bleed;
  const intent = opts.intent ?? 'safe';
  const gutterInches = gutterInchesFor(pageCount);
  const outerInches = bleed
    ? OUTER_MARGIN_WITH_BLEED_MIN_IN
    : intent === 'safe'
      ? OUTER_MARGIN_SAFE_IN
      : OUTER_MARGIN_MIN_IN;
  const topInches = bleed ? OUTER_MARGIN_WITH_BLEED_MIN_IN : outerInches;
  const bottomInches = topInches;
  return {
    gutter: inchesToPt(gutterInches),
    outer: inchesToPt(outerInches),
    top: inchesToPt(topInches),
    bottom: inchesToPt(bottomInches),
    bleed: inchesToPt(BLEED_IN),
    gutterInches,
    outerInches,
    topInches,
    bottomInches,
    bleedInches: BLEED_IN,
  };
}

export interface KdpRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface KdpSafeArea extends KdpRect {
  isRecto: boolean;
}

/**
 * The rectangle protected content must stay inside, for a given LTR page.
 * Odd pages are right-hand/recto, so their gutter is on the LEFT.
 */
export function safeAreaFor(
  pageWidth: number,
  pageHeight: number,
  pageNumber: number,
  m: KdpMargins,
): KdpSafeArea {
  const isRecto = pageNumber % 2 === 1;
  const left = isRecto ? m.gutter : m.outer;
  const right = isRecto ? m.outer : m.gutter;
  return {
    left,
    top: m.top,
    width: Math.max(0, pageWidth - left - right),
    height: Math.max(0, pageHeight - m.top - m.bottom),
    isRecto,
  };
}

export function kdpPageSizeForTrim(
  trimWidthPt: number,
  trimHeightPt: number,
  bleed: boolean,
): { width: number; height: number } {
  return {
    width: trimWidthPt + (bleed ? inchesToPt(BLEED_IN) : 0),
    height: trimHeightPt + (bleed ? inchesToPt(BLEED_IN * 2) : 0),
  };
}

export interface KdpTrimBox extends KdpRect {
  isRecto: boolean;
  bleed: boolean;
  outerBleed: number;
  topBleed: number;
  bottomBleed: number;
}

/** Final trim rectangle inside a submitted PDF page. */
export function trimBoxForPage(
  pageWidth: number,
  pageHeight: number,
  pageNumber: number,
  bleed: boolean,
): KdpTrimBox {
  const isRecto = pageNumber % 2 === 1;
  if (!bleed) {
    return {
      left: 0,
      top: 0,
      width: pageWidth,
      height: pageHeight,
      isRecto,
      bleed: false,
      outerBleed: 0,
      topBleed: 0,
      bottomBleed: 0,
    };
  }
  const b = inchesToPt(BLEED_IN);
  return {
    // LTR: odd/recto pages bleed on the right outside edge; even/verso on left.
    left: isRecto ? 0 : b,
    top: b,
    width: Math.max(0, pageWidth - b),
    height: Math.max(0, pageHeight - b * 2),
    isRecto,
    bleed: true,
    outerBleed: b,
    topBleed: b,
    bottomBleed: b,
  };
}

export interface KdpPageSizeMatch {
  trim: KdpTrimSize;
  bleed: KdpBleed;
  expectedWidth: number;
  expectedHeight: number;
}

export function matchKdpPageSize(
  widthPt: number,
  heightPt: number,
  options: { bleed?: KdpBleedOption; tolerancePt?: number } = {},
): KdpPageSizeMatch | null {
  const bleed = options.bleed ?? 'none';
  const tolerancePt = options.tolerancePt ?? KDP_DIMENSION_TOLERANCE_PT;
  const modes: KdpBleed[] = bleed === 'auto' ? ['none', 'bleed'] : [bleed];

  for (const trim of KDP_TRIM_SIZES) {
    for (const mode of modes) {
      const expected = kdpPageSizeForTrim(inchesToPt(trim.widthIn), inchesToPt(trim.heightIn), mode === 'bleed');
      if (within(widthPt, expected.width, tolerancePt) && within(heightPt, expected.height, tolerancePt)) {
        return { trim, bleed: mode, expectedWidth: expected.width, expectedHeight: expected.height };
      }
    }
  }
  return null;
}

/** Is this exact submitted page size one KDP accepts without bleed? */
export function isKdpTrim(widthPt: number, heightPt: number, tol = KDP_DIMENSION_TOLERANCE_PT): boolean {
  return !!matchKdpPageSize(widthPt, heightPt, { bleed: 'none', tolerancePt: tol });
}

export interface KdpIssue {
  level: 'error' | 'warn';
  message: string;
  code?: string;
}

export interface KdpPreflightOptions {
  /** auto = infer from page dimensions. */
  bleed?: KdpBleedOption | boolean;
  /** Raster export DPI. KDP print PDFs must be 300+. */
  dpi?: number;
  /** Used for trim-specific min/max page-count checks. */
  paper?: KdpInteriorPaper;
  /** Override if the project stores cover/interior separately. */
  pageCount?: number;
  tolerancePt?: number;
}

type PreflightPage = { width: number; height: number; data: unknown; role?: string };
type AnyObj = Record<string, unknown>;

function isKdpMargins(v: unknown): v is KdpMargins {
  return !!v && typeof v === 'object' && 'gutter' in v && 'outer' in v && 'top' in v;
}

function objectType(o: AnyObj): string {
  return String(o.type ?? '').toLowerCase();
}

function isTextObject(o: AnyObj): boolean {
  const type = objectType(o);
  return type === 'text' || type === 'i-text' || type === 'textbox' || typeof o.text === 'string';
}

function isVisible(o: AnyObj): boolean {
  return o.visible !== false && o.opacity !== 0;
}

function expandRect(r: KdpRect, n: number): KdpRect {
  return { left: r.left - n, top: r.top - n, width: r.width + n * 2, height: r.height + n * 2 };
}

function rightOf(r: KdpRect): number { return r.left + r.width; }
function bottomOf(r: KdpRect): number { return r.top + r.height; }

function outside(inner: KdpRect, outer: KdpRect, tolerance = 0): boolean {
  return (
    inner.left < outer.left - tolerance ||
    inner.top < outer.top - tolerance ||
    rightOf(inner) > rightOf(outer) + tolerance ||
    bottomOf(inner) > bottomOf(outer) + tolerance
  );
}

function touchesPageEdge(bounds: KdpRect, page: KdpRect, tolerance = 1): boolean {
  return (
    bounds.left <= page.left + tolerance ||
    bounds.top <= page.top + tolerance ||
    rightOf(bounds) >= rightOf(page) - tolerance ||
    bottomOf(bounds) >= bottomOf(page) - tolerance
  );
}

function crossesTrim(bounds: KdpRect, trim: KdpRect, tolerance = 0): boolean {
  return outside(bounds, trim, tolerance);
}

export function serializedObjectBounds(o: AnyObj): KdpRect {
  const left = finite(o.left);
  const top = finite(o.top);
  const scaleX = finite(o.scaleX, 1);
  const scaleY = finite(o.scaleY, 1);
  const width = Math.abs(finite(o.width) * scaleX);
  const height = Math.abs(finite(o.height) * scaleY);
  const originX = String(o.originX ?? 'left');
  const originY = String(o.originY ?? 'top');
  const originOffsetX = originX === 'center' ? width / 2 : originX === 'right' ? width : 0;
  const originOffsetY = originY === 'center' ? height / 2 : originY === 'bottom' ? height : 0;
  const angle = finite(o.angle) * Math.PI / 180;
  const strokePad = Math.max(0, finite(o.strokeWidth) * Math.max(Math.abs(scaleX), Math.abs(scaleY)) / 2);

  if (!angle) {
    return expandRect({ left: left - originOffsetX, top: top - originOffsetY, width, height }, strokePad);
  }

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const corners = [
    [-originOffsetX, -originOffsetY],
    [width - originOffsetX, -originOffsetY],
    [width - originOffsetX, height - originOffsetY],
    [-originOffsetX, height - originOffsetY],
  ].map(([x, y]) => ({ x: left + x * cos - y * sin, y: top + x * sin + y * cos }));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return expandRect({ left: minX, top: minY, width: Math.max(...xs) - minX, height: Math.max(...ys) - minY }, strokePad);
}

function fabricObjects(data: unknown): AnyObj[] {
  const raw = ((data as { objects?: unknown[] } | null)?.objects ?? []) as AnyObj[];
  return raw.filter((o) => o && typeof o === 'object' && isVisible(o));
}

function issue(issues: KdpIssue[], level: KdpIssue['level'], code: string, message: string) {
  if (!issues.some((i) => i.code === code && i.message === message)) {
    issues.push({ level, code, message });
  }
}

/** Pre-flight a document against KDP's paperback interior rules. */
export function preflight(
  all: PreflightPage[],
  legacyMarginsOrOptions?: KdpMargins | KdpPreflightOptions,
  maybeOptions: KdpPreflightOptions = {},
): KdpIssue[] {
  const issues: KdpIssue[] = [];
  const options: KdpPreflightOptions = isKdpMargins(legacyMarginsOrOptions)
    ? maybeOptions
    : { ...(legacyMarginsOrOptions ?? {}), ...maybeOptions };

  // The wraparound cover is submitted as its own file — check the interior only.
  const pages = all.filter((p) => p.role !== 'cover');
  if (!pages.length) return issues;

  const tolerancePt = options.tolerancePt ?? KDP_DIMENSION_TOLERANCE_PT;
  const first = pages[0];
  const autoMatch = matchKdpPageSize(first.width, first.height, { bleed: 'auto', tolerancePt });
  const requestedBleed = typeof options.bleed === 'boolean'
    ? (options.bleed ? 'bleed' : 'none')
    : (options.bleed ?? 'auto');
  const bleed: KdpBleed = requestedBleed === 'auto' ? (autoMatch?.bleed ?? 'none') : requestedBleed;
  const sizeMatch = matchKdpPageSize(first.width, first.height, { bleed, tolerancePt });
  const anySizeMatch = sizeMatch ?? autoMatch;

  if (!sizeMatch) {
    const suffix = bleed === 'bleed' ? ' with KDP bleed added' : '';
    issue(
      issues,
      'error',
      'kdp-size',
      `${ptToInches(first.width).toFixed(3)}" × ${ptToInches(first.height).toFixed(3)}" is not a valid KDP ${bleed === 'bleed' ? 'bleed page size' : 'trim size'}${suffix}.`,
    );
  }

  const expectedWidth = anySizeMatch?.expectedWidth ?? first.width;
  const expectedHeight = anySizeMatch?.expectedHeight ?? first.height;
  const mixed = pages.some(
    (p) => !within(p.width, expectedWidth, tolerancePt) || !within(p.height, expectedHeight, tolerancePt),
  );
  if (mixed) {
    issue(issues, 'error', 'mixed-page-size', 'Pages are not all the same KDP page size — upload one trim size per interior PDF.');
  }

  const declaredCount = options.pageCount ?? pages.length;
  const printedCount = printedPageCount(declaredCount);
  if (pages.length % 2 === 1) {
    issue(issues, 'warn', 'odd-page-count', `${pages.length} interior pages — KDP will round the printed count up to ${printedCount}.`);
  }

  const paper = options.paper ?? 'bw-white';
  const limits = anySizeMatch ? anySizeMatch.trim.limits[paper] : L(KDP_MAX_PAGE_COUNT);
  if (limits === null) {
    issue(issues, 'error', 'paper-unavailable', `${anySizeMatch?.trim.label ?? 'This trim size'} is not available for ${paper}.`);
  } else {
    if (printedCount < limits.min) {
      issue(issues, 'error', 'too-few-pages', `${pages.length} pages — KDP requires at least ${limits.min} pages for this interior/paper choice.`);
    }
    if (printedCount > limits.max) {
      issue(issues, 'error', 'too-many-pages', `${printedCount} printed pages — KDP allows at most ${limits.max} pages for ${anySizeMatch?.trim.label ?? 'this trim size'} with ${paper}.`);
    }
  }

  if (options.dpi !== undefined && options.dpi < KDP_MIN_IMAGE_DPI) {
    issue(issues, 'error', 'dpi-low', `${options.dpi} DPI export selected — KDP print images must be at least ${KDP_MIN_IMAGE_DPI} DPI.`);
  }
  if (options.dpi !== undefined && options.dpi > KDP_RECOMMENDED_MAX_IMAGE_DPI) {
    issue(issues, 'warn', 'dpi-high', `${options.dpi} DPI export selected — KDP recommends keeping images at or below ${KDP_RECOMMENDED_MAX_IMAGE_DPI} DPI to avoid processing delays.`);
  }

  let textUnsafePages = 0;
  let nonTextUnsafePages = 0;
  let noBleedEdgePages = 0;
  let thinLinePages = 0;

  pages.forEach((p, i) => {
    const pageNumber = i + 1;
    const margins = kdpMarginsFor(printedCount, { bleed: bleed === 'bleed', intent: 'minimum' });
    const safe = safeAreaFor(p.width, p.height, pageNumber, margins);
    const pageRect = { left: 0, top: 0, width: p.width, height: p.height };
    const trim = trimBoxForPage(p.width, p.height, pageNumber, bleed === 'bleed');

    let textUnsafe = false;
    let nonTextUnsafe = false;
    let noBleedEdge = false;
    let thinLine = false;

    const pageData = p.data as Record<string, unknown> | null;
    if (pageData?.invalidForProduction === true || pageData?.ok === false) {
      issue(
        issues,
        'error',
        'invalid-layout',
        `Page ${pageNumber} has layout constraint failures (marked invalid for production).`,
      );
    }

    for (const o of fabricObjects(p.data)) {
      const bounds = serializedObjectBounds(o);
      const text = isTextObject(o);
      const outsideSafe = outside(bounds, safe, 1);
      const outsidePage = outside(bounds, pageRect, 0.5);
      const crossesFinalTrim = crossesTrim(bounds, trim, 0.5);
      const stroke = typeof o.stroke === 'string' && o.stroke !== '' && o.stroke !== 'transparent';
      const strokeWidth = finite(o.strokeWidth);

      if (stroke && strokeWidth > 0 && strokeWidth < KDP_MIN_LINE_WIDTH_PT) thinLine = true;
      if (outsidePage) {
        if (text) textUnsafe = true;
        else nonTextUnsafe = true;
        continue;
      }
      if (text && outsideSafe) {
        textUnsafe = true;
        continue;
      }
      if (!text && outsideSafe) {
        if (bleed === 'none' && (touchesPageEdge(bounds, pageRect, 1) || crossesFinalTrim)) noBleedEdge = true;
        else if (!(bleed === 'bleed' && crossesFinalTrim)) nonTextUnsafe = true;
      }
    }

    if (textUnsafe) textUnsafePages++;
    if (nonTextUnsafe) nonTextUnsafePages++;
    if (noBleedEdge) noBleedEdgePages++;
    if (thinLine) thinLinePages++;
  });

  if (textUnsafePages) {
    issue(issues, 'error', 'text-outside-safe', `${textUnsafePages} page${textUnsafePages === 1 ? ' has' : 's have'} text outside the KDP safe area. Text must stay inside margins.`);
  }
  if (noBleedEdgePages) {
    issue(issues, 'error', 'edge-art-no-bleed', `${noBleedEdgePages} page${noBleedEdgePages === 1 ? ' has' : 's have'} edge-to-edge artwork but the interior is not sized for KDP bleed.`);
  }
  if (nonTextUnsafePages) {
    issue(issues, 'warn', 'art-outside-safe', `${nonTextUnsafePages} page${nonTextUnsafePages === 1 ? ' has' : 's have'} non-text artwork outside the safe area. This is acceptable only for intentional bleed/background art.`);
  }
  if (thinLinePages) {
    issue(issues, 'warn', 'thin-lines', `${thinLinePages} page${thinLinePages === 1 ? ' has' : 's have'} lines thinner than KDP's 0.75pt minimum.`);
  }

  return issues;
}
