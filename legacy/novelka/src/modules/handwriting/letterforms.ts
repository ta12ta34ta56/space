/**
 * Letterform geometry for tracing worksheets.
 *
 * ## Why not just render text?
 *
 * A traced letter needs three things a text glyph cannot give us:
 *
 *  1. **Stroke order and direction.** A child must learn that `A` is two
 *     diagonals then a crossbar, drawn top-down. A font is a filled outline
 *     with no notion of "first" or "second".
 *  2. **A centre line, not an outline.** Tracing follows the skeleton of a
 *     letter. Rendering a font at low opacity makes the child trace the *edge*
 *     of a thick shape, which teaches the wrong motion.
 *  3. **Dotted rendering at any size.** Dashes must stay evenly spaced whether
 *     the letter is 40pt or 400pt.
 *
 * So each letter is stored as an ordered list of strokes in a normalised
 * 0..1 box, and the renderer scales them onto the four ruled guide lines.
 *
 * ## Coordinate system
 *
 * x: 0 = left edge of the letter cell, 1 = right edge
 * y: 0 = ASCENDER line (top), 1 = DESCENDER line (bottom)
 *
 * The four standard handwriting guides sit at fixed fractions:
 *
 *   0.00  ascender   — top of b d f h k l, and all capitals
 *   0.25  midline    — top of x-height letters (a c e m n o r s u v w x z)
 *   0.75  baseline   — where letters sit
 *   1.00  descender  — bottom of g j p q y
 *
 * Those numbers are the whole reason `p` and `b` come out the right shape:
 * both are a stem plus a bowl, but the stem runs 0→0.75 for `b` and 0.25→1.0
 * for `p`.
 */

export interface Point {
  x: number;
  y: number;
}

/**
 * One pen stroke, drawn in order.
 *
 * `kind` decides how the points are interpreted:
 *   - `line`  polyline through every point
 *   - `curve` quadratic path: [start, control, end, control, end, …]
 *   - `arc`   ellipse arc: needs `cx cy rx ry` plus start/end angles
 */
export interface Stroke {
  kind: 'line' | 'curve' | 'arc';
  points: Point[];
  /** for arcs, in degrees, 0 = 3 o'clock, sweeping clockwise */
  from?: number;
  to?: number;
  cx?: number;
  cy?: number;
  rx?: number;
  ry?: number;
}

export interface Letterform {
  strokes: Stroke[];
  /** width of the letter as a fraction of its height — `i` is narrow, `w` wide */
  aspect: number;
}

const L = (...pts: [number, number][]): Stroke => ({
  kind: 'line',
  points: pts.map(([x, y]) => ({ x, y })),
});

const C = (...pts: [number, number][]): Stroke => ({
  kind: 'curve',
  points: pts.map(([x, y]) => ({ x, y })),
});

const A = (cx: number, cy: number, rx: number, ry: number, from: number, to: number): Stroke => ({
  kind: 'arc',
  points: [],
  cx, cy, rx, ry, from, to,
});

// Guide-line positions, as documented above.
export const ASCENDER = 0.0;
export const MIDLINE = 0.25;
export const BASELINE = 0.75;
export const DESCENDER = 1.0;

const XH = BASELINE - MIDLINE; // x-height span = 0.5
const CAP = BASELINE - ASCENDER; // capital span = 0.75

// ---------------------------------------------------------------- uppercase

