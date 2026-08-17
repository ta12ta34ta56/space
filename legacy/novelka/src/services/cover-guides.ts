/**
 * Cover guideline geometry — PURE math, no rendering. It reads the EXISTING
 * `kdp-cover` spec (`CoverSpec`, `coverZones`) so the phantom guidelines always
 * agree with the real cover geometry. It never changes that geometry — it only
 * reads it.
 *
 * The canvas boundary IS the bleed boundary (totalWidth / totalHeight already
 * include bleed from calculateCover). Three semi-transparent phantom line sets
 * are overlaid directly on the canvas:
 *   - RED   dashed: the bleed/trim boundary (the trim rectangle, inset by bleed)
 *   - BLUE  dashed: the spine fold lines (left & right edges of the spine)
 *   - GREEN dashed: the safe / live-area inner margins (front & back panels)
 *
 * Coordinates are in the LIVE page's points (the flat cover page), mapped from
 * the spec via a defensive scale in case the page is briefly out of sync.
 */

import { coverZones, type CoverSpec, type CoverZone } from './kdp-cover';
import { OUTER_MARGIN_MIN_IN } from './kdp';
import { IN } from '../types/canvas.types';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CoverGuideGeom {
  /** the real KDP cover spec (points) */
  spec: CoverSpec;
  /** scale from spec points to live-page points */
  sx: number;
  sy: number;
  /** bleed inset in live-page points (COVER_BLEED_IN = 0.125in) */
  bleed: number;
  /** the trim rectangle (full canvas minus bleed) — red dashed boundary */
  trim: Rect;
  /** back / spine / front panels (trim rectangles) */
  back: Rect;
  spine: Rect;
  front: Rect;
  /** x of the left and right spine fold lines (blue dashed) */
  spineFoldLeft: number;
  spineFoldRight: number;
  /** safe / live-area rectangles for the back and front panels (green dashed) */
  safeBack: Rect;
  safeFront: Rect;
  /** the KDP barcode keep-out box (2" x 1.2", bottom-right of the back cover) */
  barcode: Rect;
}

/** KDP barcode box size (inches). */
export const BARCODE_W_IN = 2;
export const BARCODE_H_IN = 1.2;

/** Safe inset for cover content — KDP's minimum safe margin (0.25in). */
export const COVER_SAFE_MARGIN = OUTER_MARGIN_MIN_IN * IN;

function scaleRect(r: { left: number; top: number; width: number; height: number }, sx: number, sy: number): Rect {
  return {
    left: r.left * sx,
    top: r.top * sy,
    width: r.width * sx,
    height: r.height * sy,
  };
}

function safeRect(r: Rect, m: number): Rect {
  return {
    left: r.left + m,
    top: r.top + m,
    width: Math.max(0, r.width - m * 2),
    height: Math.max(0, r.height - m * 2),
  };
}

export function coverGuideGeom(spec: CoverSpec, pageWidth: number, pageHeight: number): CoverGuideGeom {
  const sx = spec.totalWidth > 0 ? pageWidth / spec.totalWidth : 1;
  const sy = spec.totalHeight > 0 ? pageHeight / spec.totalHeight : 1;
  const zones: CoverZone[] = coverZones(spec).map((z) => ({
    id: z.id,
    ...scaleRect(z, sx, sy),
  }));
  const back = zones.find((z) => z.id === 'back') ?? zones[0];
  const spine = zones.find((z) => z.id === 'spine') ?? zones[0];
  const front = zones.find((z) => z.id === 'front') ?? zones[0];
  const m = COVER_SAFE_MARGIN * sx;
  return {
    spec,
    sx,
    sy,
    bleed: spec.bleed * sx,
    trim: scaleRect({ left: spec.bleed, top: spec.bleed, width: spec.totalWidth - spec.bleed * 2, height: spec.totalHeight - spec.bleed * 2 }, sx, sy),
    back,
    spine,
    front,
    spineFoldLeft: spine.left,
    spineFoldRight: spine.left + spine.width,
    safeBack: safeRect(back, m),
    safeFront: safeRect(front, m),
    // KDP prints the barcode in a 2" x 1.2" box, bottom-right of the back cover.
    barcode: scaleRect({
      left: back.left + back.width - (BARCODE_W_IN + 0.25) * IN,
      top: back.top + back.height - (BARCODE_H_IN + 0.25) * IN,
      width: BARCODE_W_IN * IN,
      height: BARCODE_H_IN * IN,
    }, sx, sy),
  };
}

/**
 * All x positions that act as magnetic snap targets on the cover — bleed edges,
 * trim boundary edges, safe-area borders, spine folds and barcode-box edges.
 */
export function coverSnapLinesX(g: CoverGuideGeom): number[] {
  const out = new Set<number>();
  const addRect = (r: Rect) => {
    out.add(r.left);
    out.add(r.left + r.width);
    out.add(r.left + r.width / 2);
  };
  addRect(g.trim);
  addRect(g.safeBack);
  addRect(g.safeFront);
  addRect(g.barcode);
  // spine fold lines (vertical)
  out.add(g.spineFoldLeft);
  out.add(g.spineFoldRight);
  // bleed outer edges are the canvas bounds; trim covers the inner bleed edge
  return [...out];
}

/**
 * All y positions that act as magnetic snap targets on the cover.
 */
export function coverSnapLinesY(g: CoverGuideGeom): number[] {
  const out = new Set<number>();
  const addRect = (r: Rect) => {
    out.add(r.top);
    out.add(r.top + r.height);
    out.add(r.top + r.height / 2);
  };
  addRect(g.trim);
  addRect(g.safeBack);
  addRect(g.safeFront);
  addRect(g.barcode);
  return [...out];
}

/**
 * True when a rectangle extends into the bleed band (the outer 0.125" ring that
 * gets trimmed). Used to warn about text sitting in the bleed zone.
 */
export function rectInBleed(g: CoverGuideGeom, r: Rect): boolean {
  const pageW = g.spec.totalWidth * g.sx;
  const pageH = g.spec.totalHeight * g.sy;
  const b = g.bleed;
  return (
    r.left < b ||
    r.top < b ||
    r.left + r.width > pageW - b ||
    r.top + r.height > pageH - b
  );
}
