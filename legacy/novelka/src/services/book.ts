import * as fabric from 'fabric';
import { IN, isCover, isInterior, type Page, type ProjectFile } from '../types/canvas.types';
import {
  COVER_BLEED_IN,
  HARDCOVER_WRAP_IN,
  PAPER_STOCKS,
  calculateCover,
  coverZones,
  formatIn,
  type BindingType,
  type CoverSpec,
  type PaperType,
} from './kdp-cover';
import { KDP_MIN_PAGE_COUNT, KDP_MAX_PAGE_COUNT, serializedObjectBounds } from './kdp';
import type {
  ComprehensivePreflightResult,
  PreflightDiagnostic,
} from '../domain/preflight';

/**
 * Book-level model.
 *
 * A Book has `settings` (trim, paper, binding) and — separately — a cover
 * whose flat geometry (back + spine + front + bleed) is DERIVED from those
 * settings plus the interior page count via the EXISTING `calculateCover` in
 * kdp-cover.ts. The cover is never an interior page and interior pages are
 * never the cover size. All spine math lives in kdp-cover.ts; this file only
 * applies it to the page list.
 */

export interface BookSettings {
  /** interior trim, in points */
  trimWidth: number;
  trimHeight: number;
  paper: PaperType;
  binding: BindingType;
}

export const DEFAULT_BOOK: BookSettings = {
  trimWidth: 6 * IN,
  trimHeight: 9 * IN,
  paper: 'white',
  binding: 'paperback',
};

export interface TrimPreset {
  id: string;
  label: string;
  wIn: number;
  hIn: number;
}

/** KDP trims + common ISO sizes, for the setup window and Settings panel. */
export const TRIM_PRESETS: TrimPreset[] = [
  { id: '5x8', label: '5 × 8 in', wIn: 5, hIn: 8 },
  { id: '5.5x8.5', label: '5.5 × 8.5 in', wIn: 5.5, hIn: 8.5 },
  { id: '6x9', label: '6 × 9 in', wIn: 6, hIn: 9 },
  { id: '7x10', label: '7 × 10 in', wIn: 7, hIn: 10 },
  { id: '8.5x11', label: '8.5 × 11 in', wIn: 8.5, hIn: 11 },
  { id: 'a4', label: 'A4 (8.27 × 11.69 in)', wIn: 8.27, hIn: 11.69 },
  { id: 'a5', label: 'A5 (5.83 × 8.27 in)', wIn: 5.83, hIn: 8.27 },
];

/** KDP's printable envelope for custom trims (inches). */
export const CUSTOM_TRIM_LIMITS = { minWIn: 4, maxWIn: 8.5, minHIn: 6, maxHIn: 11.69 };

export const interiorCountOf = (pages: Page[]) => pages.filter(isInterior).length;
export const coverPageOf = (pages: Page[]) => pages.find(isCover) ?? null;

/** The flat-cover spec derived from settings + interior page count. */
export function coverSpecFor(settings: BookSettings, interiorCount: number): CoverSpec {
  return calculateCover(
    settings.trimWidth / IN,
    settings.trimHeight / IN,
    Math.max(1, interiorCount),
    settings.paper,
    settings.binding,
  );
}

/** Page-count limits for the chosen paper/binding (binding overrides stock). */
export function pageCountLimits(settings: BookSettings): { min: number; max: number } {
  const stock = PAPER_STOCKS.find((s) => s.id === settings.paper) ?? PAPER_STOCKS[0];
  return settings.binding === 'hardcover'
    ? { min: 75, max: 550 }
    : { min: stock.minPages, max: stock.maxPages };
}

/** Legacy/imported projects carry no settings — infer from the interior. */
export function inferBookSettings(file: Pick<ProjectFile, 'pages' | 'book'>): BookSettings {
  if (file.book) {
    return {
      trimWidth: file.book.trimWidth,
      trimHeight: file.book.trimHeight,
      paper: file.book.paper,
      binding: file.book.binding,
    };
  }
  const interior = file.pages.find(isInterior) ?? file.pages[0];
  return {
    ...DEFAULT_BOOK,
    trimWidth: interior?.width ?? DEFAULT_BOOK.trimWidth,
    trimHeight: interior?.height ?? DEFAULT_BOOK.trimHeight,
  };
}

