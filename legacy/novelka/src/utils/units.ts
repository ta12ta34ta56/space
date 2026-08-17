import type { Unit } from '../types/canvas.types';

/** Canvas works in points/px @72dpi. Conversion helpers for the size inputs. */
export const PX_PER_MM = 72 / 25.4;
export const PX_PER_IN = 72;

export function fromPx(px: number, unit: Unit): number {
  if (unit === 'mm') return px / PX_PER_MM;
  if (unit === 'in') return px / PX_PER_IN;
  return px;
}

export function toPx(value: number, unit: Unit): number {
  if (unit === 'mm') return value * PX_PER_MM;
  if (unit === 'in') return value * PX_PER_IN;
  return value;
}

export function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
