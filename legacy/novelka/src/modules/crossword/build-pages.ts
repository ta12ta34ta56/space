import * as fabric from 'fabric';
import { nanoid } from 'nanoid';
import { chunk, objectsToPageData } from '../shared/puzzle-utils';
import { clampObjectsToSafeArea } from '../shared/kdp-clamp';
import type { Page } from '../../types/canvas.types';
import type { CrosswordPuzzle } from './generator';
import {
  clueBlockHeight,
  cwLabel,
  renderClues,
  renderCrossword,
  type CrosswordStyle,
} from './renderer';
import { getCwTemplate, type CwTemplateContext } from './templates';

export type CwSolutionPlacement = 'back_of_book' | 'next_page' | 'none';

/**
 * What accompanies the (always-present) blank grid on a puzzle page:
 *  - `clues` (standard) the grid + the ACROSS/DOWN clue lists
 *  - `words`           the grid + the answer key (the solution words) — no
 *                      text clues
 *  - `both`   (default) the grid + the clue lists + the answer key
 */
export type CwContentMode = 'both' | 'clues' | 'words';

export interface CwLayoutOptions {
  puzzlesPerPage: number;
  solutionsPerPage: number;
  solutionPlacement: CwSolutionPlacement;
  kdpSafe: boolean;
  margin: number;
  solutionsHeading: string;
  templateId: string;
  title: string;
  showFolio: boolean;
  /** print "(8)" after each clue */
  showAnswerLength: boolean;
  /** which parts of the puzzle to render on puzzle pages */
  contentMode: CwContentMode;
}

export const DEFAULT_CW_LAYOUT: CwLayoutOptions = {
  puzzlesPerPage: 1,
  solutionsPerPage: 4,
  solutionPlacement: 'back_of_book',
  kdpSafe: true,
  margin: 54,
  solutionsHeading: 'Answers',
  templateId: 'classic',
  title: 'Crossword',
  showFolio: true,
  showAnswerLength: true,
  contentMode: 'both',
};

/** Marks pages this module owns. */
export const CW_PAGE = 'novelka:crossword-page';

/**
 * The key this module used before the app was renamed to Novelka.
 * Still read so books saved by an earlier build keep working — a page whose
 * metadata cannot be found is treated as a plain page and loses its
 * live-adjust behaviour, which would look like data loss to the author.
 */
const CW_PAGE_LEGACY = 'minipdf:crossword-page';
const CW_PAGE_LEGACY_GRIDPRESS = 'gridpress:crossword-page';

export interface CwPageMeta {
  kind: 'puzzle' | 'solution';
  puzzleIds: string[];
  perPage: number;
  templateId?: string;
}

export interface CwBuildResult {
  pages: Page[];
  puzzlePageCount: number;
  solutionPageCount: number;
}