const UPPER: Record<string, Letterform> = {
  A: { aspect: 0.72, strokes: [
    L([0.08, BASELINE], [0.5, ASCENDER]),
    L([0.5, ASCENDER], [0.92, BASELINE]),
    L([0.22, BASELINE - CAP * 0.32], [0.78, BASELINE - CAP * 0.32]),
  ] },
  B: { aspect: 0.66, strokes: [
    L([0.15, ASCENDER], [0.15, BASELINE]),
    C([0.15, ASCENDER], [0.78, ASCENDER + CAP * 0.02], [0.72, ASCENDER + CAP * 0.24],
      [0.66, ASCENDER + CAP * 0.44], [0.15, ASCENDER + CAP * 0.46]),
    C([0.15, ASCENDER + CAP * 0.46], [0.88, ASCENDER + CAP * 0.5], [0.8, BASELINE - CAP * 0.02],
      [0.7, BASELINE + 0.005], [0.15, BASELINE]),
  ] },
  C: { aspect: 0.68, strokes: [
    // Screen coords: y grows downward, so 270deg is the TOP of the ellipse and
    // 90deg the bottom. A capital C opens to the right: sweep from -35deg
    // (lower right) back through 90 (bottom), 180 (left) and 270 (top) to
    // 325deg. Sweeping the other way misses the apex and the letter sits short
    // of the ascender.
    A(0.5, ASCENDER + CAP / 2, 0.38, CAP / 2, 325, 35),
  ] },
  D: { aspect: 0.70, strokes: [
    L([0.15, ASCENDER], [0.15, BASELINE]),
    C([0.15, ASCENDER], [0.92, ASCENDER + CAP * 0.06], [0.88, ASCENDER + CAP * 0.5],
      [0.84, BASELINE - CAP * 0.06], [0.15, BASELINE]),
  ] },
  E: { aspect: 0.60, strokes: [
    L([0.16, ASCENDER], [0.16, BASELINE]),
    L([0.16, ASCENDER], [0.78, ASCENDER]),
    L([0.16, ASCENDER + CAP * 0.48], [0.66, ASCENDER + CAP * 0.48]),
    L([0.16, BASELINE], [0.78, BASELINE]),
  ] },
  F: { aspect: 0.58, strokes: [
    L([0.16, ASCENDER], [0.16, BASELINE]),
    L([0.16, ASCENDER], [0.78, ASCENDER]),
    L([0.16, ASCENDER + CAP * 0.46], [0.66, ASCENDER + CAP * 0.46]),
  ] },
  G: { aspect: 0.72, strokes: [
    A(0.5, ASCENDER + CAP / 2, 0.38, CAP / 2, 325, 35),
    // The bar starts ON the arc's end point (0.811, 0.590), goes in to the
    // centre, then up. Starting at x=0.88 left it detached, floating in space.
    L([0.811, ASCENDER + CAP * 0.787], [0.811, ASCENDER + CAP * 0.52]),
    L([0.811, ASCENDER + CAP * 0.52], [0.56, ASCENDER + CAP * 0.52]),
  ] },
  H: { aspect: 0.70, strokes: [
    L([0.16, ASCENDER], [0.16, BASELINE]),
    L([0.84, ASCENDER], [0.84, BASELINE]),
    L([0.16, ASCENDER + CAP * 0.5], [0.84, ASCENDER + CAP * 0.5]),
  ] },
  I: { aspect: 0.34, strokes: [
    L([0.5, ASCENDER], [0.5, BASELINE]),
    L([0.22, ASCENDER], [0.78, ASCENDER]),
    L([0.22, BASELINE], [0.78, BASELINE]),
  ] },
  J: { aspect: 0.50, strokes: [
    L([0.68, ASCENDER], [0.68, BASELINE - CAP * 0.18]),
    C([0.68, BASELINE - CAP * 0.18], [0.68, BASELINE + 0.02], [0.42, BASELINE + 0.01],
      [0.18, BASELINE], [0.18, BASELINE - CAP * 0.22]),
  ] },
  K: { aspect: 0.68, strokes: [
    L([0.16, ASCENDER], [0.16, BASELINE]),
    L([0.82, ASCENDER], [0.16, ASCENDER + CAP * 0.55]),
    L([0.38, ASCENDER + CAP * 0.4], [0.86, BASELINE]),
  ] },
  L: { aspect: 0.56, strokes: [
    L([0.18, ASCENDER], [0.18, BASELINE]),
    L([0.18, BASELINE], [0.8, BASELINE]),
  ] },
  // Four taught strokes: up, down-diagonal, up-diagonal, down. Written as one
  // polyline it rendered as a flat bar, because the renderer joins a stroke's
  // points and the first and last both sat on the baseline.
  M: { aspect: 0.84, strokes: [
    L([0.12, BASELINE], [0.12, ASCENDER]),
    L([0.12, ASCENDER], [0.5, ASCENDER + CAP * 0.66]),
    L([0.5, ASCENDER + CAP * 0.66], [0.88, ASCENDER]),
    L([0.88, ASCENDER], [0.88, BASELINE]),
  ] },
  N: { aspect: 0.72, strokes: [
    L([0.16, BASELINE], [0.16, ASCENDER]),
    L([0.16, ASCENDER], [0.84, BASELINE]),
    L([0.84, BASELINE], [0.84, ASCENDER]),
  ] },
  O: { aspect: 0.80, strokes: [
    A(0.5, ASCENDER + CAP / 2, 0.40, CAP / 2, 90, 450),
  ] },
  P: { aspect: 0.62, strokes: [
    L([0.16, ASCENDER], [0.16, BASELINE]),
    C([0.16, ASCENDER], [0.86, ASCENDER + CAP * 0.02], [0.8, ASCENDER + CAP * 0.26],
      [0.74, ASCENDER + CAP * 0.5], [0.16, ASCENDER + CAP * 0.52]),
  ] },
  Q: { aspect: 0.80, strokes: [
    A(0.5, ASCENDER + CAP / 2, 0.40, CAP / 2, 90, 450),
    L([0.62, BASELINE - CAP * 0.2], [0.9, BASELINE + CAP * 0.08]),
  ] },
  R: { aspect: 0.68, strokes: [
    L([0.16, ASCENDER], [0.16, BASELINE]),
    C([0.16, ASCENDER], [0.84, ASCENDER + CAP * 0.02], [0.78, ASCENDER + CAP * 0.24],
      [0.72, ASCENDER + CAP * 0.48], [0.16, ASCENDER + CAP * 0.5]),
    L([0.44, ASCENDER + CAP * 0.5], [0.86, BASELINE]),
  ] },
  S: { aspect: 0.62, strokes: [
    C([0.82, ASCENDER + CAP * 0.16], [0.7, ASCENDER - 0.01], [0.42, ASCENDER + 0.005],
      [0.14, ASCENDER + 0.02], [0.18, ASCENDER + CAP * 0.42],
      [0.24, ASCENDER + CAP * 0.62], [0.78, ASCENDER + CAP * 0.5],
      [0.9, ASCENDER + CAP * 0.78], [0.5, BASELINE + 0.005],
      [0.22, BASELINE + 0.01], [0.16, BASELINE - CAP * 0.16]),
  ] },
  T: { aspect: 0.64, strokes: [
    L([0.12, ASCENDER], [0.88, ASCENDER]),
    L([0.5, ASCENDER], [0.5, BASELINE]),
  ] },
  U: { aspect: 0.72, strokes: [
    C([0.16, ASCENDER], [0.16, BASELINE - CAP * 0.16], [0.5, BASELINE],
      [0.84, BASELINE - CAP * 0.16], [0.84, ASCENDER]),
  ] },
  V: { aspect: 0.72, strokes: [
    L([0.12, ASCENDER], [0.5, BASELINE]),
    L([0.5, BASELINE], [0.88, ASCENDER]),
  ] },
  W: { aspect: 0.96, strokes: [
    L([0.06, ASCENDER], [0.28, BASELINE]),
    L([0.28, BASELINE], [0.5, ASCENDER + CAP * 0.42]),
    L([0.5, ASCENDER + CAP * 0.42], [0.72, BASELINE]),
    L([0.72, BASELINE], [0.94, ASCENDER]),
  ] },
  X: { aspect: 0.70, strokes: [
    L([0.14, ASCENDER], [0.86, BASELINE]),
    L([0.86, ASCENDER], [0.14, BASELINE]),
  ] },
  Y: { aspect: 0.70, strokes: [
    L([0.14, ASCENDER], [0.5, ASCENDER + CAP * 0.52]),
    L([0.86, ASCENDER], [0.5, ASCENDER + CAP * 0.52]),
    L([0.5, ASCENDER + CAP * 0.52], [0.5, BASELINE]),
  ] },
  Z: { aspect: 0.66, strokes: [
    L([0.14, ASCENDER], [0.86, ASCENDER]),
    L([0.86, ASCENDER], [0.14, BASELINE]),
    L([0.14, BASELINE], [0.86, BASELINE]),
  ] },
};

