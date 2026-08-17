import { nanoid } from 'nanoid';
import { VALIDATED_TRIM_SIZES } from './geometry';
import { generateWordSearch, parseWordList, type WordSearchPuzzle, type WSDifficulty } from '../modules/word-search/generator';
import { WORD_BANKS } from '../modules/word-search/word-banks';
import {
  buildWordSearchPages,
  wsInstancesOf,
  wsMetaOf,
  type WsLayoutOptions,
  type WsSolutionPlacement,
  type WsBuildResult,
} from '../modules/word-search/build-pages';
import type { WordSearchStyle, GridStyle, BankStyle, LetterCase } from '../modules/word-search/renderer';
import type { Book, BookSettings, DomainPage, LayoutWarning, PageSizeSpec } from './types';

export type StylePresetId = 'classic' | 'modern' | 'playful';

export interface QuickWordSearchOptions {
  title: string;
  theme?: string;
  wordsSource: 'preset' | 'custom';
  presetBankIds: string[];
  customWordsText?: string;
  trimSize: string;
  templateId?: string;
  puzzleCount: number;
  puzzlesPerPage: number;
  solutionArrangement: WsSolutionPlacement;
  solutionsPerPage: number;
  stylePreset: StylePresetId;
  fontFamily?: string;
  letterCase?: LetterCase;
  gridStyle?: GridStyle;
  bankStyle?: BankStyle;
  showFolio?: boolean;
  kdpSafe?: boolean;
  difficulty?: WSDifficulty;
  wordsPerPuzzle?: number;
  secretMessage?: string;
  publishedOnly?: boolean;
}

export const DEFAULT_QUICK_WORD_SEARCH_OPTIONS: QuickWordSearchOptions = {
  title: 'Word Search Book',
  theme: 'Nature & Animals',
  wordsSource: 'preset',
  presetBankIds: ['animals', 'garden', 'ocean'],
  customWordsText: '',
  trimSize: 'kdp6x9',
  templateId: 'classic-ws',
  puzzleCount: 25,
  puzzlesPerPage: 1,
  solutionArrangement: 'back_of_book',
  solutionsPerPage: 4,
  stylePreset: 'classic',
  fontFamily: 'Inter',
  letterCase: 'upper',
  gridStyle: 'plain',
  bankStyle: 'columns',
  showFolio: true,
  kdpSafe: true,
  difficulty: 'medium',
  wordsPerPuzzle: 12,
  publishedOnly: true,
};

export interface QuickModeValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

