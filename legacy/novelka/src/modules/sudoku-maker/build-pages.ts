import * as fabric from 'fabric';
import { nanoid } from 'nanoid';
import { chunk, objectsToPageData } from '../shared/puzzle-utils';
import type { Page } from '../../types/canvas.types';
import type { SudokuPuzzle } from './generator';
import { puzzleLabel, renderSudoku, type SudokuStyle } from './renderer';
import { getTemplate, type TemplateContext } from './templates';

export type SolutionPlacement = 'back_of_book' | 'next_page' | 'none';

export interface LayoutOptions {
  puzzlesPerPage: number;
  solutionsPerPage: number;
  solutionPlacement: SolutionPlacement;
  /** honour the KDP gutter when placing content */
  kdpSafe: boolean;
  /** margin used when kdpSafe is false, in points */
  margin: number;
  /** heading before the solutions section */
  solutionsHeading: string;
  /** page design used for puzzle pages */
  templateId: string;
  /** book title printed in the template header */
  title: string;
  /** print a page number in the template footer */
  showFolio: boolean;
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  puzzlesPerPage: 1,
  solutionsPerPage: 6,
  solutionPlacement: 'back_of_book',
  kdpSafe: true,
  margin: 54,
  solutionsHeading: 'Solutions',
  templateId: 'classic',
  title: 'Sudoku',
  showFolio: true,
};

/** Marks pages this module owns, so we can re-style them later. */
export const SUDOKU_PAGE = 'novelka:sudoku-page';

/**
 * The key this module used before the app was renamed to Novelka.
 * Still read so books saved by an earlier build keep working — a page whose
 * metadata cannot be found is treated as a plain page and loses its
 * live-adjust behaviour, which would look like data loss to the author.
 */
const SUDOKU_PAGE_LEGACY = 'minipdf:sudoku-page';
const SUDOKU_PAGE_LEGACY_GRIDPRESS = 'gridpress:sudoku-page';

export interface SudokuPageMeta {
  kind: 'puzzle' | 'solution' | 'heading';
  puzzleIds: string[];
  perPage: number;
  /** template used, so a re-layout can rebuild the same design */
  templateId?: string;
}

export interface BuildResult {
  pages: Page[];
  puzzlePageCount: number;
  solutionPageCount: number;
}

/**
 * Turn a set of puzzles into finished pages.
 *
 * Puzzle pages come first; solutions then go either at the back of the book
 * (packed several per page) or immediately after each puzzle page.
 */
export function buildSudokuPages(
  puzzles: SudokuPuzzle[],
  style: SudokuStyle,
  layout: LayoutOptions,
  pageSize: { width: number; height: number },
  startPageNumber = 1,
): BuildResult {
  const { width, height } = pageSize;
  const pages: Page[] = [];

  const puzzleGroups = chunk(puzzles, layout.puzzlesPerPage);

  // rough total, used only for gutter width
  const estTotal =
    puzzleGroups.length +
    (layout.solutionPlacement === 'none'
      ? 0
      : layout.solutionPlacement === 'next_page'
        ? puzzleGroups.length
        : Math.ceil(puzzles.length / layout.solutionsPerPage) + 1);

  const makePuzzlePage = (group: SudokuPuzzle[], pageNo: number): Page => {
    const tpl = getTemplate(layout.templateId);
    const page: Page = {
      id: nanoid(8), name: '', width, height, background: '#ffffff', data: null,
    };

    const tctx: TemplateContext = {
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      count: group.length,
      gridSize: group[0].size,
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      title: layout.title,
      subtitle: puzzleLabel(group[0], style),
      folio: layout.showFolio ? pageNo : undefined,
      ink: style.numberColor,
      accent: '#2b7fb8',
    };

    const { chrome, slots } = tpl.build(tctx);

    // Grid reference labels are drawn by the template but belong to the puzzle:
    // tag them so the live-adjust engine moves them when the grid is resized.
    for (const o of chrome) {
      const any = o as unknown as Record<string, unknown>;
      const role = any.sudokuRole as string | undefined;
      if (role?.startsWith('sudoku-coord')) any.sudokuPuzzle = group[0].id;
    }

    const objs: fabric.FabricObject[] = [...chrome];

    // The template decides where each grid goes; the puzzle simply fills it.
    group.forEach((p, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      const caption = slot.captionTop !== undefined ? puzzleLabel(p, style) : undefined;
      objs.push(
        ...renderSudoku(
          p,
          { left: slot.left, top: slot.captionTop ?? slot.top, size: slot.size },
          style,
          { label: caption },
        ),
      );
    });

    return {
      ...page,
      name: `Sudoku ${group[0].index}${group.length > 1 ? `-${group[group.length - 1].index}` : ''}`,
      role: 'interior',
      kind: 'sudoku' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [SUDOKU_PAGE]: {
          kind: 'puzzle',
          puzzleIds: group.map((p) => p.id),
          perPage: layout.puzzlesPerPage,
          templateId: layout.templateId,
        } satisfies SudokuPageMeta,
      },
    };
  };

  const makeSolutionPage = (group: SudokuPuzzle[], pageNo: number, heading?: string): Page => {
    const tpl = getTemplate('solutions');
    const page: Page = {
      id: nanoid(8), name: '', width, height, background: '#ffffff', data: null,
    };

    const { chrome, slots } = tpl.build({
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      count: group.length,
      gridSize: group[0].size,
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      title: heading ?? layout.solutionsHeading,
      folio: layout.showFolio ? pageNo : undefined,
      ink: style.numberColor,
      accent: '#2b7fb8',
    });

    const objs: fabric.FabricObject[] = [...chrome];
    group.forEach((p, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      objs.push(
        ...renderSudoku(
          p,
          { left: slot.left, top: slot.captionTop ?? slot.top, size: slot.size },
          { ...style, thickLineWidth: Math.max(1.2, style.thickLineWidth * 0.6) },
          { solution: true, label: `Puzzle ${p.index}`, compact: true },
        ),
      );
    });

    return {
      ...page,
      name: `Solutions ${group[0].index}${group.length > 1 ? `-${group[group.length - 1].index}` : ''}`,
      role: 'interior',
      kind: 'sudoku' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [SUDOKU_PAGE]: {
          kind: 'solution',
          puzzleIds: group.map((p) => p.id),
          perPage: layout.solutionsPerPage,
          templateId: 'solutions',
        } satisfies SudokuPageMeta,
      },
    };
  };

  let pageNo = startPageNumber;
  let solutionPageCount = 0;

  if (layout.solutionPlacement === 'next_page') {
    // puzzle page, then its answers, alternating
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
  };
}

/** Read this module's metadata off a page, if it owns it. */
export function sudokuMetaOf(page: Page): SudokuPageMeta | null {
  const d = page.data as Record<string, unknown> | null;
  const meta = (d?.[SUDOKU_PAGE] ?? d?.[SUDOKU_PAGE_LEGACY] ?? d?.[SUDOKU_PAGE_LEGACY_GRIDPRESS]) as SudokuPageMeta | undefined;
  return meta ?? null;
}