export function buildCrosswordPages(
  puzzles: CrosswordPuzzle[],
  style: CrosswordStyle,
  layout: CwLayoutOptions,
  pageSize: { width: number; height: number },
  startPageNumber = 1,
): CwBuildResult {
  const { width, height } = pageSize;
  const pages: Page[] = [];

  const puzzleGroups = chunk(puzzles, layout.puzzlesPerPage);

  const estTotal =
    puzzleGroups.length +
    (layout.solutionPlacement === 'none'
      ? 0
      : layout.solutionPlacement === 'next_page'
        ? puzzleGroups.length
        : Math.ceil(puzzles.length / layout.solutionsPerPage));

  const makePuzzlePage = (group: CrosswordPuzzle[], pageNo: number): Page => {
    const tpl = getCwTemplate(layout.templateId);
    const page: Page = {
      id: nanoid(8), name: '', width, height, background: '#ffffff', data: null,
    };

    const p0 = group[0];
    // The clue/answer block height depends on the width the template gives it,
    // which depends on the template — so estimate at full content width first,
    // build, then trust the slot the template actually returned. The estimate
    // includes the answer key in `words`/`both` modes, so the template leaves
    // room for it just as it does for the clues.
    const estWidth = width * 0.78;
    const contentMode = layout.contentMode ?? 'both';
    const drawsClues = style.showClues && contentMode !== 'words';
    const drawsAnswers = contentMode === 'both' || contentMode === 'words';
    const tctx: CwTemplateContext = {
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      count: group.length,
      gridSize: p0.size,
      clueHeight: clueBlockHeight(p0, estWidth, style, contentMode),
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      title: layout.title,
      subtitle: cwLabel(p0, style),
      theme: p0.theme,
      level: p0.difficulty,
      folio: layout.showFolio ? pageNo : undefined,
      ink: style.letterColor,
      accent: '#2b7fb8',
    };

    const { chrome, slots } = tpl.build(tctx);
    const objs: fabric.FabricObject[] = [...chrome];

    group.forEach((p, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      const caption = slot.captionTop !== undefined ? cwLabel(p, style) : undefined;

      // The blank grid is always drawn — the mode chooses what accompanies it.
      objs.push(
        ...renderCrossword(
          p,
          { left: slot.left, top: slot.captionTop ?? slot.top, size: slot.size },
          style,
          { label: caption },
        ),
      );

      if (slot.clueTop === undefined) return;
      const clueBox = {
        left: slot.clueLeft ?? slot.left,
        top: slot.clueTop,
        width: slot.clueWidth ?? slot.size,
      };
      const clueStyle = {
        ...style,
        clueColumns: slot.clueColumns ?? style.clueColumns,
      };

      if (drawsClues) {
        // Standard clue lists — with the answer key appended in `both` mode.
        objs.push(
          ...renderClues(p, clueBox, clueStyle, {
            showLength: layout.showAnswerLength,
            includeAnswers: drawsAnswers,
          }),
        );
      } else if (drawsAnswers) {
        // `words` mode: the answer key (solution words) in the content area.
        objs.push(
          ...renderClues(p, clueBox, { ...clueStyle, hintStyle: 'words' }, {
            heading: 'ANSWERS',
            showLength: false,
          }),
        );
      }
    });

    // KDP guarantee: never let a grid cell, clue list or answer key leak past
    // the safe-area margins, however the layout was computed.
    if (layout.kdpSafe) {
      clampObjectsToSafeArea(objs, {
        w: width, h: height, pageNumber: pageNo, pageCount: estTotal,
      });
    }

    return {
      ...page,
      name: `Crossword ${p0.index}${group.length > 1 ? `-${group[group.length - 1].index}` : ''}`,
      role: 'interior',
      kind: 'crossword' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [CW_PAGE]: {
          kind: 'puzzle',
          puzzleIds: group.map((p) => p.id),
          perPage: layout.puzzlesPerPage,
          templateId: layout.templateId,
        } satisfies CwPageMeta,
      },
    };
  };

  const makeSolutionPage = (
    group: CrosswordPuzzle[],
    pageNo: number,
    heading?: string,
  ): Page => {
    const tpl = getCwTemplate('answers');
    const page: Page = {
      id: nanoid(8), name: '', width, height, background: '#ffffff', data: null,
    };

    const { chrome, slots } = tpl.build({
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      count: group.length,
      gridSize: group[0].size,
      clueHeight: 0,
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      title: heading ?? layout.solutionsHeading,
      folio: layout.showFolio ? pageNo : undefined,
      ink: style.letterColor,
      accent: '#2b7fb8',
    });

    const objs: fabric.FabricObject[] = [...chrome];
    group.forEach((p, i) => {
      const slot = slots[Math.min(i, slots.length - 1)];
      objs.push(
        ...renderCrossword(
          p,
          { left: slot.left, top: slot.captionTop ?? slot.top, size: slot.size },
          { ...style, showClues: false, numberScale: style.numberScale * 0.85 },
          { answers: true, label: `Puzzle ${p.index}`, compact: true },
        ),
      );
    });

    if (layout.kdpSafe) {
      clampObjectsToSafeArea(objs, {
        w: width, h: height, pageNumber: pageNo, pageCount: estTotal,
      });
    }

    return {
      ...page,
      name: `Answers ${group[0].index}${group.length > 1 ? `-${group[group.length - 1].index}` : ''}`,
      role: 'interior',
      kind: 'crossword' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [CW_PAGE]: {
          kind: 'solution',
          puzzleIds: group.map((p) => p.id),
          perPage: layout.solutionsPerPage,
          templateId: 'answers',
        } satisfies CwPageMeta,
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

  return { pages, puzzlePageCount: puzzleGroups.length, solutionPageCount };
}

export function cwMetaOf(page: Page): CwPageMeta | null {
  const d = page.data as Record<string, unknown> | null;
  const meta = (d?.[CW_PAGE] ?? d?.[CW_PAGE_LEGACY] ?? d?.[CW_PAGE_LEGACY_GRIDPRESS]) as CwPageMeta | undefined;
  return meta ?? null;
}
