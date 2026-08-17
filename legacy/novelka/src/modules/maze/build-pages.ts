import * as fabric from 'fabric';
import { nanoid } from 'nanoid';
import { chunk, objectsToPageData } from '../shared/puzzle-utils';
import type { Page } from '../../types/canvas.types';
import type { Maze, MazeDifficulty } from './generator';
import { renderMaze, renderSolutionKey, type MazeStyle } from './renderer';
import { getMzTemplate, type MzTemplateContext } from './templates';

/**
 * Mazes -> finished pages.
 *
 * Puzzle pages come first; solutions then go either at the back of the book
 * (packed several per page) or immediately after each puzzle page.
 */

export type MzSolutionPlacement = 'back_of_book' | 'next_page' | 'none';

export interface MzLayoutOptions {
  mazesPerPage: number;
  solutionsPerPage: number;
  solutionPlacement: MzSolutionPlacement;
  kdpSafe: boolean;
  margin: number;
  solutionsHeading: string;
  templateId: string;
  title: string;
  showFolio: boolean;
  /** number each maze "Maze 1", "Maze 2", … */
  numberMazes: boolean;
}

export const DEFAULT_MZ_LAYOUT: MzLayoutOptions = {
  mazesPerPage: 1,
  solutionsPerPage: 6,
  solutionPlacement: 'back_of_book',
  kdpSafe: true,
  margin: 54,
  solutionsHeading: 'Answers',
  templateId: 'classic',
  title: 'Mazes',
  showFolio: true,
  numberMazes: true,
};

/** Marks pages this module owns, so they can be re-styled later. */
export const MZ_PAGE = 'novelka:maze-page';

export interface MzPageMeta {
  kind: 'puzzle' | 'solution';
  /** seeds, so a page can be rebuilt identically without storing geometry */
  seeds: number[];
  shape: Maze['shape'];
  difficulty: MazeDifficulty;
  perPage: number;
  templateId: string;
  /** index of the first maze on this page, for numbering */
  firstIndex: number;
}

const MZ_PAGE_LEGACY_MINIPDF = 'minipdf:maze-page';
const MZ_PAGE_LEGACY_GRIDPRESS = 'gridpress:maze-page';

export function mzMetaOf(page: Page): MzPageMeta | null {
  const d = page.data as Record<string, unknown> | null;
  return (d?.[MZ_PAGE] as MzPageMeta | undefined)
    ?? (d?.[MZ_PAGE_LEGACY_MINIPDF] as MzPageMeta | undefined)
    ?? (d?.[MZ_PAGE_LEGACY_GRIDPRESS] as MzPageMeta | undefined)
    ?? null;
}

export interface MzBuildResult {
  pages: Page[];
  puzzlePageCount: number;
  solutionPageCount: number;
}

const label = (index: number, difficulty: MazeDifficulty, numbered: boolean) =>
  numbered
    ? `Maze ${index}`
    : difficulty.charAt(0).toUpperCase() + difficulty.slice(1);