export function summarizeBook(settings: BookSettings, interiorCount: number): string {
  const spec = coverSpecFor(settings, interiorCount);
  const w = settings.trimWidth / IN;
  const h = settings.trimHeight / IN;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ''));
  return `${fmt(w)}×${fmt(h)} in · ${interiorCount} pages · ${settings.paper} paper · ${settings.binding} · spine ≈ ${spec.spineInches.toFixed(3)} in`;
}

/* ===================================================== cover geometry === */

type AnyObj = Record<string, unknown>;

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Zone x-geometry of a flat cover with a given total width, from settings. */
function zonesForWidth(settings: BookSettings, totalWidth: number, totalHeight: number) {
  const bleed = COVER_BLEED_IN * IN;
  const wrap = settings.binding === 'hardcover' ? HARDCOVER_WRAP_IN * IN : 0;
  const spine = Math.max(0, totalWidth - settings.trimWidth * 2 - (bleed + wrap) * 2);
  const x0 = bleed + wrap;
  const y0 = bleed + wrap;
  return {
    bleed,
    wrap,
    spine,
    x0,
    y0,
    backLeft: x0,
    spineLeft: x0 + settings.trimWidth,
    frontLeft: x0 + settings.trimWidth + spine,
    trimHeight: totalHeight - (bleed + wrap) * 2,
  };
}

/**
 * Recompute the cover page for the current settings + interior count, and
 * move its artwork with the geometry: spine objects re-center on the new
 * spine, front-panel objects follow the front edge, full-bleed backgrounds
 * stretch, and the wizard's GUIDE rectangles are rebuilt exactly.
 *
 * ONLY the cover page changes — interior pages are never touched here.
 */
export function syncCoverPage(
  pages: Page[],
  settings: BookSettings,
): { pages: Page[]; changed: boolean; spec: CoverSpec } {
  const spec = coverSpecFor(settings, interiorCountOf(pages));
  const cover = coverPageOf(pages);
  if (!cover) return { pages, changed: false, spec };

  const sameW = Math.abs(cover.width - spec.totalWidth) < 0.5;
  const sameH = Math.abs(cover.height - spec.totalHeight) < 0.5;
  if (sameW && sameH) return { pages, changed: false, spec };

  const oldZ = zonesForWidth(settings, cover.width, cover.height);
  const zones = coverZones(spec);
  const back = zones[0];
  const spine = zones[1];
  const front = zones[2];

  const oldSpineCenter = oldZ.spineLeft + oldZ.spine / 2;
  const newSpineCenter = spine.left + spine.width / 2;
  const dxSpine = newSpineCenter - oldSpineCenter;
  const dxFront = front.left - (oldZ.frontLeft);
  const dxBack = back.left - oldZ.backLeft;
  const dy = back.top - oldZ.y0;

  const data = (cover.data ?? {}) as AnyObj;
  const objects = Array.isArray(data.objects) ? (data.objects as AnyObj[]) : [];

  const nextObjects = objects.map((raw) => {
    const o = { ...raw } as AnyObj;
    const bounds = serializedObjectBounds(o);

    // Full-bleed background: stretch to the new flat size.
    if (bounds.width >= cover.width * 0.96 && bounds.height >= cover.height * 0.96) {
      const w = num(o.width, cover.width);
      const h = num(o.height, cover.height);
      if (w > 0) o.scaleX = spec.totalWidth / w;
      if (h > 0) o.scaleY = spec.totalHeight / h;
      o.left = 0;
      o.top = 0;
      return o;
    }

    // Panel-relative move: keep back-cover art anchored to the back panel,
    // re-center spine art on the new spine, shift front art with the front.
    const cx = bounds.left + bounds.width / 2;
    const dx =
      cx < oldZ.spineLeft ? dxBack : cx <= oldZ.frontLeft ? dxSpine : dxFront;
    o.left = num(o.left) + dx;
    o.top = num(o.top) + dy;
    return o;
  });

  const nextCover: Page = {
    ...cover,
    width: spec.totalWidth,
    height: spec.totalHeight,
    name: cover.name.startsWith('Cover')
      ? `Cover — ${(settings.trimWidth / IN).toFixed(settings.trimWidth % IN ? 2 : 0)} × ${(settings.trimHeight / IN).toFixed(settings.trimHeight % IN ? 2 : 0)} · ${spec.pageCount}pp`
      : cover.name,
    data: { ...data, objects: nextObjects },
  };

  return {
    pages: pages.map((p) => (p.id === cover.id ? nextCover : p)),
    changed: true,
    spec,
  };
}

