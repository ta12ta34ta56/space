import {
  getLetterform, flattenStroke, strokeLength,
  UPPERCASE, LOWERCASE, NUMERALS,
  ASCENDER, MIDLINE, BASELINE, DESCENDER,
  type Point,
} from './letterforms';

/**
 * Handwriting worksheet generator.
 *
 * Produces the *data* for a tracing page: where every guide line, dotted
 * letter, arrow and blank practice row sits. Rendering to fabric objects is
 * `renderer.ts`; this file stays pure so it can be unit-tested without a DOM.
 */

export type CaseMode = 'upper' | 'lower' | 'both' | 'numbers';
export type TraceStyle = 'dotted' | 'dashed' | 'outline' | 'solid-grey';

export interface HandwritingOptions {
  /** which characters to build pages for */
  charset: CaseMode;
  /** restrict to specific characters, e.g. only the child's name */
  only?: string[];
  /** rows of practice on each page */
  rows: number;
  /** how many traceable copies at the start of a row before it goes blank */
  tracePerRow: number;
  /** show numbered stroke-order arrows on the first letter */
  strokeArrows: boolean;
  /** show a start dot on each stroke */
  startDots: boolean;
  style: TraceStyle;
}

export const DEFAULT_OPTIONS: HandwritingOptions = {
  charset: 'upper',
  rows: 3,
  tracePerRow: 3,
  strokeArrows: true,
  startDots: true,
  style: 'dotted',
};

/** A single dash on a traced letter. */
export interface Dash {
  x1: number; y1: number; x2: number; y2: number;
}

/** One rendered glyph on the page, already in page points. */
export interface GlyphPlacement {
  char: string;
  left: number;
  top: number;
  width: number;
  height: number;
  /** dashes for the traced form; empty when the slot is blank practice */
  dashes: Dash[];
  /** continuous outline points, for 'outline' and 'solid-grey' styles */
  paths: Point[][];
  /** first point of each stroke, in page points */
  starts: Point[];
  /** direction of travel at the start of each stroke, for arrows */
  headings: number[];
  traced: boolean;
}

export interface PracticeRow {
  /** y of the four guides, in page points */
  ascender: number;
  midline: number;
  baseline: number;
  descender: number;
  glyphs: GlyphPlacement[];
}

export interface WorksheetPage {
  char: string;
  /** 'A a' when both cases are on one page */
  title: string;
  rows: PracticeRow[];
}

export interface GenerateResult {
  pages: WorksheetPage[];
  charset: string[];
}

/** Which characters this configuration covers, in teaching order. */
export function charactersFor(opts: HandwritingOptions): string[] {
  if (opts.only?.length) {
    return opts.only.filter((c) => getLetterform(c) !== null);
  }
  switch (opts.charset) {
    case 'upper': return [...UPPERCASE];
    case 'lower': return [...LOWERCASE];
    case 'numbers': return [...NUMERALS];
    case 'both': return [...UPPERCASE];
    default: return [...UPPERCASE];
  }
}

/**
 * Space dashes evenly ALONG the stroke, not along x.
 *
 * Spacing by x-coordinate looks fine on a horizontal bar and falls apart on a
 * diagonal or a curve — dashes bunch up where the line is steep. Walking the
 * polyline by arc length keeps the gap visually constant everywhere, which is
 * what makes a traced `O` look right.
 */
function dashesAlong(pts: Point[], dashLen: number, gapLen: number): Dash[] {
  const out: Dash[] = [];
  if (pts.length < 2) return out;

  const period = dashLen + gapLen;
  const EPS = 1e-9;

  // A dash frequently spans a polyline vertex. Emitting per-segment produces
  // two short pieces instead of one full dash — measured 17 of 92 dashes on a
  // capital O, which reads as uneven dotting. So a dash is held open across
  // vertices and only closed when the pen has travelled `dashLen`.
  let open: Dash | null = null;
  let carry = 0; // distance consumed within the current dash+gap period

  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen < EPS) continue;

    const at = (t: number): Point => ({
      x: a.x + (b.x - a.x) * (t / segLen),
      y: a.y + (b.y - a.y) * (t / segLen),
    });

    let t = 0;
    let guard = 0;
    while (t < segLen - EPS) {
      // Guard against a zero-length advance looping forever; an earlier
      // version of this function exhausted Node's heap that way.
      if (++guard > 100_000) break;

      const pos = carry % period;
      if (pos < dashLen - EPS) {
        const run = Math.max(EPS, Math.min(dashLen - pos, segLen - t));
        const p0 = at(t);
        const p1 = at(t + run);
        if (open) {
          open.x2 = p1.x;
          open.y2 = p1.y;
        } else {
          open = { x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y };
        }
        // dash complete?
        if (pos + run >= dashLen - EPS) {
          out.push(open);
          open = null;
        }
        t += run;
        carry += run;
      } else {
        const skip = Math.max(EPS, Math.min(period - pos, segLen - t));
        t += skip;
        carry += skip;
      }
    }
  }

  if (open) out.push(open);

  // Drop any sliver left at the very end of a path.
  const MIN = dashLen * 0.4;
  return out.filter((d) => Math.hypot(d.x2 - d.x1, d.y2 - d.y1) >= MIN);
}