// ---------------------------------------------------------------- lowercase

const LOWER: Record<string, Letterform> = {
  a: { aspect: 0.66, strokes: [
    A(0.44, MIDLINE + XH / 2, 0.335, XH / 2, 0, 360),
    L([0.775, MIDLINE], [0.775, BASELINE]),
  ] },
  b: { aspect: 0.66, strokes: [
    L([0.195, ASCENDER], [0.195, BASELINE]),
    A(0.53, MIDLINE + XH / 2, 0.335, XH / 2, 180, 540),
  ] },
  c: { aspect: 0.62, strokes: [
    A(0.5, MIDLINE + XH / 2, 0.335, XH / 2, -40, 220),
  ] },
  d: { aspect: 0.66, strokes: [
    L([0.805, ASCENDER], [0.805, BASELINE]),
    A(0.47, MIDLINE + XH / 2, 0.335, XH / 2, 0, 360),
  ] },
  e: { aspect: 0.62, strokes: [
    L([0.18, MIDLINE + XH * 0.48], [0.82, MIDLINE + XH * 0.48]),
    C([0.82, MIDLINE + XH * 0.48], [0.82, MIDLINE - 0.01], [0.5, MIDLINE],
      [0.18, MIDLINE + 0.01], [0.18, MIDLINE + XH * 0.52],
      [0.18, BASELINE + 0.01], [0.5, BASELINE],
      [0.74, BASELINE - 0.005], [0.8, BASELINE - XH * 0.22]),
  ] },
  f: { aspect: 0.46, strokes: [
    C([0.80, ASCENDER + XH * 0.16], [0.72, ASCENDER - 0.012],
      [0.50, ASCENDER + 0.01], [0.36, ASCENDER + XH * 0.10],
      [0.36, ASCENDER + XH * 0.34]),
    L([0.36, ASCENDER + XH * 0.34], [0.36, BASELINE]),
    L([0.10, MIDLINE], [0.72, MIDLINE]),
  ] },
  // Bowl, then a stem down the RIGHT edge that hooks left under the baseline.
  // The stem must start at the bowl's right side (x=0.80, y=MIDLINE) and stay
  // there until it passes the baseline — an earlier version curved inwards
  // immediately and cut through the bowl.
  g: { aspect: 0.66, strokes: [
    A(0.47, MIDLINE + XH / 2, 0.335, XH / 2, 0, 360),
    // Straight down the right edge to below the baseline, THEN hook left.
    // Curving from the midline made it read as a comma rather than a 'g'.
    L([0.805, MIDLINE], [0.805, DESCENDER - XH * 0.30]),
    C([0.805, DESCENDER - XH * 0.30], [0.805, DESCENDER + 0.005],
      [0.56, DESCENDER], [0.34, DESCENDER - 0.004], [0.26, DESCENDER - XH * 0.24]),
  ] },
  h: { aspect: 0.58, strokes: [
    L([0.2, ASCENDER], [0.2, BASELINE]),
    C([0.2, MIDLINE + XH * 0.3], [0.4, MIDLINE - 0.01], [0.62, MIDLINE + XH * 0.06],
      [0.8, MIDLINE + XH * 0.22], [0.8, MIDLINE + XH * 0.5]),
    L([0.8, MIDLINE + XH * 0.5], [0.8, BASELINE]),
  ] },
  i: { aspect: 0.26, strokes: [
    L([0.5, MIDLINE], [0.5, BASELINE]),
    L([0.5, MIDLINE - XH * 0.34], [0.5, MIDLINE - XH * 0.3]),
  ] },
  j: { aspect: 0.34, strokes: [
    L([0.62, MIDLINE], [0.62, DESCENDER - XH * 0.30]),
    C([0.62, DESCENDER - XH * 0.30], [0.62, DESCENDER + 0.005],
      [0.40, DESCENDER], [0.22, DESCENDER - 0.004], [0.16, DESCENDER - XH * 0.24]),
    L([0.62, MIDLINE - XH * 0.36], [0.62, MIDLINE - XH * 0.30]),
  ] },
  k: { aspect: 0.56, strokes: [
    L([0.2, ASCENDER], [0.2, BASELINE]),
    L([0.78, MIDLINE], [0.2, MIDLINE + XH * 0.6]),
    L([0.42, MIDLINE + XH * 0.42], [0.82, BASELINE]),
  ] },
  l: { aspect: 0.26, strokes: [
    L([0.5, ASCENDER], [0.5, BASELINE]),
  ] },
  m: { aspect: 0.86, strokes: [
    L([0.1, MIDLINE], [0.1, BASELINE]),
    C([0.1, MIDLINE + XH * 0.28], [0.24, MIDLINE - 0.01], [0.4, MIDLINE + XH * 0.1],
      [0.5, MIDLINE + XH * 0.24], [0.5, MIDLINE + XH * 0.52]),
    L([0.5, MIDLINE + XH * 0.52], [0.5, BASELINE]),
    C([0.5, MIDLINE + XH * 0.28], [0.64, MIDLINE - 0.01], [0.8, MIDLINE + XH * 0.1],
      [0.9, MIDLINE + XH * 0.24], [0.9, MIDLINE + XH * 0.52]),
    L([0.9, MIDLINE + XH * 0.52], [0.9, BASELINE]),
  ] },
  n: { aspect: 0.58, strokes: [
    L([0.2, MIDLINE], [0.2, BASELINE]),
    C([0.2, MIDLINE + XH * 0.28], [0.4, MIDLINE - 0.01], [0.62, MIDLINE + XH * 0.08],
      [0.8, MIDLINE + XH * 0.24], [0.8, MIDLINE + XH * 0.52]),
    L([0.8, MIDLINE + XH * 0.52], [0.8, BASELINE]),
  ] },
  o: { aspect: 0.68, strokes: [
    A(0.5, MIDLINE + XH / 2, 0.345, XH / 2, 90, 450),
  ] },
  p: { aspect: 0.66, strokes: [
    L([0.195, MIDLINE], [0.195, DESCENDER]),
    A(0.53, MIDLINE + XH / 2, 0.335, XH / 2, 180, 540),
  ] },
  q: { aspect: 0.66, strokes: [
    A(0.47, MIDLINE + XH / 2, 0.335, XH / 2, 0, 360),
    L([0.805, MIDLINE], [0.805, DESCENDER]),
  ] },
  r: { aspect: 0.44, strokes: [
    L([0.24, MIDLINE], [0.24, BASELINE]),
    C([0.24, MIDLINE + XH * 0.3], [0.44, MIDLINE - 0.01], [0.66, MIDLINE + 0.005],
      [0.76, MIDLINE + XH * 0.08], [0.8, MIDLINE + XH * 0.16]),
  ] },
  s: { aspect: 0.50, strokes: [
    C([0.78, MIDLINE + XH * 0.18], [0.66, MIDLINE - 0.01], [0.42, MIDLINE + 0.005],
      [0.18, MIDLINE + 0.012], [0.2, MIDLINE + XH * 0.4],
      [0.24, MIDLINE + XH * 0.62], [0.76, MIDLINE + XH * 0.48],
      [0.86, MIDLINE + XH * 0.76], [0.5, BASELINE + 0.005],
      [0.24, BASELINE + 0.01], [0.18, BASELINE - XH * 0.18]),
  ] },
  t: { aspect: 0.44, strokes: [
    L([0.40, ASCENDER + XH * 0.36], [0.40, BASELINE - XH * 0.14]),
    C([0.40, BASELINE - XH * 0.14], [0.42, BASELINE + 0.010],
      [0.62, BASELINE], [0.76, BASELINE - 0.006], [0.82, BASELINE - XH * 0.18]),
    L([0.12, MIDLINE], [0.76, MIDLINE]),
  ] },
  u: { aspect: 0.58, strokes: [
    C([0.2, MIDLINE], [0.2, BASELINE - XH * 0.2], [0.5, BASELINE],
      [0.78, BASELINE - XH * 0.2], [0.8, MIDLINE]),
    L([0.8, MIDLINE], [0.8, BASELINE]),
  ] },
  v: { aspect: 0.58, strokes: [
    L([0.14, MIDLINE], [0.5, BASELINE]),
    L([0.5, BASELINE], [0.86, MIDLINE]),
  ] },
  w: { aspect: 0.84, strokes: [
    L([0.08, MIDLINE], [0.28, BASELINE]),
    L([0.28, BASELINE], [0.5, MIDLINE + XH * 0.42]),
    L([0.5, MIDLINE + XH * 0.42], [0.72, BASELINE]),
    L([0.72, BASELINE], [0.92, MIDLINE]),
  ] },
  x: { aspect: 0.56, strokes: [
    L([0.16, MIDLINE], [0.84, BASELINE]),
    L([0.84, MIDLINE], [0.16, BASELINE]),
  ] },
  y: { aspect: 0.60, strokes: [
    L([0.14, MIDLINE], [0.50, BASELINE]),
    // Second stroke starts at the top RIGHT and runs through the join, so the
    // two diagonals actually meet on the baseline.
    L([0.86, MIDLINE], [0.34, DESCENDER - XH * 0.16]),
    C([0.34, DESCENDER - XH * 0.16], [0.28, DESCENDER + 0.004],
      [0.14, DESCENDER - XH * 0.10]),
  ] },
  z: { aspect: 0.54, strokes: [
    L([0.16, MIDLINE], [0.84, MIDLINE]),
    L([0.84, MIDLINE], [0.16, BASELINE]),
    L([0.16, BASELINE], [0.84, BASELINE]),
  ] },
};