/* ==================================================== cover builder ===== */

export interface CoverBuildOptions {
  font: string;
  bgColor: string;
}

/**
 * Default cover artwork for a fresh cover page (extracted from the cover
 * wizard so the New Book setup and the wizard build identical covers).
 *
 * NOTE: this deliberately produces NO guide overlays (trim/spine/safe-area/
 * barcode). Guidelines must NEVER be document content — they are rendered by
 * the separate Canvas Overlay component, which is DOM-only (never saved to the
 * page JSON, never in selection, never in thumbnails/preview/export). Keeping
 * guides out of the document is what stops them leaking into the sidebar
 * thumbnails, selection bounds and printed output.
 */
export function buildCoverObjects(spec: CoverSpec, opts: CoverBuildOptions): fabric.FabricObject[] {
  const zones = coverZones(spec);
  const back = zones[0];
  const spine = zones[1];
  const front = zones[2];
  const { font, bgColor } = opts;
  const objs: fabric.FabricObject[] = [];

  // full-bleed background
  objs.push(
    new fabric.Rect({
      left: 0,
      top: 0,
      width: spec.totalWidth,
      height: spec.totalHeight,
      fill: bgColor,
      selectable: true,
    }),
  );

  // front cover text
  objs.push(
    new fabric.Textbox('YOUR TITLE', {
      left: front.left + front.width * 0.1,
      top: front.top + front.height * 0.18,
      width: front.width * 0.8,
      fontSize: front.width * 0.11,
      fontWeight: 'bold',
      fill: '#ffffff',
      textAlign: 'center',
      fontFamily: font,
    }),
  );
  objs.push(
    new fabric.Textbox('Subtitle goes here', {
      left: front.left + front.width * 0.1,
      top: front.top + front.height * 0.38,
      width: front.width * 0.8,
      fontSize: front.width * 0.04,
      fill: 'rgba(255,255,255,.8)',
      textAlign: 'center',
      fontFamily: font,
    }),
  );
  objs.push(
    new fabric.Textbox('AUTHOR NAME', {
      left: front.left + front.width * 0.1,
      top: front.top + front.height * 0.84,
      width: front.width * 0.8,
      fontSize: front.width * 0.045,
      fill: '#ffffff',
      textAlign: 'center',
      fontFamily: font,
    }),
  );

  // back cover blurb (the barcode keep-out box is drawn by the CANVAS OVERLAY,
  // not as document content — see CoverGuides).
  objs.push(
    new fabric.Textbox(
      'Back cover description goes here. Keep text inside the safe area and away from the barcode box.',
      {
        left: back.left + back.width * 0.12,
        top: back.top + back.height * 0.16,
        width: back.width * 0.76,
        fontSize: back.width * 0.032,
        fill: 'rgba(255,255,255,.85)',
        fontFamily: font,
      },
    ),
  );

  // spine text, only when KDP allows it
  if (spec.spineTextAllowed) {
    objs.push(
      new fabric.Textbox('YOUR TITLE', {
        left: spine.left + spine.width / 2,
        top: spine.top + spine.height / 2,
        width: spine.height * 0.8,
        fontSize: Math.min(spine.width * 0.45, 22),
        fill: '#ffffff',
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        angle: 90,
        fontFamily: font,
      }),
    );
  }

  return objs;
}

/* ==================================================== diagnostics ======= */

/**
 * Book-level diagnostics (spine/page-count/cover geometry) that supplement
 * the pure page preflight. Shown in the same KDP Check panel and merged into
 * the export gate — an invalid spine blocks export via KDP Check, exactly
 * like a page-level blocker.
 */