/**
 * Build one glyph placement.
 *
 * `left/top` is the top-left of the letter's four-guide box; `height` spans
 * ascender to descender. Everything inside scales from the normalised form.
 */
export function placeGlyph(
  char: string,
  left: number,
  top: number,
  height: number,
  opts: Pick<HandwritingOptions, 'style'>,
  traced: boolean,
): GlyphPlacement | null {
  const form = getLetterform(char);
  if (!form) return null;

  const width = height * form.aspect;
  const toPage = (p: Point): Point => ({ x: left + p.x * width, y: top + p.y * height });

  const paths: Point[][] = [];
  const starts: Point[] = [];
  const headings: number[] = [];
  const dashes: Dash[] = [];

  // Dash geometry is in ABSOLUTE points, not a fraction of height.
  //
  // Scaling dashes with the letter keeps the count constant, so a 400pt letter
  // gets the same 95 dashes as a 50pt one — each 8x longer. That reads as a
  // dashed outline, not a dotted trace, and a child cannot follow it. Fixed
  // sizes mean a bigger letter simply gets more dots, which is correct.
  // Clamped so very small letters still show a few dots.
  const dashLen = Math.max(0.9, Math.min(3.2, height * 0.022));
  const gapLen = Math.max(1.1, Math.min(3.6, height * 0.026));

  for (const stroke of form.strokes) {
    const flat = flattenStroke(stroke).map(toPage);
    if (flat.length < 2) continue;
    paths.push(flat);
    starts.push(flat[0]);
    const a = flat[0];
    const b = flat[Math.min(3, flat.length - 1)];
    headings.push(Math.atan2(b.y - a.y, b.x - a.x));

    if (traced && (opts.style === 'dotted' || opts.style === 'dashed')) {
      const d = opts.style === 'dotted'
        ? dashesAlong(flat, dashLen * 0.45, gapLen * 1.15)
        : dashesAlong(flat, dashLen * 2.2, gapLen);
      dashes.push(...d);
    }
  }

  return { char, left, top, width, height, dashes, paths, starts, headings, traced };
}

export interface RowGeometry {
  left: number;
  width: number;
  top: number;
  /** ascender→descender height of the letters */
  height: number;
}

/**
 * Lay one practice row: N traced copies, then blanks for the rest of the width.
 *
 * Letters are NOT forced to a uniform cell. An `i` is narrow and a `w` is wide;
 * giving them equal cells leaves an `i` marooned in white space. Advance is the
 * glyph's own width plus a constant gap.
 */
export function buildRow(
  char: string,
  geo: RowGeometry,
  opts: HandwritingOptions,
): PracticeRow {
  const { left, width, top, height } = geo;
  const gap = height * 0.16;

  const glyphs: GlyphPlacement[] = [];
  let x = left;
  let index = 0;

  for (;;) {
    const probe = placeGlyph(char, x, top, height, opts, index < opts.tracePerRow);
    if (!probe) break;
    if (x + probe.width > left + width) break;
    glyphs.push(probe);
    x += probe.width + gap;
    index++;
    if (index > 40) break; // safety: never loop forever on a degenerate size
  }

  return {
    ascender: top + ASCENDER * height,
    midline: top + MIDLINE * height,
    baseline: top + BASELINE * height,
    descender: top + DESCENDER * height,
    glyphs,
  };
}

/** Everything needed to build the pages, without touching a canvas. */
export function generateWorksheets(
  opts: HandwritingOptions,
  area: { left: number; top: number; width: number; height: number },
  rowHeight: number,
  rowGap: number,
): GenerateResult {
  const chars = charactersFor(opts);
  const pages: WorksheetPage[] = [];

  for (const ch of chars) {
    const rows: PracticeRow[] = [];
    // 'both' puts the capital and its lowercase partner on the same sheet,
    // which is how the letter is actually taught.
    const rowChars = opts.charset === 'both'
      ? Array.from({ length: opts.rows }, (_, i) => (i % 2 === 0 ? ch : ch.toLowerCase()))
      : Array.from({ length: opts.rows }, () => ch);

    for (let r = 0; r < rowChars.length; r++) {
      const top = area.top + r * (rowHeight + rowGap);
      if (top + rowHeight > area.top + area.height) break;
      rows.push(buildRow(rowChars[r], {
        left: area.left, width: area.width, top, height: rowHeight,
      }, opts));
    }

    pages.push({
      char: ch,
      title: opts.charset === 'both' ? `${ch} ${ch.toLowerCase()}` : ch,
      rows,
    });
  }

  return { pages, charset: chars };
}

/** Rough pen distance for a character — used by tests to catch empty forms. */
export function totalStrokeLength(char: string): number {
  const form = getLetterform(char);
  if (!form) return 0;
  return form.strokes.reduce((sum, s) => sum + strokeLength(flattenStroke(s)), 0);
}

export { ASCENDER, MIDLINE, BASELINE, DESCENDER };
