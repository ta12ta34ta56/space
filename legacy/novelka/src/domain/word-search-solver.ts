import type {
  PageGeometry,
  StyleConfiguration,
  WordSearchContentSpec,
  WordSearchLayoutConstraints,
  WordSearchLayoutResult,
  WordSearchFrames,
  PuzzleLayoutFrame,
  RectFrame,
  LayoutWarning,
  FallbackDecision,
  LayoutMeasurements,
  ResolvedTemplateMetadata,
} from './types';
import { createWarning, WARNING_CODES } from './warnings';
import { resolveParametricTemplate } from './template-registry';
import type { ParametricTemplate } from './template-types';

const DEFAULT_CONSTRAINTS: Required<WordSearchLayoutConstraints> = {
  minCellSize: 12, // pt
  minLetterSize: 6, // pt
  minTitleSize: 10, // pt
  minBankFontSize: 7, // pt
  maxBankColumns: 5,
  targetGap: 14, // pt between grid and bank
  headerGap: 10, // pt below title
  footerGap: 10, // pt above page number
  titleMaxHeightRatio: 0.12,
  bankMaxHeightRatio: 0.45,
};

const DEFAULT_STYLE: StyleConfiguration = {
  fontFamily: 'Inter',
  letterColor: '#111827',
  gridLineColor: '#c7ced8',
  gridLineWidth: 0.6,
  frameWidth: 1.6,
  backgroundColor: null,
  fontScale: 0.56,
  letterSpacing: 0,
  letterCase: 'upper',
  gridStyle: 'plain',
  bankStyle: 'columns',
  bankColumns: 3,
  bankFontSize: 11,
  bankColor: '#111827',
  titleFontSize: 18,
  titleColor: '#111827',
  showTitle: true,
  showDifficulty: false,
  showWordBank: true,
  answerColor: '#d64550',
  answerStyle: 'oval',
};

/** Approximate text width helper for standard proportional fonts (PDF points). */
function approximateTextWidth(text: string, fontSize: number): number {
  if (!text) return 0;
  // Standard sans/serif average character width is ~0.52 to 0.58 of font size.
  return text.length * fontSize * 0.55;
}

/** Check if a rectangle collides with the safe area boundary. */
function checkSafeAreaCollision(
  frame: RectFrame,
  safeArea: RectFrame,
  tolerance = 0.05,
): boolean {
  return (
    frame.left < safeArea.left - tolerance ||
    frame.top < safeArea.top - tolerance ||
    frame.left + frame.width > safeArea.left + safeArea.width + tolerance ||
    frame.top + frame.height > safeArea.top + safeArea.height + tolerance
  );
}

/** Check if a rectangle collides with the gutter margin. */
function checkGutterCollision(
  frame: RectFrame,
  geometry: PageGeometry,
  tolerance = 0.05,
): boolean {
  if (geometry.isRecto) {
    // Recto: gutter is on the left edge [0 .. gutter]
    return frame.left < geometry.margins.gutter - tolerance;
  }
  // Verso: gutter is on the right edge [width - gutter .. width]
  return frame.left + frame.width > geometry.width - geometry.margins.gutter + tolerance;
}

/**
 * Pure responsive layout solver for word-search pages.
 *
 * Sizing math is fully responsive and deterministic, honoring PDF points, KDP safe areas,
 * odd/even gutter shifts, content density, and user-configurable minimum readability rules.
 */
