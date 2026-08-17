import * as fabric from 'fabric';
import { nanoid } from 'nanoid';
import { chunk, objectsToPageData } from '../shared/puzzle-utils';
import { clampObjectsToSafeArea } from '../shared/kdp-clamp';
import type { Page } from '../../types/canvas.types';
import type { WordSearchPuzzle } from './generator';
import {
  bankHeight,
  renderWordSearch,
  renderWordSearchFromFrame,
  tagObject,
  wsLabel,
  DEFAULT_WS_STYLE,
  type WordSearchStyle,
} from './renderer';
import { getWsTemplate, type WsTemplateContext } from './templates';
import { computePageGeometry, VALIDATED_TRIM_SIZES } from '../../domain/geometry';
import { layoutWordSearchPage } from '../../domain/word-search-solver';
import { createGeneratedInstance } from '../../domain/instance-manager';
import { resolveParametricTemplate } from '../../domain/template-registry';
import { createWarning, WARNING_CODES } from '../../domain/warnings';
import type {
  GeneratedInstance,
  LayoutWarning,
  StyleConfiguration,
  WordSearchContentSpec,
} from '../../domain/types';

export function toDomainStyle(style: WordSearchStyle): StyleConfiguration {
  return {
    fontFamily: style.fontFamily,
    letterColor: style.letterColor,
    gridLineColor: style.gridLineColor,
    gridLineWidth: style.gridLineWidth,
    frameWidth: style.frameWidth,
    backgroundColor: style.backgroundColor,
    fontScale: style.fontScale,
    letterSpacing: style.letterSpacing,
    letterCase: style.letterCase,
    gridStyle: style.gridStyle,
    bankStyle: style.bankStyle,
    bankColumns: style.bankColumns,
    bankFontSize: style.bankFontSize,
    bankColor: style.bankColor,
    titleFontSize: style.titleFontSize ?? 18,
    titleColor: style.titleColor ?? style.letterColor,
    showTitle: style.showTitle,
    showDifficulty: style.showDifficulty,
    showWordBank: style.showWordBank,
    answerColor: style.answerColor,
    answerStyle: style.answerStyle,
  };
}

export function detectTrimSizeKey(width: number, height: number): string | undefined {
  for (const [key, size] of Object.entries(VALIDATED_TRIM_SIZES)) {
    if (Math.abs(size.width - width) < 1 && Math.abs(size.height - height) < 1) {
      return key;
    }
  }
  return undefined;
}

export type WsSolutionPlacement = 'back_of_book' | 'next_page' | 'none';

export interface WsLayoutOptions {
  puzzlesPerPage: number;
  solutionsPerPage: number;
  solutionPlacement: WsSolutionPlacement;
  /** honour the KDP gutter when placing content */
  kdpSafe: boolean;
  /** margin used when kdpSafe is false, in points */
  margin: number;
  /** heading before the answers section */
  solutionsHeading: string;
  /** page design used for puzzle pages */
  templateId: string;
  /** optional explicit parametric template instance */
  template?: import('../../domain/template-types').ParametricTemplate;
  /** book title printed in the template header */
  title: string;
  showFolio: boolean;
  /** enforce published template status (defaults to true for production) */
  publishedOnly?: boolean;
  /** Optional fallback toggle to force legacy slot-based layout */
  useLegacyLayout?: boolean;
}

export const DEFAULT_WS_LAYOUT: WsLayoutOptions = {
  puzzlesPerPage: 1,
  solutionsPerPage: 4,
  solutionPlacement: 'back_of_book',
  kdpSafe: true,
  margin: 54,
  solutionsHeading: 'Answers',
  templateId: 'classic',
  title: 'Word Search',
  showFolio: true,
};

/** Marks pages this module owns, so we can re-style them later. */
export const WS_PAGE = 'novelka:wordsearch-page';

/**
 * Legacy keys still read so books saved by an earlier build keep working.
 */
export const WS_PAGE_LEGACY = 'minipdf:wordsearch-page';
export const WS_PAGE_LEGACY_GRIDPRESS = 'gridpress:wordsearch-page';
export const NOVELKA_INSTANCES = 'novelka:instances';

