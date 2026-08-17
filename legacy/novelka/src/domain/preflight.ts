import type { Page } from '../types/canvas.types';
import {
  kdpMarginsFor,
  safeAreaFor,
  kdpPrintedPageCount,
  serializedObjectBounds,
  KDP_MIN_LINE_WIDTH_PT,
  KDP_MIN_PAGE_COUNT,
  KDP_MAX_PAGE_COUNT,
} from '../services/kdp';
import { wsInstancesOf, wsMetaOf } from '../modules/word-search/build-pages';
import type { GeneratedInstance, RectFrame } from './types';

export type PreflightStatus = 'pass' | 'warnings' | 'blocked';
export type DiagnosticSeverity = 'error' | 'warn';

export interface PreflightDiagnostic {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  pageNumber?: number;
  pageId?: string;
  instanceId?: string;
  objectId?: string;
  details?: Record<string, unknown>;
  recommendedFix?: string;
}

export interface ComprehensivePreflightResult {
  status: PreflightStatus;
  errors: PreflightDiagnostic[];
  warnings: PreflightDiagnostic[];
  affectedPages: number[];
  affectedInstanceIds: string[];
  affectedObjectIds: string[];
  summary: string;
  recommendedFixes: string[];
}

export interface PreflightOptions {
  paper?: 'bw-white' | 'bw-cream' | 'bw-groundwood' | 'standard-color' | 'premium-color';
  dpi?: number;
  bleed?: boolean | 'auto';
  exportPreset?: 'all' | 'interior' | 'cover';
  requireSolutions?: boolean;
}

type AnyObj = Record<string, unknown>;

function isVisible(o: AnyObj): boolean {
  return o.visible !== false && o.opacity !== 0;
}

function isTextObject(o: AnyObj): boolean {
  const type = String(o.type ?? '').toLowerCase();
  return type === 'textbox' || type === 'i-text' || type === 'text' || typeof o.text === 'string';
}

function rightOf(r: { left: number; width: number }): number {
  return r.left + r.width;
}

function bottomOf(r: { top: number; height: number }): number {
  return r.top + r.height;
}

function outside(inner: { left: number; top: number; width: number; height: number }, outer: { left: number; top: number; width: number; height: number }, tolerance = 0): boolean {
  return (
    inner.left < outer.left - tolerance ||
    inner.top < outer.top - tolerance ||
    rightOf(inner) > rightOf(outer) + tolerance ||
    bottomOf(inner) > bottomOf(outer) + tolerance
  );
}

function rectsOverlap(a: RectFrame, b: RectFrame, tolerance = 1): boolean {
  return !(
    a.left + a.width <= b.left + tolerance ||
    b.left + b.width <= a.left + tolerance ||
    a.top + a.height <= b.top + tolerance ||
    b.top + b.height <= a.top + tolerance
  );
}

/**
 * Pure comprehensive preflight inspection for a complete Novelka book project.
 */