// ------------------------------------------------------------------ digits

const DIGITS: Record<string, Letterform> = {
  '0': { aspect: 0.62, strokes: [A(0.5, ASCENDER + CAP / 2, 0.3, CAP / 2, 90, 450)] },
  '1': { aspect: 0.36, strokes: [
    L([0.28, ASCENDER + CAP * 0.2], [0.52, ASCENDER]),
    L([0.52, ASCENDER], [0.52, BASELINE]),
    L([0.26, BASELINE], [0.78, BASELINE]),
  ] },
  '2': { aspect: 0.58, strokes: [
    C([0.16, ASCENDER + CAP * 0.24], [0.2, ASCENDER - 0.01], [0.5, ASCENDER],
      [0.84, ASCENDER + 0.01], [0.82, ASCENDER + CAP * 0.34],
      [0.8, ASCENDER + CAP * 0.56], [0.16, BASELINE]),
    L([0.16, BASELINE], [0.86, BASELINE]),
  ] },
  '3': { aspect: 0.60, strokes: [
    C([0.18, ASCENDER + CAP * 0.16], [0.32, ASCENDER - 0.012],
      [0.58, ASCENDER + CAP * 0.02], [0.82, ASCENDER + CAP * 0.10],
      [0.74, ASCENDER + CAP * 0.32], [0.68, ASCENDER + CAP * 0.46],
      [0.44, ASCENDER + CAP * 0.50]),
    C([0.44, ASCENDER + CAP * 0.50], [0.76, ASCENDER + CAP * 0.54],
      [0.84, ASCENDER + CAP * 0.74], [0.86, BASELINE + 0.004],
      [0.50, BASELINE + 0.006], [0.28, BASELINE + 0.002],
      [0.16, BASELINE - CAP * 0.16]),
  ] },
  '4': { aspect: 0.62, strokes: [
    L([0.66, ASCENDER], [0.14, ASCENDER + CAP * 0.66]),
    L([0.14, ASCENDER + CAP * 0.66], [0.88, ASCENDER + CAP * 0.66]),
    L([0.66, ASCENDER], [0.66, BASELINE]),
  ] },
  '5': { aspect: 0.58, strokes: [
    L([0.78, ASCENDER], [0.22, ASCENDER]),
    L([0.22, ASCENDER], [0.18, ASCENDER + CAP * 0.40]),
    C([0.18, ASCENDER + CAP * 0.40], [0.62, ASCENDER + CAP * 0.30],
      [0.82, ASCENDER + CAP * 0.58], [0.86, BASELINE - 0.004],
      [0.44, BASELINE + 0.008], [0.24, BASELINE + 0.004],
      [0.16, BASELINE - CAP * 0.14]),
  ] },
  '6': { aspect: 0.58, strokes: [
    C([0.76, ASCENDER + CAP * 0.08], [0.4, ASCENDER - 0.005], [0.2, ASCENDER + CAP * 0.36],
      [0.16, ASCENDER + CAP * 0.66], [0.18, BASELINE]),
    A(0.5, ASCENDER + CAP * 0.72, 0.32, CAP * 0.26, 90, 450),
  ] },
  '7': { aspect: 0.56, strokes: [
    L([0.14, ASCENDER], [0.86, ASCENDER]),
    L([0.86, ASCENDER], [0.4, BASELINE]),
  ] },
  '8': { aspect: 0.58, strokes: [
    A(0.5, ASCENDER + CAP * 0.24, 0.26, CAP * 0.24, 90, 450),
    A(0.5, ASCENDER + CAP * 0.74, 0.32, CAP * 0.26, 90, 450),
  ] },
  '9': { aspect: 0.58, strokes: [
    A(0.5, ASCENDER + CAP * 0.28, 0.32, CAP * 0.26, 90, 450),
    C([0.82, ASCENDER + CAP * 0.28], [0.84, ASCENDER + CAP * 0.62], [0.7, BASELINE - 0.005],
      [0.4, BASELINE + 0.012], [0.24, BASELINE - CAP * 0.02]),
  ] },
};