export interface WsPageMeta {
  kind: 'puzzle' | 'solution';
  puzzleIds: string[];
  perPage: number;
  templateId?: string;
  templateVersion?: string;
  templateStatus?: string;
}

export interface WsBuildResult {
  pages: Page[];
  puzzlePageCount: number;
  solutionPageCount: number;
  ok: boolean;
  warnings: LayoutWarning[];
  instances: GeneratedInstance[];
}

/**
 * Turn a set of puzzles into finished pages using the pure responsive layout solver.
 *
 * Preserves legacy metadata (`novelka:wordsearch-page`), creates structured
 * `GeneratedInstance` domain models with populated `objectIds`, and attaches
 * instance metadata to canvas objects.
 */
export function buildWordSearchPages(
  puzzles: WordSearchPuzzle[],
  style: WordSearchStyle,
  layout: WsLayoutOptions,
  pageSize: { width: number; height: number; trimKey?: string },
  startPageNumber = 1,
): WsBuildResult {
  if (layout.useLegacyLayout) {
    return buildWordSearchPagesLegacy(puzzles, style, layout, pageSize, startPageNumber);
  }

  const { width, height } = pageSize;
  const trimKey = pageSize.trimKey || detectTrimSizeKey(width, height);
  const pages: Page[] = [];
  const allWarnings: LayoutWarning[] = [];
  const allInstances: GeneratedInstance[] = [];
  let overallOk = true;

  // Resolve puzzle and solution parametric templates
  const resolveResult = layout.template
    ? { ok: true, template: layout.template, fallbackApplied: false, reason: undefined }
    : resolveParametricTemplate({
        templateId: layout.templateId,
        generatorKind: 'wordsearch',
        pageMode: 'puzzle',
        trimSize: trimKey,
        publishedOnly: layout.publishedOnly !== false,
      });
  const resolvedTemplate = resolveResult.template;
  if (resolveResult.fallbackApplied) {
    allWarnings.push(
      createWarning(
        WARNING_CODES.TEMPLATE_FALLBACK,
        resolveResult.reason || `Template fallback applied: using "${resolvedTemplate.name}".`,
        'warn',
        { requestedTemplateId: layout.templateId, resolvedTemplateId: resolvedTemplate.templateId },
      ),
    );
  }

  const resolveSolResult = resolveParametricTemplate({
    templateId: 'answers-ws',
    generatorKind: 'wordsearch',
    pageMode: 'solution',
    trimSize: trimKey,
    publishedOnly: layout.publishedOnly !== false,
  });
  const resolvedSolTemplate = resolveSolResult.template;
  if (resolveSolResult.fallbackApplied) {
    allWarnings.push(
      createWarning(
        WARNING_CODES.TEMPLATE_FALLBACK,
        resolveSolResult.reason || `Solution template fallback applied: using "${resolvedSolTemplate.name}".`,
        'warn',
        { requestedTemplateId: 'answers-ws', resolvedTemplateId: resolvedSolTemplate.templateId },
      ),
    );
  }

  const puzzleGroups = chunk(puzzles, layout.puzzlesPerPage);

  const estTotal =
    puzzleGroups.length +
    (layout.solutionPlacement === 'none'
      ? 0
      : layout.solutionPlacement === 'next_page'
        ? puzzleGroups.length
        : Math.ceil(puzzles.length / layout.solutionsPerPage));

  const makePuzzlePage = (group: WordSearchPuzzle[], pageNo: number): Page => {
    const pageId = nanoid(8);
    const pageInstances: GeneratedInstance[] = [];
    const objs: fabric.FabricObject[] = [];

    const pageGeometry = computePageGeometry({
      width,
      height,
      pageNumber: pageNo,
      pageCount: estTotal,
      bleed: false,
      intent: layout.kdpSafe ? 'safe' : 'minimum',
    });

    const isSingle = group.length === 1;
    const contentSpec: WordSearchContentSpec = {
      pageType: 'puzzle',
      puzzlesPerPage: group.length,
      title: layout.title,
      subtitle: isSingle ? wsLabel(group[0], style) : undefined,
      theme: isSingle ? group[0].theme : undefined,
      showFolio: layout.showFolio,
      folio: layout.showFolio ? pageNo : undefined,
      templateId: resolvedTemplate.templateId,
      template: resolvedTemplate,
      trimSizeKey: trimKey,
      puzzles: group.map((p) => ({
        id: p.id,
        index: p.index,
        title: isSingle ? undefined : wsLabel(p, style),
        theme: p.theme,
        difficulty: p.difficulty,
        size: p.size,
        words: p.placements.map((pl) => pl.word),
        secret: p.secret,
      })),
    };

    const effectivePuzzleStyle: WordSearchStyle = {
      ...DEFAULT_WS_STYLE,
      ...(resolvedTemplate.styleTokens as Partial<WordSearchStyle>),
      ...Object.fromEntries(
        Object.entries(style).filter(([k, v]) => {
          if (v === undefined) return false;
          if (resolvedTemplate.styleTokens[k] !== undefined && v === (DEFAULT_WS_STYLE as unknown as Record<string, unknown>)[k]) {
            return false;
          }
          return true;
        }),
      ),
    };

    const domainStyle: StyleConfiguration = toDomainStyle(effectivePuzzleStyle);
    const layoutResult = layoutWordSearchPage(pageGeometry, contentSpec, domainStyle);
    if (!layoutResult.ok) {
      overallOk = false;
    }
    allWarnings.push(...layoutResult.warnings);

    if (resolveResult.fallbackApplied && resolveResult.reason) {
      layoutResult.fallbackDecisions.push({
        rule: 'TEMPLATE_FALLBACK',
        reason: resolveResult.reason,
        from: layout.templateId,
        to: resolvedTemplate.templateId,
      });
    }

    const frames = layoutResult.frames;

    // 1. Page Title
    let titleInst: GeneratedInstance | undefined;
    if (frames.titleFrame && style.showTitle && layout.title) {
      const titleInstId = `inst-title-${nanoid(8)}`;
      const titleObj = tagObject(
        new fabric.Textbox(layout.title, {
          left: frames.titleFrame.left,
          top: frames.titleFrame.top,
          width: frames.titleFrame.width,
          fontSize: layoutResult.measurements.titleFontSize,
          fontFamily: effectivePuzzleStyle.fontFamily,
          fill: style.titleColor || effectivePuzzleStyle.letterColor,
          textAlign: 'center',
          fontWeight: 'bold',
        }),
        'ws-title',
        pageId,
        titleInstId,
        'title',
      );
      objs.push(titleObj);

      titleInst = createGeneratedInstance({
        instanceId: titleInstId,
        kind: 'word-search-title',
        pageId,
        contentId: `title-${pageId}`,
        role: 'title',
        layout: { boxSize: frames.titleFrame.width },
        style: domainStyle,
        source: { rawMetadata: { text: layout.title } },
      });
      titleInst.objectIds = [(titleObj as unknown as { id: string }).id];

      // Subtitle
      if (frames.subtitleFrame && contentSpec.subtitle) {
        const subObj = tagObject(
          new fabric.Textbox(contentSpec.subtitle, {
            left: frames.subtitleFrame.left,
            top: frames.subtitleFrame.top,
            width: frames.subtitleFrame.width,
            fontSize: Math.max(8, Math.round(layoutResult.measurements.titleFontSize * 0.55)),
            fontFamily: effectivePuzzleStyle.fontFamily,
            fill: '#6b7280',
            textAlign: 'center',
          }),
          'ws-subtitle',
          pageId,
          titleInstId,
          'subtitle',
        );
        objs.push(subObj);
        titleInst.objectIds.push((subObj as unknown as { id: string }).id);
      }
      pageInstances.push(titleInst);
    }

    // 2. Page Number (Folio)
    if (frames.pageNumberFrame && layout.showFolio) {
      const folioInstId = `inst-folio-${nanoid(8)}`;
      const folioObj = tagObject(
        new fabric.Textbox(String(pageNo), {
          left: frames.pageNumberFrame.left,
          top: frames.pageNumberFrame.top,
          width: frames.pageNumberFrame.width,
          fontSize: 10,
          fontFamily: effectivePuzzleStyle.fontFamily,
          fill: effectivePuzzleStyle.letterColor,
          textAlign: 'center',
        }),
        'ws-folio',
        pageId,
        folioInstId,
        'page-number',
      );
      objs.push(folioObj);

      const folioInst = createGeneratedInstance({
        instanceId: folioInstId,
        kind: 'word-search-folio',
        pageId,
        contentId: `folio-${pageId}`,
        role: 'page-number',
        layout: { boxSize: frames.pageNumberFrame.width },
        style: domainStyle,
        source: { rawMetadata: { folio: pageNo } },
      });
      folioInst.objectIds = [(folioObj as unknown as { id: string }).id];
      pageInstances.push(folioInst);
    }

    // 3. Puzzle Units
    group.forEach((p, i) => {
      const pf = frames.puzzles[Math.min(i, frames.puzzles.length - 1)];
      const puzzleInstId = `inst-ws-${nanoid(8)}`;

      const puzzleObjs = renderWordSearchFromFrame(p, pf, effectivePuzzleStyle, {
        instanceId: puzzleInstId,
        label: pf.captionFrame ? wsLabel(p, effectivePuzzleStyle) : undefined,
      });
      objs.push(...puzzleObjs);

      const puzzleObjIds = puzzleObjs.map((o) => (o as unknown as { id: string }).id);

      const puzzleInstance = createGeneratedInstance({
        instanceId: puzzleInstId,
        kind: 'word-search',
        pageId,
        contentId: p.id,
        role: 'puzzle',
        layout: {
          boxSize: pf.gridFrame.width,
          puzzlesPerPage: group.length,
          puzzleIndex: p.index,
          bankColumns: pf.bankColumns,
        },
        style: domainStyle,
        source: {
          puzzleIndex: p.index,
          theme: p.theme,
          difficulty: p.difficulty,
          gridSize: p.size,
          words: p.placements.map((pl) => pl.word),
          secret: p.secret,
        },
      });
      puzzleInstance.objectIds = puzzleObjIds;
      pageInstances.push(puzzleInstance);
    });

    allInstances.push(...pageInstances);

    // KDP safe clamp is only applied if layout succeeded; solver failures must not be silently masked
    if (layout.kdpSafe && layoutResult.ok) {
      clampObjectsToSafeArea(objs, {
        w: width,
        h: height,
        pageNumber: pageNo,
        pageCount: estTotal,
      });
    }

    const pageName = `Word search ${group[0].index}${group.length > 1 ? `-${group[group.length - 1].index}` : ''}`;

    return {
      id: pageId,
      name: pageName,
      width,
      height,
      background: '#ffffff',
      role: 'interior',
      kind: 'wordsearch' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        templateId: resolvedTemplate.templateId,
        templateVersion: resolvedTemplate.version,
        templateStatus: resolvedTemplate.status,
        templateFallbackApplied: resolveResult.fallbackApplied,
        templateFallbackReason: resolveResult.reason,
        layoutDecisions: layoutResult.fallbackDecisions,
        [WS_PAGE]: {
          kind: 'puzzle',
          puzzleIds: group.map((p) => p.id),
          perPage: layout.puzzlesPerPage,
          templateId: resolvedTemplate.templateId,
          templateVersion: resolvedTemplate.version,
          templateStatus: resolvedTemplate.status,
        } satisfies WsPageMeta,
        [NOVELKA_INSTANCES]: pageInstances,
        instances: pageInstances,
        layoutResult,
        ok: layoutResult.ok,
        invalidForProduction: !layoutResult.ok,
        layoutWarnings: layoutResult.warnings,
      },
    };
  };

  const makeSolutionPage = (
    group: WordSearchPuzzle[],
    pageNo: number,
    heading?: string,
  ): Page => {
    const pageId = nanoid(8);
    const pageInstances: GeneratedInstance[] = [];
    const objs: fabric.FabricObject[] = [];

    const pageGeometry = computePageGeometry({
      width,
      height,
      pageNumber: pageNo,
      pageCount: estTotal,
      bleed: false,
      intent: layout.kdpSafe ? 'safe' : 'minimum',
    });

    const solHeading = heading ?? layout.solutionsHeading;
    const contentSpec: WordSearchContentSpec = {
      pageType: 'solution',
      puzzlesPerPage: group.length,
      title: solHeading,
      showFolio: layout.showFolio,
      folio: layout.showFolio ? pageNo : undefined,
      templateId: resolvedSolTemplate.templateId,
      template: resolvedSolTemplate,
      trimSizeKey: trimKey,
      puzzles: group.map((p) => ({
        id: p.id,
        index: p.index,
        title: `Puzzle ${p.index}`,
        theme: p.theme,
        difficulty: p.difficulty,
        size: p.size,
        words: [],
      })),
    };

    const effectiveSolStyle: WordSearchStyle = {
      ...DEFAULT_WS_STYLE,
      ...(resolvedSolTemplate.styleTokens as Partial<WordSearchStyle>),
      showWordBank: false,
      gridStyle: 'plain',
      fontScale: (style.fontScale || DEFAULT_WS_STYLE.fontScale) * 0.9,
      ...Object.fromEntries(
        Object.entries(style).filter(([k, v]) => {
          if (v === undefined) return false;
          if (resolvedSolTemplate.styleTokens[k] !== undefined && v === (DEFAULT_WS_STYLE as unknown as Record<string, unknown>)[k]) {
            return false;
          }
          return true;
        }),
      ),
    };
    const solDomainStyle = toDomainStyle(effectiveSolStyle);
    const layoutResult = layoutWordSearchPage(pageGeometry, contentSpec, solDomainStyle);
    if (!layoutResult.ok) {
      overallOk = false;
    }
    allWarnings.push(...layoutResult.warnings);

    if (resolveSolResult.fallbackApplied && resolveSolResult.reason) {
      layoutResult.fallbackDecisions.push({
        rule: 'TEMPLATE_FALLBACK',
        reason: resolveSolResult.reason,
        from: 'answers-ws',
        to: resolvedSolTemplate.templateId,
      });
    }

    const frames = layoutResult.frames;

    // 1. Solution Page Title
    if (frames.titleFrame) {
      const titleInstId = `inst-title-${nanoid(8)}`;
      const titleObj = tagObject(
        new fabric.Textbox(solHeading, {
          left: frames.titleFrame.left,
          top: frames.titleFrame.top,
          width: frames.titleFrame.width,
          fontSize: layoutResult.measurements.titleFontSize,
          fontFamily: effectiveSolStyle.fontFamily,
          fill: style.titleColor || effectiveSolStyle.letterColor,
          textAlign: 'center',
          fontWeight: 'bold',
        }),
        'ws-title',
        pageId,
        titleInstId,
        'title',
      );
      objs.push(titleObj);

      const titleInst = createGeneratedInstance({
        instanceId: titleInstId,
        kind: 'word-search-title',
        pageId,
        contentId: `title-${pageId}`,
        role: 'title',
        layout: { boxSize: frames.titleFrame.width },
        style: solDomainStyle,
        source: { rawMetadata: { text: solHeading } },
      });
      titleInst.objectIds = [(titleObj as unknown as { id: string }).id];
      pageInstances.push(titleInst);
    }

    // 2. Page Number (Folio)
    if (frames.pageNumberFrame && layout.showFolio) {
      const folioInstId = `inst-folio-${nanoid(8)}`;
      const folioObj = tagObject(
        new fabric.Textbox(String(pageNo), {
          left: frames.pageNumberFrame.left,
          top: frames.pageNumberFrame.top,
          width: frames.pageNumberFrame.width,
          fontSize: 10,
          fontFamily: effectiveSolStyle.fontFamily,
          fill: effectiveSolStyle.letterColor,
          textAlign: 'center',
        }),
        'ws-folio',
        pageId,
        folioInstId,
        'page-number',
      );
      objs.push(folioObj);

      const folioInst = createGeneratedInstance({
        instanceId: folioInstId,
        kind: 'word-search-folio',
        pageId,
        contentId: `folio-${pageId}`,
        role: 'page-number',
        layout: { boxSize: frames.pageNumberFrame.width },
        style: solDomainStyle,
        source: { rawMetadata: { folio: pageNo } },
      });
      folioInst.objectIds = [(folioObj as unknown as { id: string }).id];
      pageInstances.push(folioInst);
    }

    // 3. Solution Units
    group.forEach((p, i) => {
      const pf = frames.puzzles[Math.min(i, frames.puzzles.length - 1)];
      const solInstId = `inst-sol-${nanoid(8)}`;

      const solObjs = renderWordSearchFromFrame(
        p,
        pf,
        effectiveSolStyle,
        {
          instanceId: solInstId,
          answers: true,
          label: `Puzzle ${p.index}`,
          compact: true,
        },
      );
      objs.push(...solObjs);

      const solObjIds = solObjs.map((o) => (o as unknown as { id: string }).id);

      const solInstance = createGeneratedInstance({
        instanceId: solInstId,
        kind: 'word-search-solution',
        pageId,
        contentId: p.id,
        role: 'solution',
        layout: {
          boxSize: pf.gridFrame.width,
          puzzlesPerPage: group.length,
          puzzleIndex: p.index,
        },
        style: solDomainStyle,
        source: {
          puzzleIndex: p.index,
          theme: p.theme,
          difficulty: p.difficulty,
          gridSize: p.size,
          words: p.placements.map((pl) => pl.word),
        },
      });
      solInstance.objectIds = solObjIds;
      pageInstances.push(solInstance);
    });

    allInstances.push(...pageInstances);

    if (layout.kdpSafe && layoutResult.ok) {
      clampObjectsToSafeArea(objs, {
        w: width,
        h: height,
        pageNumber: pageNo,
        pageCount: estTotal,
      });
    }

    const pageName = `Answers ${group[0].index}${group.length > 1 ? `-${group[group.length - 1].index}` : ''}`;

    return {
      id: pageId,
      name: pageName,
      width,
      height,
      background: '#ffffff',
      role: 'interior',
      kind: 'wordsearch' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        templateId: resolvedSolTemplate.templateId,
        templateVersion: resolvedSolTemplate.version,
        templateStatus: resolvedSolTemplate.status,
        templateFallbackApplied: resolveSolResult.fallbackApplied,
        templateFallbackReason: resolveSolResult.reason,
        layoutDecisions: layoutResult.fallbackDecisions,
        [WS_PAGE]: {
          kind: 'solution',
          puzzleIds: group.map((p) => p.id),
          perPage: layout.solutionsPerPage,
          templateId: resolvedSolTemplate.templateId,
          templateVersion: resolvedSolTemplate.version,
          templateStatus: resolvedSolTemplate.status,
        } satisfies WsPageMeta,
        [NOVELKA_INSTANCES]: pageInstances,
        instances: pageInstances,
        layoutResult,
        ok: layoutResult.ok,
        invalidForProduction: !layoutResult.ok,
        layoutWarnings: layoutResult.warnings,
      },
    };
  };

  let pageNo = startPageNumber;
  let solutionPageCount = 0;

  if (layout.solutionPlacement === 'next_page') {
    for (const group of puzzleGroups) {
      pages.push(makePuzzlePage(group, pageNo++));
      pages.push(makeSolutionPage(group, pageNo++));
      solutionPageCount++;
    }
  } else {
    for (const group of puzzleGroups) {
      pages.push(makePuzzlePage(group, pageNo++));
    }
    if (layout.solutionPlacement === 'back_of_book') {
      const solGroups = chunk(puzzles, layout.solutionsPerPage);
      solGroups.forEach((group, i) => {
        pages.push(
          makeSolutionPage(group, pageNo++, i === 0 ? layout.solutionsHeading : undefined),
        );
        solutionPageCount++;
      });
    }
  }

  return {
    pages,
    puzzlePageCount: puzzleGroups.length,
    solutionPageCount,
    ok: overallOk,
    warnings: allWarnings,
    instances: allInstances,
  };
}