export function buildMazePages(
  mazes: Maze[],
  layout: MzLayoutOptions,
  style: MazeStyle,
  size: { width: number; height: number },
  startPageNumber = 1,
): MzBuildResult {
  const { width, height } = size;
  const pages: Page[] = [];
  const groups = chunk(mazes, Math.max(1, layout.mazesPerPage));

  // Estimate the finished length first: the KDP gutter depends on page count,
  // and getting it from a partial count makes the inner margin too tight.
  const estTotal =
    groups.length +
    (layout.solutionPlacement === 'none'
      ? 0
      : layout.solutionPlacement === 'next_page'
        ? groups.length
        : Math.ceil(mazes.length / layout.solutionsPerPage) + 1);

  const makePuzzlePage = (group: Maze[], pageNo: number, firstIndex: number): Page => {
    const tpl = getMzTemplate(layout.templateId);
    const page: Page = {
      id: nanoid(8), name: '', width, height, background: '#ffffff', data: null,
    };

    const tctx: MzTemplateContext = {
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      count: group.length,
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      title: layout.title,
      subtitle: label(firstIndex, group[0].difficulty, layout.numberMazes),
      difficulty: group[0].difficulty.charAt(0).toUpperCase() + group[0].difficulty.slice(1),
      folio: layout.showFolio ? pageNo : undefined,
      ink: '#111827',
      accent: '#2b7fb8',
    };

    const { chrome, slots } = tpl.build(tctx);
    for (const o of chrome) {
      const any = o as unknown as Record<string, unknown>;
      any.moduleId = 'maze';
      if (!any.mzRole) any.mzRole = 'mz-chrome';
    }

    const objs: fabric.FabricObject[] = [...chrome];
    group.forEach((maze, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      const id = nanoid(8);
      // Chrome belongs to the first maze so a re-layout can find it.
      if (i === 0) {
        for (const o of chrome) {
          (o as unknown as Record<string, unknown>).mzPuzzle = id;
        }
      }
      objs.push(...renderMaze(maze, slot, style, id, {
        showSolution: false,
        label: label(firstIndex + i, maze.difficulty, layout.numberMazes),
      }));
    });

    return {
      ...page,
      name: `Maze ${firstIndex}${group.length > 1 ? `-${firstIndex + group.length - 1}` : ''}`,
      role: 'interior',
      kind: 'maze' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [MZ_PAGE]: {
          kind: 'puzzle',
          seeds: group.map((m) => m.seed),
          shape: group[0].shape,
          difficulty: group[0].difficulty,
          perPage: layout.mazesPerPage,
          templateId: layout.templateId,
          firstIndex,
        } satisfies MzPageMeta,
      },
    };
  };

  const makeSolutionPage = (
    group: Maze[], pageNo: number, firstIndex: number, heading?: string,
  ): Page => {
    const tpl = getMzTemplate('answers');
    const page: Page = {
      id: nanoid(8), name: '', width, height, background: '#ffffff', data: null,
    };

    const { chrome, slots } = tpl.build({
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      count: group.length,
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      title: heading ?? layout.solutionsHeading,
      folio: layout.showFolio ? pageNo : undefined,
      ink: '#111827',
      accent: '#2b7fb8',
    });

    const objs: fabric.FabricObject[] = [...chrome];
    for (const o of chrome) {
      const any = o as unknown as Record<string, unknown>;
      any.moduleId = 'maze';
      if (!any.mzRole) any.mzRole = 'mz-chrome';
    }

    group.forEach((maze, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      const id = nanoid(8);
      if (i === 0) {
        for (const o of chrome) {
          (o as unknown as Record<string, unknown>).mzPuzzle = id;
        }
      }
      objs.push(...renderSolutionKey(
        maze, slot, style, id,
        label(firstIndex + i, maze.difficulty, layout.numberMazes),
      ));
    });

    return {
      ...page,
      name: `Answers ${firstIndex}${group.length > 1 ? `-${firstIndex + group.length - 1}` : ''}`,
      role: 'interior',
      kind: 'maze' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [MZ_PAGE]: {
          kind: 'solution',
          seeds: group.map((m) => m.seed),
          shape: group[0].shape,
          difficulty: group[0].difficulty,
          perPage: layout.solutionsPerPage,
          templateId: 'answers',
          firstIndex,
        } satisfies MzPageMeta,
      },
    };
  };

  let pageNo = startPageNumber;
  let solutionPageCount = 0;

  if (layout.solutionPlacement === 'next_page') {
    let index = 1;
    for (const group of groups) {
      pages.push(makePuzzlePage(group, pageNo++, index));
      pages.push(makeSolutionPage(group, pageNo++, index));
      solutionPageCount++;
      index += group.length;
    }
  } else {
    let index = 1;
    for (const group of groups) {
      pages.push(makePuzzlePage(group, pageNo++, index));
      index += group.length;
    }

    if (layout.solutionPlacement === 'back_of_book') {
      const solGroups = chunk(mazes, Math.max(1, layout.solutionsPerPage));
      let solIndex = 1;
      solGroups.forEach((group, i) => {
        pages.push(makeSolutionPage(
          group, pageNo++, solIndex,
          i === 0 ? layout.solutionsHeading : `${layout.solutionsHeading} (cont.)`,
        ));
        solIndex += group.length;
        solutionPageCount++;
      });
    }
  }

  return { pages, puzzlePageCount: groups.length, solutionPageCount };
}

/** Sensible mazes-per-page for a trim size. */
export function suggestMzPerPage(pageW: number, pageH: number): number[] {
  const shortest = Math.min(pageW, pageH);
  // Below roughly 4 inches a 2x2 grid produces cells too small to draw in.
  if (shortest < 4 * 72) return [1];
  if (shortest < 5.5 * 72) return [1, 2];
  return [1, 2, 4];
}