export const LETTERFORMS: Record<string, Letterform> = { ...UPPER, ...LOWER, ...DIGITS };

export const UPPERCASE = Object.keys(UPPER);
export const LOWERCASE = Object.keys(LOWER);
export const NUMERALS = Object.keys(DIGITS);

export const getLetterform = (ch: string): Letterform | null => LETTERFORMS[ch] ?? null;

/**
 * Flatten a stroke to a polyline in normalised space.
 *
 * Everything downstream — dotted rendering, arrows, bounds — works on plain
 * point lists, so curves and arcs are sampled once here rather than each
 * consumer re-implementing the maths.
 */
export function flattenStroke(s: Stroke, samples = 24): Point[] {
  if (s.kind === 'line') return s.points;

  if (s.kind === 'arc') {
    const { cx = 0.5, cy = 0.5, rx = 0.3, ry = 0.3, from = 0, to = 360 } = s;
    // Sample the sweep, then FORCE the cardinal angles that fall inside it.
    //
    // Uniform sampling can straddle the extreme without landing on it: C swept
    // 305deg->595deg with 98 samples still missed 360deg (the apex) and sat
    // 0.068 below the ascender. Adding the cardinals guarantees the arc
    // actually touches its own top, bottom, left and right.
    const angles: number[] = [];
    const steps = Math.max(24, Math.round(Math.abs(to - from) / 3));
    for (let i = 0; i <= steps; i++) angles.push(from + ((to - from) * i) / steps);

    const lo = Math.min(from, to);
    const hi = Math.max(from, to);
    for (let card = Math.ceil(lo / 90) * 90; card <= hi; card += 90) {
      if (card > lo && card < hi) angles.push(card);
    }
    angles.sort((a, b) => (from <= to ? a - b : b - a));

    const out: Point[] = angles.map((deg) => {
      const rad = (deg * Math.PI) / 180;
      return { x: cx + rx * Math.cos(rad), y: cy + ry * Math.sin(rad) };
    });
    return out;
  }

  // curve: [start, c1, p1, c2, p2, …] — chained quadratics
  const pts = s.points;
  if (pts.length < 3) return pts;
  const out: Point[] = [pts[0]];
  for (let i = 1; i + 1 < pts.length; i += 2) {
    const p0 = out[out.length - 1];
    const c = pts[i];
    const p1 = pts[i + 1];
    for (let t = 1; t <= samples; t++) {
      const u = t / samples;
      const inv = 1 - u;
      out.push({
        x: inv * inv * p0.x + 2 * inv * u * c.x + u * u * p1.x,
        y: inv * inv * p0.y + 2 * inv * u * c.y + u * u * p1.y,
      });
    }
  }
  return out;
}

/** Total pen distance of a letter, in normalised units. Used to space dashes. */
export function strokeLength(pts: Point[]): number {
  let d = 0;
  for (let i = 1; i < pts.length; i++) {
    d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return d;
}