export function layoutWordSearchPage(
  geometry: PageGeometry,
  spec: WordSearchContentSpec,
  styleConfig: Partial<StyleConfiguration> = {},
  constraintsConfig: WordSearchLayoutConstraints = {},
): WordSearchLayoutResult {
  const warnings: LayoutWarning[] = [];
  const fallbackDecisions: FallbackDecision[] = [];

  const isSolution = spec.pageType === 'solution';
  const puzzles = spec.puzzles.length ? spec.puzzles : [];
  const puzzleCount = puzzles.length || 1;
  const puzzlesPerPage = spec.puzzlesPerPage ?? puzzleCount;

  // ------------------------------------------------------------------ 0. RESOLVE PARAMETRIC TEMPLATE
  let template: ParametricTemplate | undefined = spec.template;
  let templateFallbackApplied = false;
  let templateFallbackReason: string | undefined;

  if (!template && spec.templateId) {
    const resolveRes = resolveParametricTemplate({
      templateId: spec.templateId,
      generatorKind: 'wordsearch',
      pageMode: spec.pageType,
      trimSize: spec.trimSizeKey,
      publishedOnly: true,
    });
    template = resolveRes.template;
    templateFallbackApplied = resolveRes.fallbackApplied;
    templateFallbackReason = resolveRes.reason;
  }

  if (templateFallbackApplied && templateFallbackReason) {
    fallbackDecisions.push({
      rule: 'TEMPLATE_FALLBACK',
      reason: templateFallbackReason,
      from: spec.templateId ?? 'unknown',
      to: template?.templateId ?? 'default',
    });
  }

  // Extract regions & slot rules from template
  const slot = template?.slots.find((s) => s.puzzlesPerPage === puzzlesPerPage) ?? template?.slots[0];
  const titleRegion = template?.regions.find((r) => r.role === 'title' || r.role === 'solution-title');
  const subtitleRegion = template?.regions.find((r) => r.role === 'subtitle');
  const gridRegion = template?.regions.find((r) => r.role === 'puzzle-grid' || r.role === 'solution-grid');
  const bankRegion = template?.regions.find((r) => r.role === 'word-list');
  const folioRegion = template?.regions.find((r) => r.role === 'page-number');

  const templateConstraints = template?.constraints ?? {};
  const effectiveMinCellSize =
    constraintsConfig.minCellSize ??
    gridRegion?.constraints?.minCellSize ??
    templateConstraints.minCellSize ??
    (isSolution && puzzlesPerPage >= 3 ? 7 : DEFAULT_CONSTRAINTS.minCellSize);

  const effectiveMinLetterSize =
    constraintsConfig.minLetterSize ??
    templateConstraints.minLetterSize ??
    (isSolution && puzzlesPerPage >= 3 ? 3.5 : DEFAULT_CONSTRAINTS.minLetterSize);

  const effectiveMinTitleSize =
    constraintsConfig.minTitleSize ??
    titleRegion?.constraints?.minFontSize ??
    templateConstraints.minTitleSize ??
    DEFAULT_CONSTRAINTS.minTitleSize;

  const effectiveMinBankFontSize =
    constraintsConfig.minBankFontSize ??
    bankRegion?.constraints?.minFontSize ??
    templateConstraints.minBankFontSize ??
    DEFAULT_CONSTRAINTS.minBankFontSize;

  const effectiveMaxBankColumns =
    constraintsConfig.maxBankColumns ??
    bankRegion?.constraints?.maxColumns ??
    (templateConstraints.maxBankColumns as number) ??
    DEFAULT_CONSTRAINTS.maxBankColumns;

  const effectiveTargetGap =
    constraintsConfig.targetGap ??
    slot?.targetGap ??
    bankRegion?.spacing?.top ??
    DEFAULT_CONSTRAINTS.targetGap;

  const effectiveHeaderGap =
    constraintsConfig.headerGap ??
    titleRegion?.spacing?.bottom ??
    DEFAULT_CONSTRAINTS.headerGap;

  const effectiveFooterGap =
    constraintsConfig.footerGap ??
    folioRegion?.spacing?.bottom ??
    folioRegion?.spacing?.top ??
    DEFAULT_CONSTRAINTS.footerGap;

  const constraints: Required<WordSearchLayoutConstraints> = {
    ...DEFAULT_CONSTRAINTS,
    minCellSize: effectiveMinCellSize,
    minLetterSize: effectiveMinLetterSize,
    minTitleSize: effectiveMinTitleSize,
    minBankFontSize: effectiveMinBankFontSize,
    maxBankColumns: effectiveMaxBankColumns,
    targetGap: effectiveTargetGap,
    headerGap: effectiveHeaderGap,
    footerGap: effectiveFooterGap,
    ...constraintsConfig,
  };

  const templateStyleTokens = (template?.styleTokens ?? {}) as Partial<StyleConfiguration>;
  const style: StyleConfiguration = {
    ...DEFAULT_STYLE,
    ...templateStyleTokens,
    ...styleConfig,
  };

  const { safeArea } = geometry;

  // ------------------------------------------------------------------ 1. TITLE REGION
  let titleFrame: RectFrame | undefined;
  let subtitleFrame: RectFrame | undefined;
  let titleHeight = 0;
  let effectiveTitleFontSize = style.titleFontSize || Math.round(geometry.width * 0.05);

  if (titleRegion?.constraints?.maxFontSize && effectiveTitleFontSize > titleRegion.constraints.maxFontSize) {
    effectiveTitleFontSize = titleRegion.constraints.maxFontSize;
  }

  const rawTitle = spec.title ?? (spec.puzzles[0]?.title || (isSolution ? 'Answers' : 'Word Search'));
  const hasPageTitle = style.showTitle && Boolean(rawTitle);

  if (hasPageTitle) {
    let titleTextWidth = approximateTextWidth(rawTitle, effectiveTitleFontSize);
    const maxTitleWidth = safeArea.width;

    // Scale title down if overflowing available width
    if (titleTextWidth > maxTitleWidth) {
      const neededFontSize = Math.floor((maxTitleWidth / (rawTitle.length * 0.55)));
      if (neededFontSize >= constraints.minTitleSize) {
        fallbackDecisions.push({
          rule: 'TITLE_AUTO_SCALE',
          reason: `Scaled title font size from ${effectiveTitleFontSize}pt to ${neededFontSize}pt to fit width`,
          from: effectiveTitleFontSize,
          to: neededFontSize,
        });
        effectiveTitleFontSize = neededFontSize;
      } else {
        effectiveTitleFontSize = constraints.minTitleSize;
        warnings.push(
          createWarning(
            WARNING_CODES.TITLE_OVERFLOW,
            `Title text "${rawTitle}" exceeds safe area width (${maxTitleWidth.toFixed(1)}pt) even at minimum font size (${constraints.minTitleSize}pt).`,
            'error',
            { title: rawTitle, textWidth: titleTextWidth, maxWidth: maxTitleWidth },
            undefined,
            'title',
          ),
        );
      }
    }

    const titleBoxHeight = Math.max(18, effectiveTitleFontSize * 1.3);
    titleFrame = {
      left: safeArea.left,
      top: safeArea.top,
      width: safeArea.width,
      height: titleBoxHeight,
    };
    titleHeight = titleBoxHeight;

    // Subtitle if requested
    if (spec.subtitle || (spec.theme && !isSolution)) {
      const subText = spec.subtitle ?? spec.theme ?? '';
      let subFontSize = Math.max(
        subtitleRegion?.constraints?.minFontSize ?? 8,
        Math.round(effectiveTitleFontSize * 0.55),
      );
      if (subtitleRegion?.constraints?.maxFontSize && subFontSize > subtitleRegion.constraints.maxFontSize) {
        subFontSize = subtitleRegion.constraints.maxFontSize;
      }
      const subTextWidth = approximateTextWidth(subText, subFontSize);
      if (subTextWidth > maxTitleWidth && subText.length > 0) {
        subFontSize = Math.max(8, Math.floor(maxTitleWidth / (subText.length * 0.55)));
      }
      const subHeight = subFontSize * 1.3;
      const subSpacing = subtitleRegion?.spacing?.bottom ?? 2;
      subtitleFrame = {
        left: safeArea.left,
        top: safeArea.top + titleHeight + subSpacing,
        width: safeArea.width,
        height: subHeight,
      };
      titleHeight += subHeight + subSpacing + 2;
    }
  }

  // ------------------------------------------------------------------ 2. FOOTER / FOLIO
  let pageNumberFrame: RectFrame | undefined;
  let footerHeight = 0;
  const showFolio = spec.showFolio !== false && (spec.folio !== undefined || spec.showFolio);

  if (showFolio) {
    const folioHeight = 14;
    footerHeight = folioHeight + constraints.footerGap;
    pageNumberFrame = {
      left: safeArea.left,
      top: safeArea.top + safeArea.height - folioHeight,
      width: safeArea.width,
      height: folioHeight,
    };
  }

  // ------------------------------------------------------------------ 3. BODY BUDGET
  const titleGap = titleHeight > 0 ? constraints.headerGap : 0;
  const bodyTop = safeArea.top + titleHeight + titleGap;
  const bodyBottom = safeArea.top + safeArea.height - footerHeight;
  const availableBodyHeight = Math.max(0, bodyBottom - bodyTop);
  const availableBodyWidth = safeArea.width;

  if (availableBodyHeight <= 40) {
    warnings.push(
      createWarning(
        WARNING_CODES.CONTENT_DOES_NOT_FIT,
        `Page body height (${availableBodyHeight.toFixed(1)}pt) is too small to place puzzle content.`,
        'error',
      ),
    );
  }

  // ------------------------------------------------------------------ 4. PUZZLE STACK / GRID
  let layoutCols: number;
  let layoutRows: number;

  if (slot && slot.gridColumns > 0 && slot.gridRows > 0 && slot.puzzlesPerPage === puzzlesPerPage) {
    layoutCols = slot.gridColumns;
    layoutRows = slot.gridRows;
  } else {
    layoutCols = isSolution && puzzlesPerPage >= 3 ? (puzzlesPerPage >= 9 ? 3 : 2) : (puzzlesPerPage >= 4 ? 2 : 1);
    layoutRows = Math.ceil(puzzlesPerPage / layoutCols);
  }

  const colGap = layoutCols > 1 ? 14 : 0;
  const rowGap = layoutRows > 1 ? (isSolution ? (slot?.targetGap ?? 12) : 18) : 0;

  const unitAvailableWidth = (availableBodyWidth - colGap * (layoutCols - 1)) / layoutCols;
  const unitAvailableHeight = (availableBodyHeight - rowGap * (layoutRows - 1)) / layoutRows;

  const puzzleFrames: PuzzleLayoutFrame[] = [];

  for (let i = 0; i < puzzles.length; i++) {
    const p = puzzles[i];
    const colIdx = i % layoutCols;
    const rowIdx = Math.floor(i / layoutCols);
    const unitLeft = safeArea.left + colIdx * (unitAvailableWidth + colGap);
    const unitTop = bodyTop + rowIdx * (unitAvailableHeight + rowGap);
    const unitFrame: RectFrame = {
      left: unitLeft,
      top: unitTop,
      width: unitAvailableWidth,
      height: unitAvailableHeight,
    };

    // Caption for individual puzzle (e.g. "Puzzle 1 · Animals")
    let captionFrame: RectFrame | undefined;
    let captionHeight = 0;
    const showPuzzleCaption = (puzzlesPerPage > 1 || !hasPageTitle) && !isSolution;

    if (showPuzzleCaption) {
      const capFontSize = Math.max(8, Math.min(13, Math.round(geometry.width * 0.028)));
      captionHeight = capFontSize * 1.4 + 4;
      captionFrame = {
        left: unitLeft,
        top: unitTop,
        width: unitAvailableWidth,
        height: captionHeight,
      };
    } else if (isSolution && puzzlesPerPage > 1) {
      captionHeight = 14;
      captionFrame = {
        left: unitLeft,
        top: unitTop,
        width: unitAvailableWidth,
        height: captionHeight,
      };
    }

    // Word Bank Calculations
    const words = p.words || [];
    const hasWordBank = style.showWordBank && !isSolution && words.length > 0;
    let bankColumns = Math.max(1, style.bankColumns || 3);
    let bankFontSize = style.bankFontSize || 11;
    let bankRows = hasWordBank ? Math.ceil(words.length / bankColumns) : 0;
    const bankLineHeight = bankFontSize * 1.55;
    const bankPadding = style.bankStyle === 'boxed' ? 14 : 8;
    let bankHeight = hasWordBank ? bankRows * bankLineHeight + bankPadding : 0;

    // Available space for the square grid
    const bankGap = hasWordBank ? constraints.targetGap : 0;
    let availGridHeight = unitAvailableHeight - captionHeight - bankGap - bankHeight;
    let maxGridSide = Math.min(unitAvailableWidth, availGridHeight);
    let cellSize = maxGridSide / p.size;

    // ---- ADAPTIVE FALLBACK PASS (if grid is squeezed below minimum) ----
    if (cellSize < effectiveMinCellSize && hasWordBank) {
      // 1. Try reducing bank font size
      let altBankFontSize = bankFontSize;
      let altBankColumns = bankColumns;

      while (altBankFontSize > constraints.minBankFontSize) {
        altBankFontSize -= 1;
        const altBankHeight = Math.ceil(words.length / altBankColumns) * (altBankFontSize * 1.55) + bankPadding;
        const altAvailGridHeight = unitAvailableHeight - captionHeight - bankGap - altBankHeight;
        const altMaxGridSide = Math.min(unitAvailableWidth, altAvailGridHeight);
        if (altMaxGridSide / p.size >= effectiveMinCellSize) {
          fallbackDecisions.push({
            rule: 'BANK_FONT_AUTO_SCALE',
            reason: `Reduced bank font size from ${bankFontSize}pt to ${altBankFontSize}pt to maintain minimum cell size (${effectiveMinCellSize}pt)`,
            from: bankFontSize,
            to: altBankFontSize,
          });
          bankFontSize = altBankFontSize;
          bankHeight = altBankHeight;
          availGridHeight = altAvailGridHeight;
          maxGridSide = altMaxGridSide;
          cellSize = maxGridSide / p.size;
          break;
        }
      }

      // 2. Try increasing columns if still below minimum
      if (cellSize < effectiveMinCellSize && altBankColumns < constraints.maxBankColumns) {
        while (altBankColumns < constraints.maxBankColumns) {
          altBankColumns += 1;
          const altRows = Math.ceil(words.length / altBankColumns);
          const altBankHeight = altRows * (bankFontSize * 1.55) + bankPadding;
          const altAvailGridHeight = unitAvailableHeight - captionHeight - bankGap - altBankHeight;
          const altMaxGridSide = Math.min(unitAvailableWidth, altAvailGridHeight);
          if (altMaxGridSide / p.size >= effectiveMinCellSize) {
            fallbackDecisions.push({
              rule: 'BANK_COLUMNS_AUTO_GROW',
              reason: `Increased bank columns from ${bankColumns} to ${altBankColumns} to fit grid within minimum cell size`,
              from: bankColumns,
              to: altBankColumns,
            });
            bankColumns = altBankColumns;
            bankRows = altRows;
            bankHeight = altBankHeight;
            availGridHeight = altAvailGridHeight;
            maxGridSide = altMaxGridSide;
            cellSize = maxGridSide / p.size;
            break;
          }
        }
      }
    }

    // Check for hard constraint failures
    const minRequiredGridSide = p.size * effectiveMinCellSize;
    const minRequiredUnitHeight = captionHeight + minRequiredGridSide + bankGap + bankHeight;

    if (cellSize < effectiveMinCellSize) {
      warnings.push(
        createWarning(
          WARNING_CODES.GRID_BELOW_MINIMUM,
          `Puzzle ${p.index} grid cell size (${cellSize.toFixed(1)}pt) is below the minimum threshold (${effectiveMinCellSize}pt) for ${p.size}×${p.size} grid.`,
          'error',
          { puzzleIndex: p.index, gridSize: p.size, cellSize, minCellSize: effectiveMinCellSize },
          p.id,
          'grid',
        ),
      );
    }

    // CONTENT_DOES_NOT_FIT must ONLY be emitted when the required dimension genuinely exceeds the available dimension
    if (minRequiredUnitHeight > unitAvailableHeight + 0.5) {
      warnings.push(
        createWarning(
          WARNING_CODES.CONTENT_DOES_NOT_FIT,
          `Puzzle ${p.index} minimum readable content height (${minRequiredUnitHeight.toFixed(1)}pt) exceeds the available unit vertical budget (${unitAvailableHeight.toFixed(1)}pt).`,
          'error',
          { puzzleIndex: p.index, requiredHeight: minRequiredUnitHeight, availableHeight: unitAvailableHeight },
          p.id,
        ),
      );
    } else if (minRequiredGridSide > unitAvailableWidth + 0.5) {
      warnings.push(
        createWarning(
          WARNING_CODES.CONTENT_DOES_NOT_FIT,
          `Puzzle ${p.index} minimum readable grid width (${minRequiredGridSide.toFixed(1)}pt) exceeds the available unit width (${unitAvailableWidth.toFixed(1)}pt).`,
          'error',
          { puzzleIndex: p.index, requiredWidth: minRequiredGridSide, availableWidth: unitAvailableWidth },
          p.id,
        ),
      );
    }

    const letterFontSize = cellSize * style.fontScale;
    if (letterFontSize < effectiveMinLetterSize) {
      warnings.push(
        createWarning(
          WARNING_CODES.UNREADABLE_TEXT,
          `Puzzle ${p.index} letter font size (${letterFontSize.toFixed(1)}pt) is below readable threshold (${effectiveMinLetterSize}pt).`,
          'error',
          { puzzleIndex: p.index, letterFontSize, minLetterSize: effectiveMinLetterSize },
          p.id,
          'letters',
        ),
      );
    }

    // Check individual word lengths vs column width in word bank
    if (hasWordBank) {
      const colWidth = unitAvailableWidth / bankColumns;
      for (const word of words) {
        const estWordWidth = approximateTextWidth(word, bankFontSize);
        if (estWordWidth > colWidth + 2) {
          warnings.push(
            createWarning(
              WARNING_CODES.WORD_LIST_OVERFLOW,
              `Word "${word}" (${estWordWidth.toFixed(1)}pt) overflows bank column width (${colWidth.toFixed(1)}pt).`,
              'warn',
              { word, wordWidth: estWordWidth, colWidth, bankColumns },
              p.id,
              'wordList',
            ),
          );
          break; // warn once per puzzle
        }
      }
    }

    // Center puzzle block vertically inside the unit
    const totalUnitContentHeight = captionHeight + Math.max(0, maxGridSide) + bankGap + bankHeight;
    const unitVerticalOffset = Math.max(0, (unitAvailableHeight - totalUnitContentHeight) / 2);

    const gridSide = Math.max(20, maxGridSide);
    const gridLeft = unitLeft + (unitAvailableWidth - gridSide) / 2;
    const gridTop = unitTop + unitVerticalOffset + captionHeight;

    const gridFrame: RectFrame = {
      left: gridLeft,
      top: gridTop,
      width: gridSide,
      height: gridSide,
    };

    let wordListFrame: RectFrame | undefined;
    let bankItemFrames: RectFrame[] | undefined;

    if (hasWordBank && words.length > 0) {
      const bankTop = gridTop + gridSide + bankGap;
      wordListFrame = {
        left: unitLeft,
        top: bankTop,
        width: unitAvailableWidth,
        height: bankHeight,
      };

      // Calculate individual item frames (column-major order)
      bankItemFrames = [];
      const colW = unitAvailableWidth / bankColumns;
      const lh = bankFontSize * 1.55;
      const topOffset = style.bankStyle === 'boxed' ? 4 : 0;

      for (let wIdx = 0; wIdx < words.length; wIdx++) {
        const c = Math.floor(wIdx / bankRows);
        const r = wIdx % bankRows;
        bankItemFrames.push({
          left: unitLeft + c * colW,
          top: bankTop + r * lh + topOffset,
          width: colW,
          height: lh,
        });
      }
    }

    // Optional divider for multi-up stacked layouts
    let dividerFrame: RectFrame | undefined;
    if (puzzlesPerPage > 1 && layoutCols === 1 && rowIdx < layoutRows - 1) {
      const dividerY = unitTop + unitAvailableHeight + rowGap / 2;
      dividerFrame = {
        left: safeArea.left,
        top: dividerY,
        width: safeArea.width,
        height: 1,
      };
    }

    // Collision checks for this puzzle's frames
    [gridFrame, captionFrame, wordListFrame].forEach((f) => {
      if (!f) return;
      if (checkSafeAreaCollision(f, safeArea)) {
        warnings.push(
          createWarning(
            WARNING_CODES.SAFE_AREA_COLLISION,
            `Puzzle ${p.index} frame extends outside the safe area boundaries.`,
            'error',
            { frame: f, safeArea },
            p.id,
          ),
        );
      }
      if (checkGutterCollision(f, geometry)) {
        warnings.push(
          createWarning(
            WARNING_CODES.GUTTER_COLLISION,
            `Puzzle ${p.index} frame collides with the ${geometry.isRecto ? 'recto (left)' : 'verso (right)'} gutter margin (${geometry.margins.gutter}pt).`,
            'error',
            { frame: f, gutterPt: geometry.margins.gutter },
            p.id,
          ),
        );
      }
    });

    puzzleFrames.push({
      id: p.id,
      puzzleIndex: p.index,
      unitFrame,
      captionFrame,
      gridFrame,
      cellSize: gridSide / p.size,
      gridSize: p.size,
      wordListFrame,
      bankColumns,
      bankRows,
      bankItemFrames,
      dividerFrame,
    });
  }

  const frames: WordSearchFrames = {
    titleFrame,
    subtitleFrame,
    puzzles: puzzleFrames,
    pageNumberFrame,
  };

  const primaryGrid = puzzleFrames[0]?.gridFrame ?? { width: 0, height: 0 };
  const primaryCellSize = puzzleFrames[0]?.cellSize ?? 0;
  const primaryBankHeight = puzzleFrames[0]?.wordListFrame?.height ?? 0;
  const primaryBankCols = puzzleFrames[0]?.bankColumns ?? 0;
  const primaryBankRows = puzzleFrames[0]?.bankRows ?? 0;

  const measurements: LayoutMeasurements = {
    pageWidth: geometry.width,
    pageHeight: geometry.height,
    safeArea,
    availableWidth: availableBodyWidth,
    availableHeight: availableBodyHeight,
    titleHeight,
    footerHeight,
    bodyHeight: availableBodyHeight,
    gridSide: primaryGrid.width,
    cellSize: primaryCellSize,
    bankHeight: primaryBankHeight,
    bankRows: primaryBankRows,
    bankColumns: primaryBankCols,
    bankFontSize: style.bankFontSize,
    titleFontSize: effectiveTitleFontSize,
    letterFontSize: primaryCellSize * style.fontScale,
    puzzlesPerPage,
  };

  const ok = !warnings.some((w) => w.severity === 'error');

  const resolvedTemplateMeta: ResolvedTemplateMetadata | undefined = template
    ? {
        templateId: template.templateId,
        version: template.version,
        status: template.status,
        name: template.name,
        fallbackApplied: templateFallbackApplied,
        reason: templateFallbackReason,
      }
    : undefined;

  return {
    ok,
    frames,
    warnings,
    measurements,
    fallbackDecisions,
    template: resolvedTemplateMeta,
  };
}