/**
 * Legacy template fallback path preserved for backward compatibility.
 */
export function buildWordSearchPagesLegacy(
  puzzles: WordSearchPuzzle[],
  style: WordSearchStyle,
  layout: WsLayoutOptions,
  pageSize: { width: number; height: number },
  startPageNumber = 1,
): WsBuildResult {
  const { width, height } = pageSize;
  const pages: Page[] = [];
  const instances: GeneratedInstance[] = [];

  const puzzleGroups = chunk(puzzles, layout.puzzlesPerPage);

  const estTotal =
    puzzleGroups.length +
    (layout.solutionPlacement === 'none'
      ? 0
      : layout.solutionPlacement === 'next_page'
        ? puzzleGroups.length
        : Math.ceil(puzzles.length / layout.solutionsPerPage));

  const makePuzzlePage = (group: WordSearchPuzzle[], pageNo: number): Page => {
    const tpl = getWsTemplate(layout.templateId);
    const pageId = nanoid(8);
    const page: Page = {
      id: pageId, name: '', width, height, background: '#ffffff', data: null,
    };

    const words = group[0].placements.length;
    const tctx: WsTemplateContext = {
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      count: group.length,
      gridSize: group[0].size,
      wordCount: words,
      bankHeight: bankHeight(words, style),
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      title: layout.title,
      subtitle: wsLabel(group[0], style),
      theme: group[0].theme,
      folio: layout.showFolio ? pageNo : undefined,
      ink: style.letterColor,
      accent: '#2b7fb8',
    };

    const { chrome, slots } = tpl.build(tctx);
    const objs: fabric.FabricObject[] = [...chrome];
    const pageInstances: GeneratedInstance[] = [];

    group.forEach((p, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      const caption = slot.captionTop !== undefined ? wsLabel(p, style) : undefined;
      const instId = `inst-ws-${nanoid(8)}`;
      const pObjs = renderWordSearch(
        p,
        { left: slot.left, top: slot.captionTop ?? slot.top, size: slot.size },
        { ...style, bankColumns: slot.bankColumns ?? style.bankColumns },
        { label: caption, bankBottom: slot.bankTop, instanceId: instId, instanceRole: 'puzzle' },
      );
      objs.push(...pObjs);

      const inst = createGeneratedInstance({
        instanceId: instId,
        kind: 'word-search',
        pageId,
        contentId: p.id,
        role: 'puzzle',
        layout: { boxSize: slot.size, puzzlesPerPage: group.length, puzzleIndex: p.index },
        style: toDomainStyle(style),
        source: { puzzleIndex: p.index, theme: p.theme, difficulty: p.difficulty, gridSize: p.size },
      });
      inst.objectIds = pObjs.map((o) => (o as unknown as { id: string }).id);
      pageInstances.push(inst);
    });

    if (layout.kdpSafe) {
      clampObjectsToSafeArea(objs, {
        w: width, h: height, pageNumber: pageNo, pageCount: estTotal,
      });
    }

    instances.push(...pageInstances);

    return {
      ...page,
      name: `Word search ${group[0].index}${group.length > 1 ? `-${group[group.length - 1].index}` : ''}`,
      role: 'interior',
      kind: 'wordsearch' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [WS_PAGE]: {
          kind: 'puzzle',
          puzzleIds: group.map((p) => p.id),
          perPage: layout.puzzlesPerPage,
          templateId: layout.templateId,
        } satisfies WsPageMeta,
        [NOVELKA_INSTANCES]: pageInstances,
        instances: pageInstances,
      },
    };
  };

  const makeSolutionPage = (
    group: WordSearchPuzzle[],
    pageNo: number,
    heading?: string,
  ): Page => {
    const tpl = getWsTemplate('answers');
    const pageId = nanoid(8);
    const page: Page = {
      id: pageId, name: '', width, height, background: '#ffffff', data: null,
    };

    const { chrome, slots } = tpl.build({
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      count: group.length,
      gridSize: group[0].size,
      wordCount: 0,
      bankHeight: 0,
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      title: heading ?? layout.solutionsHeading,
      folio: layout.showFolio ? pageNo : undefined,
      ink: style.letterColor,
      accent: '#2b7fb8',
    });

    const objs: fabric.FabricObject[] = [...chrome];
    const pageInstances: GeneratedInstance[] = [];

    group.forEach((p, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      const instId = `inst-sol-${nanoid(8)}`;
      const sObjs = renderWordSearch(
        p,
        { left: slot.left, top: slot.captionTop ?? slot.top, size: slot.size },
        { ...style, showWordBank: false, gridStyle: 'plain', fontScale: style.fontScale * 0.9 },
        { answers: true, label: `Puzzle ${p.index}`, compact: true, instanceId: instId, instanceRole: 'solution' },
      );
      objs.push(...sObjs);

      const inst = createGeneratedInstance({
        instanceId: instId,
        kind: 'word-search-solution',
        pageId,
        contentId: p.id,
        role: 'solution',
        layout: { boxSize: slot.size, puzzlesPerPage: group.length, puzzleIndex: p.index },
        style: toDomainStyle(style),
        source: { puzzleIndex: p.index, theme: p.theme, difficulty: p.difficulty, gridSize: p.size },
      });
      inst.objectIds = sObjs.map((o) => (o as unknown as { id: string }).id);
      pageInstances.push(inst);
    });

    if (layout.kdpSafe) {
      clampObjectsToSafeArea(objs, {
        w: width, h: height, pageNumber: pageNo, pageCount: estTotal,
      });
    }

    instances.push(...pageInstances);

    return {
      ...page,
      name: `Answers ${group[0].index}${group.length > 1 ? `-${group[group.length - 1].index}` : ''}`,
      role: 'interior',
      kind: 'wordsearch' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [WS_PAGE]: {
          kind: 'solution',
          puzzleIds: group.map((p) => p.id),
          perPage: layout.solutionsPerPage,
          templateId: 'answers',
        } satisfies WsPageMeta,
        [NOVELKA_INSTANCES]: pageInstances,
        instances: pageInstances,
      },
    };
  };

  let pageNo = startPageNumber;
  let solutionPageCount = 0;

  if (layout.solutionPlacement === 'next_page') {
    for (const group of puzzleGroups) {
      pages.push(makePuzzlePage(group, pageNo++));
      pages.push(makeSolutionPage(group, pageNo++));
      solutionPageCount++;
    }
  } else {
    for (const group of puzzleGroups) {
      pages.push(makePuzzlePage(group, pageNo++));
    }
    if (layout.solutionPlacement === 'back_of_book') {
      const solGroups = chunk(puzzles, layout.solutionsPerPage);
      solGroups.forEach((group, i) => {
        pages.push(
          makeSolutionPage(group, pageNo++, i === 0 ? layout.solutionsHeading : undefined),
        );
        solutionPageCount++;
      });
    }
  }

  return {
    pages,
    puzzlePageCount: puzzleGroups.length,
    solutionPageCount,
    ok: true,
    warnings: [],
    instances,
  };
}

/** Read this module's metadata off a page, if it owns it. */
export function wsMetaOf(page: Page): WsPageMeta | null {
  const d = page.data as Record<string, unknown> | null;
  const meta = (d?.[WS_PAGE] ?? d?.[WS_PAGE_LEGACY] ?? d?.[WS_PAGE_LEGACY_GRIDPRESS]) as WsPageMeta | undefined;
  return meta ?? null;
}

/** Read structured instances off a page if present. */
export function wsInstancesOf(page: Page): GeneratedInstance[] {
  const d = page.data as Record<string, unknown> | null;
  const insts = (d?.[NOVELKA_INSTANCES] ?? d?.instances) as GeneratedInstance[] | undefined;
  return Array.isArray(insts) ? insts : [];
}
