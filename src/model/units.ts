/**
 * Unit conversion — the ONLY place in the codebase where inches, points and
 * pixels are converted (architecture.md §3).
 *
 * All Document geometry is in inches. Points exist at the PDF boundary, pixels
 * at the render boundary, and nowhere else. No other file may contain `* 72`
 * or `/ 72`.
 *
 * Every function rejects non-finite input and refuses to return a non-finite
 * result. A silent `NaN` reaching geometry is the bug class this prevents: it
 * is invisible until a real print run.
 */

/** Points per inch. The single definition of the pt/in relationship. */
export const PT_PER_IN = 72;

/** Decimal places `roundIn` keeps. Four is ~0.0001 in, well below print tolerance. */
const IN_DECIMALS = 4;
const IN_ROUNDING_FACTOR = 10 ** IN_DECIMALS;

/** Thrown when a conversion is given, or would produce, a value that is not a finite number. */
export class UnitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnitError';
  }
}

function assertFinite(value: number, argument: string, fn: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new UnitError(`${fn}: ${argument} must be a finite number, received ${String(value)}.`);
  }
}

function assertFiniteResult(value: number, fn: string): number {
  if (!Number.isFinite(value)) {
    throw new UnitError(`${fn}: produced a non-finite result.`);
  }
  return value;
}

/** Inches to points. */
export const inToPt = (inches: number): number => {
  assertFinite(inches, 'inches', 'inToPt');
  return assertFiniteResult(inches * PT_PER_IN, 'inToPt');
};

/** Points to inches. */
export const ptToIn = (pt: number): number => {
  assertFinite(pt, 'pt', 'ptToIn');
  return assertFiniteResult(pt / PT_PER_IN, 'ptToIn');
};

/** Inches to pixels. `scale` is pixels per inch at the current render scale. */
export const inToPx = (inches: number, scale: number): number => {
  assertFinite(inches, 'inches', 'inToPx');
  assertFinite(scale, 'scale', 'inToPx');
  return assertFiniteResult(inches * scale, 'inToPx');
};

/** Pixels to inches. `scale` is pixels per inch at the current render scale. */
export const pxToIn = (px: number, scale: number): number => {
  assertFinite(px, 'px', 'pxToIn');
  assertFinite(scale, 'scale', 'pxToIn');
  return assertFiniteResult(px / scale, 'pxToIn');
};

/** Rounds inches to 4 decimal places, killing float drift before it accumulates. */
export const roundIn = (inches: number): number => {
  assertFinite(inches, 'inches', 'roundIn');
  return assertFiniteResult(Math.round(inches * IN_ROUNDING_FACTOR) / IN_ROUNDING_FACTOR, 'roundIn');
};
