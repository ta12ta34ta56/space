import { engine } from './canvas-engine';

/**
 * Live-canvas screenshot for project cards. Deliberately lives OUTSIDE
 * `pdf-export.ts` (which statically imports pdf-lib): the project list is part
 * of the main bundle, and dragging pdf-lib into it would cost ~300 kB on every
 * initial load. This module has zero heavy imports.
 */
export function liveThumbnail(maxWidth = 320): string | null {
  if (!engine.canvas) return null;
  const c = engine.canvas;
  return c.toDataURL({
    format: 'png',
    multiplier: Math.min(1, maxWidth / c.getWidth()),
    enableRetinaScaling: false,
  });
}
