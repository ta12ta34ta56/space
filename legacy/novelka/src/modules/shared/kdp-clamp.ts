import * as fabric from 'fabric';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';

/**
 * Algorithmic KDP clamp for GENERATED content (Phase 8G).
 *
 * Layout engines compute slots inside the safe area, but individual objects
 * can still leak out — a clue list wraps taller than estimated, a word bank
 * overflows, a stroke overhangs a full-width rule. This function is the final
 * guarantee: every object is forced strictly inside the KDP safe rect (safe
 * margins + gutter on the correct side) BEFORE the page is serialized.
 *
 * - stroke overhang is counted on every edge (matching KDP preflight),
 * - objects larger than the safe area shrink to fit (sub-1% corrections),
 * - everything is then translated to sit exactly inside,
 * - full-page background art is exempt (intentional bleed).
 */

export interface SafeClampCtx {
  w: number;
  h: number;
  /** 1-based page number — decides which side the gutter is on */
  pageNumber: number;
  /** total pages, drives the gutter width */
  pageCount: number;
}

export function clampObjectsToSafeArea(
  objs: fabric.FabricObject[],
  ctx: SafeClampCtx,
): fabric.FabricObject[] {
  const m = kdpMarginsFor(Math.max(ctx.pageCount, 24));
  const safe = safeAreaFor(ctx.w, ctx.h, ctx.pageNumber, m);
  for (const o of objs) {
    o.setCoords();
    let bb = o.getBoundingRect();
    const fullPageArt = bb.width >= ctx.w * 0.95 && bb.height >= ctx.h * 0.95;
    if (fullPageArt) continue;
    const pad =
      (Math.max(0, Number(o.strokeWidth ?? 0)) *
        Math.max(Math.abs(o.scaleX ?? 1), Math.abs(o.scaleY ?? 1))) /
      2;
    if (pad > 0) {
      bb = {
        left: bb.left - pad,
        top: bb.top - pad,
        width: bb.width + pad * 2,
        height: bb.height + pad * 2,
      };
    }
    const ratio = Math.min(
      safe.width / Math.max(bb.width, 1),
      safe.height / Math.max(bb.height, 1),
      1,
    );
    if (ratio < 1) {
      o.scale(ratio);
      o.setCoords();
      bb = o.getBoundingRect();
      if (pad > 0) {
        bb = {
          left: bb.left - pad,
          top: bb.top - pad,
          width: bb.width + pad * 2,
          height: bb.height + pad * 2,
        };
      }
    }
    let dx = 0;
    let dy = 0;
    if (bb.left < safe.left) dx = safe.left - bb.left;
    else if (bb.left + bb.width > safe.left + safe.width) dx = safe.left + safe.width - (bb.left + bb.width);
    if (bb.top < safe.top) dy = safe.top - bb.top;
    else if (bb.top + bb.height > safe.top + safe.height) dy = safe.top + safe.height - (bb.top + bb.height);
    if (dx || dy) {
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
      o.setCoords();
    }
  }
  return objs;
}