export function bookDiagnostics(pages: Page[], settings: BookSettings): PreflightDiagnostic[] {
  const out: PreflightDiagnostic[] = [];
  const count = interiorCountOf(pages);
  const cover = coverPageOf(pages);
  if (count === 0) return out;

  const { min, max } = pageCountLimits(settings);
  const spec = coverSpecFor(settings, count);

  // Base preflight already errors below the global 24 / above 828 — only add
  // the stricter paper/binding limits so nothing is reported twice.
  if (count < min && min > KDP_MIN_PAGE_COUNT) {
    out.push({
      code: 'BOOK_PAGE_COUNT_BELOW_MIN',
      severity: 'error',
      message: `${count} interior pages is below the ${min}-page minimum for ${settings.binding} on ${settings.paper} paper — the spine would be too thin to bind.`,
      details: { count, min, paper: settings.paper, binding: settings.binding },
      recommendedFix: `Add at least ${min - count} more page(s), or switch paper/binding in Settings.`,
    });
  }
  if (count > max && max < KDP_MAX_PAGE_COUNT) {
    out.push({
      code: 'BOOK_PAGE_COUNT_ABOVE_MAX',
      severity: 'error',
      message: `${count} interior pages exceeds the ${max}-page maximum for ${settings.binding} on ${settings.paper} paper.`,
      details: { count, max, paper: settings.paper, binding: settings.binding },
      recommendedFix: 'Split the book into volumes or switch paper/binding in Settings.',
    });
  }

  if (cover) {
    const pageNo = pages.indexOf(cover) + 1;
    const mismatch =
      Math.abs(cover.width - spec.totalWidth) > 1 || Math.abs(cover.height - spec.totalHeight) > 1;
    if (mismatch) {
      out.push({
        code: 'COVER_GEOMETRY_MISMATCH',
        severity: 'error',
        pageNumber: pageNo,
        pageId: cover.id,
        message: `The cover is ${formatIn(cover.width, 2)} × ${formatIn(cover.height, 2)} but this book needs ${formatIn(spec.totalWidth, 2)} × ${formatIn(spec.totalHeight, 2)} (spine ${formatIn(spec.spine)}).`,
        details: { expected: [spec.totalWidth, spec.totalHeight], actual: [cover.width, cover.height] },
        recommendedFix: 'The cover resizes automatically when pages change — if this persists, check paper/binding in Settings.',
      });
    }
    if (!spec.spineTextAllowed) {
      out.push({
        code: 'SPINE_TEXT_NOT_PRINTED',
        severity: 'warn',
        pageNumber: pageNo,
        pageId: cover.id,
        message: `Spine text is only printed on books with more than 79 pages (this book has ${count}).`,
        details: { count },
        recommendedFix: 'Keep the spine free of text, or grow the interior past 79 pages.',
      });
    }
  }

  return out;
}

/** Fold book diagnostics into a preflight result (status/summary recomputed). */
export function withBookDiagnostics(
  base: ComprehensivePreflightResult,
  extra: PreflightDiagnostic[],
): ComprehensivePreflightResult {
  if (!extra.length) return base;
  const errors = [...base.errors, ...extra.filter((d) => d.severity === 'error')];
  const warnings = [...base.warnings, ...extra.filter((d) => d.severity === 'warn')];
  const status = errors.length ? 'blocked' : warnings.length ? 'warnings' : 'pass';
  const affected = new Set(base.affectedPages);
  extra.forEach((d) => d.pageNumber && affected.add(d.pageNumber));
  return {
    ...base,
    errors,
    warnings,
    status,
    affectedPages: [...affected].sort((a, b) => a - b),
    summary:
      status === 'pass'
        ? base.summary
        : status === 'warnings'
          ? `Preflight has ${warnings.length} warning(s) — Review items before export.`
          : `Preflight blocked export: ${errors.length} error(s) must be resolved.`,
    recommendedFixes: [
      ...new Set([...base.recommendedFixes, ...extra.map((d) => d.recommendedFix).filter(Boolean)]),
    ] as string[],
  };
}