export function validateQuickModeOptions(
  opts: Partial<QuickWordSearchOptions>,
): QuickModeValidationResult {
  const errors: Record<string, string> = {};

  const title = opts.title?.trim();
  if (!title) {
    errors.title = 'Book title is required.';
  }

  const count = opts.puzzleCount ?? DEFAULT_QUICK_WORD_SEARCH_OPTIONS.puzzleCount;
  if (!Number.isInteger(count) || count < 1 || count > 300) {
    errors.puzzleCount = 'Puzzle count must be an integer between 1 and 300.';
  }

  const trim = opts.trimSize ?? DEFAULT_QUICK_WORD_SEARCH_OPTIONS.trimSize;
  if (!VALIDATED_TRIM_SIZES[trim]) {
    errors.trimSize = `Unknown trim size "${trim}".`;
  }

  const wordsSource = opts.wordsSource ?? DEFAULT_QUICK_WORD_SEARCH_OPTIONS.wordsSource;
  if (wordsSource === 'preset') {
    const bankIds = opts.presetBankIds ?? [];
    if (!bankIds.length) {
      errors.words = 'Please select at least one theme word bank.';
    }
  } else {
    const raw = opts.customWordsText ?? '';
    const parsed = parseWordList(raw);
    if (parsed.length < 4) {
      errors.words = 'Please provide at least 4 valid words for custom puzzle generation.';
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface QuickModeAllocation {
  puzzlePages: number;
  solutionPages: number;
  totalPages: number;
  puzzlesPerPage: number;
  solutionsPerPage: number;
  wordsPerPuzzle: number;
  gridSize: number;
  trimSize: PageSizeSpec;
  isExportable: boolean;
  minPagesRequired: number;
  exportStatus: 'exportable' | 'below_minimum' | 'exceeds_maximum';
  exportStatusMessage: string;
}

export function calculateQuickModeAllocation(
  opts: Partial<QuickWordSearchOptions>,
): QuickModeAllocation {
  const puzzleCount = Math.max(1, Math.min(300, opts.puzzleCount ?? DEFAULT_QUICK_WORD_SEARCH_OPTIONS.puzzleCount));
  const puzzlesPerPage = opts.puzzlesPerPage ?? 1;
  const solutionsPerPage = opts.solutionsPerPage ?? (puzzlesPerPage === 1 && puzzleCount === 20 ? 5 : 4);
  const solutionPlacement = opts.solutionArrangement ?? DEFAULT_QUICK_WORD_SEARCH_OPTIONS.solutionArrangement;
  const trimKey = opts.trimSize ?? DEFAULT_QUICK_WORD_SEARCH_OPTIONS.trimSize;
  const trimSize = VALIDATED_TRIM_SIZES[trimKey] ?? VALIDATED_TRIM_SIZES.kdp6x9;

  const puzzlePages = Math.ceil(puzzleCount / puzzlesPerPage);
  let solutionPages = 0;

  if (solutionPlacement === 'next_page') {
    solutionPages = puzzlePages;
  } else if (solutionPlacement === 'back_of_book') {
    solutionPages = Math.ceil(puzzleCount / solutionsPerPage);
  }

  const totalPages = puzzlePages + solutionPages;
  const minPagesRequired = 24;
  const isExportable = totalPages >= minPagesRequired && totalPages <= 828;

  const exportStatus: 'exportable' | 'below_minimum' | 'exceeds_maximum' =
    totalPages < minPagesRequired
      ? 'below_minimum'
      : totalPages > 828
        ? 'exceeds_maximum'
        : 'exportable';

  const exportStatusMessage =
    exportStatus === 'below_minimum'
      ? `This configuration creates ${totalPages} pages and cannot be exported for the selected KDP profile. Increase the volume to at least 24 interior pages.`
      : exportStatus === 'exceeds_maximum'
        ? `This configuration creates ${totalPages} pages, exceeding KDP's 828-page limit.`
        : `Exportable (${totalPages} interior pages)`;

  const wordsPerPuzzle = opts.wordsPerPuzzle ?? 12;
  const gridSize = 14;

  return {
    puzzlePages,
    solutionPages,
    totalPages,
    puzzlesPerPage,
    solutionsPerPage,
    wordsPerPuzzle,
    gridSize,
    trimSize,
    isExportable,
    minPagesRequired,
    exportStatus,
    exportStatusMessage,
  };
}

export function buildStyleForPreset(
  preset: StylePresetId,
  customFont?: string,
  gridStyle?: GridStyle,
  bankStyle?: BankStyle,
  letterCase?: LetterCase,
): WordSearchStyle {
  switch (preset) {
    case 'modern':
      return {
        fontFamily: customFont || 'Inter',
        letterColor: '#0f172a',
        gridLineColor: '#cbd5e1',
        gridLineWidth: 0.6,
        frameWidth: 1.2,
        backgroundColor: null,
        fontScale: 0.56,
        letterSpacing: 10,
        letterCase: letterCase || 'upper',
        gridStyle: gridStyle || 'lines',
        bankStyle: bankStyle || 'columns',
        bankColumns: 3,
        bankFontSize: 10.5,
        bankColor: '#334155',
        titleFontSize: 18,
        titleColor: '#0f172a',
        showTitle: true,
        showDifficulty: false,
        showWordBank: true,
        answerStyle: 'oval',
        answerColor: '#3b82f6',
      };
    case 'playful':
      return {
        fontFamily: customFont || 'Inter',
        letterColor: '#1e1b4b',
        gridLineColor: '#c7d2fe',
        gridLineWidth: 1.0,
        frameWidth: 2.0,
        backgroundColor: null,
        fontScale: 0.58,
        letterSpacing: 20,
        letterCase: letterCase || 'upper',
        gridStyle: gridStyle || 'boxes',
        bankStyle: bankStyle || 'checklist',
        bankColumns: 3,
        bankFontSize: 11,
        bankColor: '#312e81',
        titleFontSize: 20,
        titleColor: '#4338ca',
        showTitle: true,
        showDifficulty: false,
        showWordBank: true,
        answerStyle: 'oval',
        answerColor: '#ec4899',
      };
    case 'classic':
    default:
      return {
        fontFamily: customFont || 'Georgia',
        letterColor: '#111827',
        gridLineColor: '#c7ced8',
        gridLineWidth: 0.6,
        frameWidth: 1.6,
        backgroundColor: null,
        fontScale: 0.56,
        letterSpacing: 0,
        letterCase: letterCase || 'upper',
        gridStyle: gridStyle || 'plain',
        bankStyle: bankStyle || 'columns',
        bankColumns: 3,
        bankFontSize: 11,
        bankColor: '#111827',
        titleFontSize: 18,
        titleColor: '#111827',
        showTitle: true,
        showDifficulty: false,
        showWordBank: true,
        answerStyle: 'oval',
        answerColor: '#d64550',
      };
  }
}

export interface QuickWordSearchBookResult {
  ok: boolean;
  book: Book;
  pages: import('../types/canvas.types').Page[];
  buildResult: WsBuildResult;
  warnings: LayoutWarning[];
  invalidForProduction: boolean;
  puzzlePageCount: number;
  solutionPageCount: number;
  errorSummary?: string;
}

/**
 * Generate a complete, intelligently formatted word-search book from Quick Mode options.
 */
export function generateQuickWordSearchBook(
  options: Partial<QuickWordSearchOptions>,
  onProgress?: (done: number, total: number) => void,
): QuickWordSearchBookResult {
  const merged: QuickWordSearchOptions = {
    ...DEFAULT_QUICK_WORD_SEARCH_OPTIONS,
    ...options,
  };

  const validation = validateQuickModeOptions(merged);
  if (!validation.valid) {
    const errorMsg = Object.values(validation.errors).join(' ');
    throw new Error(`Quick Mode Validation Failed: ${errorMsg}`);
  }

  // 1. Prepare word pools
  const banks = WORD_BANKS.filter((b) => merged.presetBankIds.includes(b.id));
  const customWords = merged.wordsSource === 'custom' ? parseWordList(merged.customWordsText || '') : [];

  const puzzles: WordSearchPuzzle[] = [];
  const wordsPer = merged.wordsPerPuzzle || 12;
  const count = merged.puzzleCount;

  for (let i = 0; i < count; i++) {
    let puzzleWords: string[] = [];
    let puzzleTheme = merged.theme || 'Word Search';

    if (merged.wordsSource === 'preset' && banks.length > 0) {
      const bank = banks[i % banks.length];
      puzzleTheme = bank.name;
      const startIdx = ((i * 5) % Math.max(1, bank.words.length - wordsPer + 1));
      puzzleWords = bank.words.slice(startIdx, startIdx + wordsPer);
      if (puzzleWords.length < wordsPer) {
        puzzleWords = [...puzzleWords, ...bank.words.slice(0, wordsPer - puzzleWords.length)];
      }
    } else if (customWords.length > 0) {
      if (customWords.length <= wordsPer) {
        puzzleWords = customWords;
      } else {
        const startIdx = ((i * 4) % Math.max(1, customWords.length - wordsPer + 1));
        puzzleWords = customWords.slice(startIdx, startIdx + wordsPer);
        if (puzzleWords.length < wordsPer) {
          puzzleWords = [...puzzleWords, ...customWords.slice(0, wordsPer - puzzleWords.length)];
        }
      }
    }

    if (!puzzleWords.length) {
      puzzleWords = ['ROSE', 'TULIP', 'DAISY', 'LILY', 'ORCHID', 'SUNFLOWER', 'MARIGOLD', 'VIOLET'];
    }

    const seed = 50000 + i * 7919;
    const puzzle = generateWordSearch(
      {
        size: 14,
        words: puzzleWords,
        difficulty: merged.difficulty || 'medium',
        seed,
        theme: puzzleTheme,
        secretMessage: merged.secretMessage,
      },
      i + 1,
    );
    puzzles.push(puzzle);
    onProgress?.(i + 1, count);
  }

  // 2. Build Style & Layout options
  const style = buildStyleForPreset(
    merged.stylePreset,
    merged.fontFamily,
    merged.gridStyle,
    merged.bankStyle,
    merged.letterCase,
  );

  const trimSize = VALIDATED_TRIM_SIZES[merged.trimSize] ?? VALIDATED_TRIM_SIZES.kdp6x9;
  const chosenTemplateId = merged.templateId || (merged.puzzlesPerPage === 2 ? 'two-up-ws' : 'classic-ws');

  const layoutOpts: WsLayoutOptions = {
    puzzlesPerPage: merged.puzzlesPerPage,
    solutionsPerPage: merged.solutionsPerPage,
    solutionPlacement: merged.solutionArrangement,
    kdpSafe: merged.kdpSafe ?? true,
    margin: 54,
    solutionsHeading: 'Answers',
    templateId: chosenTemplateId,
    title: merged.title,
    showFolio: merged.showFolio ?? true,
    publishedOnly: merged.publishedOnly !== false,
  };

  // 3. Build Pages through responsive solver pipeline
  const buildResult = buildWordSearchPages(
    puzzles,
    style,
    layoutOpts,
    { width: trimSize.width, height: trimSize.height, trimKey: merged.trimSize },
  );

  const errorWarnings = buildResult.warnings.filter((w) => w.severity === 'error');
  const isInvalid = !buildResult.ok || errorWarnings.length > 0;
  const errorSummary = isInvalid
    ? `Layout constraint failures: ${[...new Set(errorWarnings.map((w) => w.code))].join(', ')}`
    : undefined;

  // 4. Construct domain Book model
  const bookSettings: BookSettings = {
    trimSize: merged.trimSize,
    bleed: false,
    paper: 'bw-white',
    targetPageCount: buildResult.pages.length,
    gutterIntent: 'safe',
    solutionArrangement: merged.solutionArrangement,
    puzzlesPerPage: merged.puzzlesPerPage,
    solutionsPerPage: merged.solutionsPerPage,
    showFolio: merged.showFolio ?? true,
    defaultFont: merged.fontFamily || 'Inter',
  };

  const domainPages: DomainPage[] = buildResult.pages.map((p, idx) => {
    const pageData = (p.data ?? {}) as Record<string, unknown>;
    const resolvedMeta = wsMetaOf(p);
    return {
      id: p.id,
      pageNumber: idx + 1,
      role: p.role ?? 'interior',
      kind: resolvedMeta?.kind ?? 'puzzle',
      geometry: {
        width: trimSize.width,
        height: trimSize.height,
        pageNumber: idx + 1,
        pageCount: buildResult.pages.length,
        isRecto: (idx + 1) % 2 === 1,
        margins: { gutter: 27, outer: 27, top: 27, bottom: 27 },
        safeArea: { left: 27, top: 27, width: trimSize.width - 54, height: trimSize.height - 54 },
        bleed: { top: 0, bottom: 0, outer: 0, inner: 0 },
        trimBox: { left: 0, top: 0, width: trimSize.width, height: trimSize.height },
      },
      instances: wsInstancesOf(p),
      templateId: (pageData.templateId as string) || resolvedMeta?.templateId || chosenTemplateId,
      templateVersion: (pageData.templateVersion as string) || resolvedMeta?.templateVersion || '1.0.0',
      templateStatus: (pageData.templateStatus as string) || resolvedMeta?.templateStatus || 'published',
    };
  });

  const book: Book = {
    id: `book-${nanoid(8)}`,
    title: merged.title,
    theme: merged.theme,
    settings: bookSettings,
    pageSize: trimSize,
    pageCount: buildResult.pages.length,
    pages: domainPages,
    globalStyles: {
      ...style,
      titleFontSize: style.titleFontSize || 18,
      titleColor: style.titleColor || style.letterColor,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return {
    ok: buildResult.ok && !isInvalid,
    book,
    pages: buildResult.pages,
    buildResult,
    warnings: buildResult.warnings,
    invalidForProduction: isInvalid,
    puzzlePageCount: buildResult.puzzlePageCount,
    solutionPageCount: buildResult.solutionPageCount,
    errorSummary,
  };
}
