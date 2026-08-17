/**
 * Viewport and canvas backing store resolution math (spec 05 §3).
 *
 * Ported from `legacy/novelka/src/engine/canvas-engine.ts` L307–348.
 *
 * Reconciles the canvas backing store with on-screen dimensions:
 *  1. CSS size is an integer — element and backing store never disagree by a fraction.
 *  2. Backing store = CSS size × devicePixelRatio.
 *  3. An extra 2× supersample, so glyphs stay crisp at fractional zoom (73%, 137%).
 *  4. Capped: the long side stays <= maxPx (default 4096), or large pages exhaust GPU memory.
 *  5. Zoom is a vector transform, never a CSS scale on the element.
 */

import { inToPt } from '../../model/units';

export type ResolutionInput = {
  readonly cssW: number;
  readonly cssH: number;
  readonly dpr: number;
  readonly maxPx?: number;
};

export type ResolutionResult = {
  readonly pixelScale: number;
  readonly supersample: number;
};

export function pixelScaleFor({
  cssW,
  cssH,
  dpr,
  maxPx = 4096,
}: ResolutionInput): ResolutionResult {
  const safeCssW = Math.max(1, Math.round(cssW));
  const safeCssH = Math.max(1, Math.round(cssH));
  const safeDpr = Math.max(1, dpr);
  const maxDim = Math.max(safeCssW, safeCssH);

  let ss = 2;
  const longSide = maxDim * safeDpr * ss;
  if (longSide > maxPx) {
    ss = Math.max(1 / safeDpr, maxPx / (maxDim * safeDpr));
  }
  const pixelScale = Math.max(1, safeDpr * ss);
  return { pixelScale, supersample: ss };
}

export type CanvasDimensionsInput = {
  readonly widthIn: number;
  readonly heightIn: number;
  readonly zoom: number;
  readonly dpr: number;
  readonly maxPx?: number;
};

export type CanvasDimensionsResult = {
  readonly cssW: number;
  readonly cssH: number;
  readonly pixelScale: number;
  readonly supersample: number;
};

export function computeCanvasDimensions({
  widthIn,
  heightIn,
  zoom,
  dpr,
  maxPx = 4096,
}: CanvasDimensionsInput): CanvasDimensionsResult {
  const baseW = inToPt(widthIn);
  const baseH = inToPt(heightIn);
  const cssW = Math.max(1, Math.round(baseW * zoom));
  const cssH = Math.max(1, Math.round(baseH * zoom));
  const { pixelScale, supersample } = pixelScaleFor({ cssW, cssH, dpr, maxPx });
  return { cssW, cssH, pixelScale, supersample };
}