export function runComprehensivePreflight(
  pages: Page[],
  options: PreflightOptions = {},
): ComprehensivePreflightResult {
  const diagnostics: PreflightDiagnostic[] = [];
  const affectedPagesSet = new Set<number>();
  const affectedInstanceIdsSet = new Set<string>();
  const affectedObjectIdsSet = new Set<string>();

  const exportPreset = options.exportPreset ?? 'interior';
  const interiorPages = pages.filter((p) => p.role !== 'cover');
  const coverPages = pages.filter((p) => p.role === 'cover');

  // Determine target pages for this preflight run
  const targetPages =
    exportPreset === 'cover'
      ? coverPages
      : exportPreset === 'interior'
        ? interiorPages
        : pages;

  if (targetPages.length === 0) {
    diagnostics.push({
      code: 'NO_PAGES',
      severity: 'error',
      message: `No ${exportPreset} pages found to export.`,
      recommendedFix: 'Add pages to your document before exporting.',
    });
  }

  // ------------------------------------------------------------------ 1. BOOK STRUCTURE
  if (exportPreset === 'interior' || exportPreset === 'all') {
    const declaredCount = interiorPages.length;
    const printedCount = kdpPrintedPageCount(declaredCount);

    if (declaredCount < KDP_MIN_PAGE_COUNT) {
      diagnostics.push({
        code: 'TOO_FEW_PAGES',
        severity: 'error',
        message: `Document has ${declaredCount} interior pages. Amazon KDP requires at least ${KDP_MIN_PAGE_COUNT} interior pages for standard paperback binding.`,
        details: { declaredCount, minRequired: KDP_MIN_PAGE_COUNT },
        recommendedFix: `Generate or add at least ${KDP_MIN_PAGE_COUNT - declaredCount} more page(s).`,
      });
    }

    if (declaredCount > KDP_MAX_PAGE_COUNT) {
      diagnostics.push({
        code: 'TOO_MANY_PAGES',
        severity: 'error',
        message: `Document has ${declaredCount} interior pages, exceeding Amazon KDP's maximum limit of ${KDP_MAX_PAGE_COUNT} pages.`,
        details: { declaredCount, maxAllowed: KDP_MAX_PAGE_COUNT },
        recommendedFix: 'Split your book into multiple volumes or reduce page count.',
      });
    }

    if (declaredCount % 2 === 1) {
      diagnostics.push({
        code: 'ODD_PAGE_COUNT',
        severity: 'warn',
        message: `Document has ${declaredCount} interior pages (odd count). Amazon KDP will round up to ${printedCount} pages during print binding.`,
        details: { declaredCount, printedCount },
        recommendedFix: 'Add an even number of pages or a blank back page for exact spread alignment.',
      });
    }

    // Check for cover page order anomalies (cover should not be in the middle of interior)
    pages.forEach((p, idx) => {
      if (p.role === 'cover' && idx > 0 && idx < pages.length - 1) {
        diagnostics.push({
          code: 'INVALID_COVER_POSITION',
          severity: 'error',
          pageNumber: idx + 1,
          pageId: p.id,
          message: `Cover page is positioned at index ${idx + 1} between interior pages. Wraparound covers must be exported separately.`,
          recommendedFix: 'Move the cover to the start of the project or export it as a separate cover file.',
        });
        affectedPagesSet.add(idx + 1);
      }
    });

    // Check mixed page sizes among interior pages
    if (interiorPages.length > 1) {
      const firstW = interiorPages[0].width;
      const firstH = interiorPages[0].height;
      interiorPages.forEach((p, i) => {
        if (Math.abs(p.width - firstW) > 0.5 || Math.abs(p.height - firstH) > 0.5) {
          diagnostics.push({
            code: 'MIXED_PAGE_SIZES',
            severity: 'error',
            pageNumber: i + 1,
            pageId: p.id,
            message: `Page ${i + 1} (${p.width} × ${p.height} pt) does not match document trim size (${firstW} × ${firstH} pt). All interior pages must share the same trim size.`,
            details: { expected: [firstW, firstH], actual: [p.width, p.height] },
            recommendedFix: 'Resize all interior pages to the same trim dimensions.',
          });
          affectedPagesSet.add(i + 1);
        }
      });
    }
  }

  // ------------------------------------------------------------------ 2. GENERATED CONTENT INTEGRITY
  const seenInstanceIds = new Map<string, { pageNumber: number; pageId: string }>();
  const puzzleInstances: GeneratedInstance[] = [];
  const solutionInstances: GeneratedInstance[] = [];

  targetPages.forEach((page, pageIdx) => {
    const pageNo = pageIdx + 1;
    const instances = wsInstancesOf(page);
    const meta = wsMetaOf(page);
    const rawData = (page.data ?? {}) as Record<string, unknown>;
    const rawObjects = ((rawData.objects ?? []) as AnyObj[]).filter(isVisible);
    const canvasObjectIds = new Set(rawObjects.map((o) => o.id as string).filter(Boolean));

    // Check for unexpected blank pages or missing artwork
    if (page.role === 'cover' && rawObjects.length === 0) {
      diagnostics.push({
        code: 'BLANK_COVER',
        severity: 'error',
        pageNumber: pageNo,
        pageId: page.id,
        message: `Cover page on Page ${pageNo} contains no visual artwork or elements.`,
        recommendedFix: 'Design the cover artwork or exclude cover export.',
      });
      affectedPagesSet.add(pageNo);
    } else if (page.role === 'interior' && rawObjects.length === 0) {
      diagnostics.push({
        code: 'BLANK_UNEXPECTED_PAGE',
        severity: 'warn',
        pageNumber: pageNo,
        pageId: page.id,
        message: `Page ${pageNo} ("${page.name}") contains no visual objects.`,
        recommendedFix: 'Add content to this page or delete it if unintentional.',
      });
      affectedPagesSet.add(pageNo);
    }

    // Check invalid page roles
    if (page.role && page.role !== 'interior' && page.role !== 'cover') {
      diagnostics.push({
        code: 'INVALID_PAGE_ROLE',
        severity: 'error',
        pageNumber: pageNo,
        pageId: page.id,
        message: `Page ${pageNo} has an invalid role "${String(page.role)}". Expected 'interior' or 'cover'.`,
        recommendedFix: 'Set page role to interior or cover.',
      });
      affectedPagesSet.add(pageNo);
    }

    // Check missing puzzle or solution artwork
    if (meta?.kind === 'puzzle') {
      const hasLetters = rawObjects.some((o) => o.wsRole === 'ws-letter');
      if (!hasLetters && rawObjects.length > 0) {
        diagnostics.push({
          code: 'MISSING_PUZZLE_ARTWORK',
          severity: 'error',
          pageNumber: pageNo,
          pageId: page.id,
          message: `Puzzle page ${pageNo} has no letter grid elements.`,
          recommendedFix: 'Regenerate the puzzle page.',
        });
        affectedPagesSet.add(pageNo);
      }
    } else if (meta?.kind === 'solution') {
      const hasSolLetters = rawObjects.some((o) => o.wsRole === 'ws-letter' || o.wsRole === 'ws-answer');
      if (!hasSolLetters && rawObjects.length > 0) {
        diagnostics.push({
          code: 'MISSING_SOLUTION_ARTWORK',
          severity: 'error',
          pageNumber: pageNo,
          pageId: page.id,
          message: `Solution page ${pageNo} has no answer key grid elements.`,
          recommendedFix: 'Regenerate the answer key page.',
        });
        affectedPagesSet.add(pageNo);
      }
    }

    // Check for layoutResult failure flags
    if (rawData.invalidForProduction === true || rawData.ok === false) {
      const layoutWarnings = (rawData.layoutWarnings as PreflightDiagnostic[]) ?? [];
      const warnDetail = layoutWarnings.length ? ` (${layoutWarnings.map((w) => w.message).join('; ')})` : '';
      diagnostics.push({
        code: 'INVALID_LAYOUT',
        severity: 'error',
        pageNumber: pageNo,
        pageId: page.id,
        message: `Page ${pageNo} has layout constraint failures and is marked invalid for production${warnDetail}.`,
        details: { layoutWarnings },
        recommendedFix: 'Reflow the page or reduce grid/word density in the editor.',
      });
      affectedPagesSet.add(pageNo);
    }

    // Check for draft template usage
    const pageTemplateStatus = (rawData.templateStatus as string) || meta?.templateStatus;
    if (pageTemplateStatus === 'draft') {
      diagnostics.push({
        code: 'DRAFT_TEMPLATE_USED',
        severity: 'warn',
        pageNumber: pageNo,
        pageId: page.id,
        message: `Page ${pageNo} uses a draft template ("${rawData.templateId || 'draft'}"). Published templates are recommended for production exports.`,
        recommendedFix: 'Switch to a published template before production printing.',
      });
      affectedPagesSet.add(pageNo);
    }

    // Instance checks
    instances.forEach((inst) => {
      // Duplicate instance ID check
      if (seenInstanceIds.has(inst.instanceId)) {
        const prev = seenInstanceIds.get(inst.instanceId)!;
        diagnostics.push({
          code: 'DUPLICATE_INSTANCE_ID',
          severity: 'error',
          pageNumber: pageNo,
          pageId: page.id,
          instanceId: inst.instanceId,
          message: `Duplicate instanceId "${inst.instanceId}" found on Page ${pageNo} (already used on Page ${prev.pageNumber}).`,
          recommendedFix: 'Regenerate the instance to assign a unique identifier.',
        });
        affectedPagesSet.add(pageNo);
        affectedInstanceIdsSet.add(inst.instanceId);
      } else {
        seenInstanceIds.set(inst.instanceId, { pageNumber: pageNo, pageId: page.id });
      }

      // Check unresolved object IDs
      const unresolvedIds = inst.objectIds.filter((id) => !canvasObjectIds.has(id));
      if (inst.objectIds.length > 0 && unresolvedIds.length === inst.objectIds.length) {
        diagnostics.push({
          code: 'UNRESOLVED_OBJECT_IDS',
          severity: 'warn',
          pageNumber: pageNo,
          pageId: page.id,
          instanceId: inst.instanceId,
          message: `Instance "${inst.instanceId}" references objects that do not exist on the canvas.`,
          details: { unresolvedIds },
          recommendedFix: 'Reflow or reset the instance in the editor.',
        });
        affectedPagesSet.add(pageNo);
        affectedInstanceIdsSet.add(inst.instanceId);
      }

      if (inst.role === 'puzzle') puzzleInstances.push(inst);
      if (inst.role === 'solution') solutionInstances.push(inst);
    });

    // Check overlapping puzzle instances on the same page
    const pagePuzzles = instances.filter((i) => i.role === 'puzzle');
    if (pagePuzzles.length > 1) {
      for (let a = 0; a < pagePuzzles.length; a++) {
        for (let b = a + 1; b < pagePuzzles.length; b++) {
          const instA = pagePuzzles[a];
          const instB = pagePuzzles[b];
          const objsA = rawObjects.filter((o) => o.instanceId === instA.instanceId || instA.objectIds.includes(o.id as string));
          const objsB = rawObjects.filter((o) => o.instanceId === instB.instanceId || instB.objectIds.includes(o.id as string));
          if (objsA.length && objsB.length) {
            const boundsA = objsA.map(serializedObjectBounds).reduce((acc, r) => ({
              left: Math.min(acc.left, r.left),
              top: Math.min(acc.top, r.top),
              width: Math.max(rightOf(acc), rightOf(r)) - Math.min(acc.left, r.left),
              height: Math.max(bottomOf(acc), bottomOf(r)) - Math.min(acc.top, r.top),
            }));
            const boundsB = objsB.map(serializedObjectBounds).reduce((acc, r) => ({
              left: Math.min(acc.left, r.left),
              top: Math.min(acc.top, r.top),
              width: Math.max(rightOf(acc), rightOf(r)) - Math.min(acc.left, r.left),
              height: Math.max(bottomOf(acc), bottomOf(r)) - Math.min(acc.top, r.top),
            }));

            if (rectsOverlap(boundsA, boundsB, 2)) {
              diagnostics.push({
                code: 'OVERLAPPING_INSTANCES',
                severity: 'error',
                pageNumber: pageNo,
                pageId: page.id,
                message: `Puzzles on Page ${pageNo} overlap each other.`,
                details: { puzzleA: instA.contentId, puzzleB: instB.contentId },
                recommendedFix: 'Reflow the page or increase vertical gap between puzzles.',
              });
              affectedPagesSet.add(pageNo);
            }
          }
        }
      }
    }
  });

  // Cross-check puzzle vs solution coverage (if solutions are expected)
  if (options.requireSolutions !== false && puzzleInstances.length > 0) {
    const puzzleContentIds = new Set(puzzleInstances.map((p) => p.contentId));
    const solutionContentIds = new Set(solutionInstances.map((s) => s.contentId));

    // Check missing solutions
    for (const p of puzzleInstances) {
      if (!solutionContentIds.has(p.contentId)) {
        diagnostics.push({
          code: 'MISSING_SOLUTION',
          severity: 'error',
          instanceId: p.instanceId,
          message: `Puzzle "${p.source.theme ?? p.contentId}" is missing its answer key solution.`,
          details: { puzzleId: p.contentId },
          recommendedFix: 'Regenerate solution pages or enable answer key generation.',
        });
        affectedInstanceIdsSet.add(p.instanceId);
      }
    }

    // Check orphan solutions
    for (const s of solutionInstances) {
      if (!puzzleContentIds.has(s.contentId)) {
        diagnostics.push({
          code: 'ORPHAN_SOLUTION',
          severity: 'warn',
          instanceId: s.instanceId,
          message: `Solution instance "${s.instanceId}" references a puzzle (${s.contentId}) that is not present in the interior pages.`,
          details: { solutionId: s.contentId },
          recommendedFix: 'Verify puzzle numbering or regenerate answer key pages.',
        });
        affectedInstanceIdsSet.add(s.instanceId);
      }
    }
  }

  // ------------------------------------------------------------------ 3. LAYOUT, SAFE AREA & GUTTER
  const totalPagesCount = Math.max(24, targetPages.length);
  const margins = kdpMarginsFor(totalPagesCount);

  targetPages.forEach((p, pageIdx) => {
    const pageNo = pageIdx + 1;
    const safe = safeAreaFor(p.width, p.height, pageNo, margins);
    const pageRect = { left: 0, top: 0, width: p.width, height: p.height };
    const rawObjects = (((p.data as Record<string, unknown>)?.objects ?? []) as AnyObj[]).filter(isVisible);

    rawObjects.forEach((o) => {
      const bounds = serializedObjectBounds(o);
      const isText = isTextObject(o);
      const outsidePageBounds = outside(bounds, pageRect, 0.5);
      const outsideSafeArea = outside(bounds, safe, 1);
      const strokeWidth = Number(o.strokeWidth ?? 0);
      const hasStroke = typeof o.stroke === 'string' && o.stroke !== '' && o.stroke !== 'transparent';

      if (outsidePageBounds) {
        diagnostics.push({
          code: 'OBJECT_OUTSIDE_PAGE',
          severity: isText ? 'error' : 'warn',
          pageNumber: pageNo,
          pageId: p.id,
          objectId: o.id as string,
          message: `Object (${o.name ?? o.type ?? 'element'}) on Page ${pageNo} is positioned completely or partially outside the page boundary.`,
          details: { bounds, pageRect },
          recommendedFix: 'Move object inside the page boundary.',
        });
        affectedPagesSet.add(pageNo);
        if (o.id) affectedObjectIdsSet.add(o.id as string);
      }

      if (isText && outsideSafeArea) {
        diagnostics.push({
          code: 'TEXT_OUTSIDE_SAFE_AREA',
          severity: 'error',
          pageNumber: pageNo,
          pageId: p.id,
          objectId: o.id as string,
          message: `Text object "${String(o.text ?? '').slice(0, 20)}" on Page ${pageNo} extends outside the safe area margins.`,
          details: { bounds, safeArea: safe },
          recommendedFix: 'Move text inside the safe margins to prevent trimming in print.',
        });
        affectedPagesSet.add(pageNo);
        if (o.id) affectedObjectIdsSet.add(o.id as string);
      }

      // Check text readability thresholds
      if (isText && typeof o.fontSize === 'number') {
        const isSolutionText =
          wsMetaOf(p)?.kind === 'solution' ||
          (typeof o.instanceId === 'string' && o.instanceId.startsWith('inst-sol')) ||
          o.instanceRole === 'solution' ||
          o.wsRole === 'ws-answer';
        const minThreshold = isSolutionText ? 3.5 : 6;
        if (o.fontSize < minThreshold) {
          diagnostics.push({
            code: 'UNREADABLE_TEXT',
            severity: 'error',
            pageNumber: pageNo,
            pageId: p.id,
            objectId: o.id as string,
            message: `Text on Page ${pageNo} has a font size of ${o.fontSize.toFixed(1)}pt (below minimum readable threshold of ${minThreshold}pt).`,
            details: { fontSize: o.fontSize, minThreshold },
            recommendedFix: 'Increase font size for print readability.',
          });
          affectedPagesSet.add(pageNo);
          if (o.id) affectedObjectIdsSet.add(o.id as string);
        }
      }

      // Check thin lines
      if (hasStroke && strokeWidth > 0 && strokeWidth < KDP_MIN_LINE_WIDTH_PT) {
        diagnostics.push({
          code: 'THIN_LINES',
          severity: 'warn',
          pageNumber: pageNo,
          pageId: p.id,
          objectId: o.id as string,
          message: `Line stroke (${strokeWidth.toFixed(2)}pt) on Page ${pageNo} is thinner than the 0.75pt print threshold.`,
          details: { strokeWidth },
          recommendedFix: 'Increase line thickness to at least 0.75pt.',
        });
        affectedPagesSet.add(pageNo);
        if (o.id) affectedObjectIdsSet.add(o.id as string);
      }
    });
  });

  // ------------------------------------------------------------------ 4. SUMMARY & RECOMMENDATIONS
  const errors = diagnostics.filter((d) => d.severity === 'error');
  const warnings = diagnostics.filter((d) => d.severity === 'warn');

  const status: PreflightStatus = errors.length > 0 ? 'blocked' : warnings.length > 0 ? 'warnings' : 'pass';

  let summary = '';
  if (status === 'pass') {
    summary = 'Preflight passed — Ready for Novelka export checks.';
  } else if (status === 'warnings') {
    summary = `Preflight has ${warnings.length} warning(s) — Review items before export.`;
  } else {
    summary = `Preflight blocked export: ${errors.length} error(s) must be resolved.`;
  }

  const recommendedFixes = [
    ...new Set(diagnostics.map((d) => d.recommendedFix).filter(Boolean)),
  ] as string[];

  return {
    status,
    errors,
    warnings,
    affectedPages: [...affectedPagesSet].sort((a, b) => a - b),
    affectedInstanceIds: [...affectedInstanceIdsSet],
    affectedObjectIds: [...affectedObjectIdsSet],
    summary,
    recommendedFixes,
  };
}
