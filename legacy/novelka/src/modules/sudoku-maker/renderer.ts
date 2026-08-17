import * as fabric from 'fabric';
import { cellLabel, type SudokuPuzzle } from './generator';

/**
 * Puzzle -> canvas elements.
 *
 * Everything is a plain fabric object (CRITICAL RULE #4): grid lines are Lines,
 * clues are Textboxes in the user's font. Once placed the user can move, resize,
 * recolour or delete any part of it.
 */

export interface SudokuStyle {
  fontFamily: string;
  /** clue text colour */
  numberColor: string;
  gridLineColor: string;
  gridLineWidth: number;
  thickLineWidth: number;
  backgroundColor: string | null;
  /** 0-1, clue size relative to the cell */
  fontScale: number;
  showTitle: boolean;
  showDifficulty: boolean;
  /** 16x16 uses 1-9 + A-G instead of 1-16 */
  hexLabels: boolean;
}

export const DEFAULT_STYLE: SudokuStyle = {
  fontFamily: 'Inter',
  numberColor: '#111827',
  gridLineColor: '#111827',
  gridLineWidth: 0.8,
  thickLineWidth: 2.2,
  backgroundColor: null,
  fontScale: 0.58,
  showTitle: true,
  showDifficulty: true,
  hexLabels: true,
};

export interface RenderBox {
  left: number;
  top: number;
  /** the grid is square; this is the side length */
  size: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Tag every object so "apply layout to all pages" can find them later. */
function tag(o: fabric.FabricObject, role: string, puzzleId: string) {
  const a = o as unknown as Record<string, unknown>;
  a.moduleId = 'sudoku';
  a.sudokuRole = role;
  a.sudokuPuzzle = puzzleId;
  a.name = role;
  return o;
}

/**
 * Render one puzzle (or its solution) as canvas objects.
 * Returns a flat list — grouping is left to the caller so individual cells
 * stay independently editable.
 */
export function renderSudoku(
  puzzle: SudokuPuzzle,
  box: RenderBox,
  style: SudokuStyle,
  opts: {
    /** draw the completed grid instead of the puzzle */
    solution?: boolean;
    /** heading above the grid, e.g. "Puzzle 3" */
    label?: string;
    /** shrink text for small solution grids */
    compact?: boolean;
  } = {},
): fabric.FabricObject[] {
  const { size: n, box: shape } = puzzle;
  const objs: fabric.FabricObject[] = [];
  const grid = opts.solution ? puzzle.solution : puzzle.puzzle;

  const headerH = opts.label ? (opts.compact ? 14 : 26) : 0;
  const gridTop = box.top + headerH;
  const side = box.size;
  const cell = side / n;

  if (opts.label) {
    objs.push(
      tag(
        new fabric.Textbox(opts.label, {
          left: box.left,
          top: box.top,
          width: side,
          fontSize: opts.compact ? 9 : 13,
          fontWeight: 'bold',
          fontFamily: style.fontFamily,
          fill: style.numberColor,
          textAlign: 'center',
        }),
        'sudoku-label',
        puzzle.id,
      ),
    );
  }

  if (style.backgroundColor) {
    objs.push(
      tag(
        new fabric.Rect({
          left: box.left,
          top: gridTop,
          width: side,
          height: side,
          fill: style.backgroundColor,
          selectable: true,
        }),
        'sudoku-bg',
        puzzle.id,
      ),
    );
  }

  // ---- grid lines: thin between cells, thick on box boundaries -------------
  for (let i = 0; i <= n; i++) {
    const major = i % shape.h === 0;
    const w = major ? style.thickLineWidth : style.gridLineWidth;
    const y = gridTop + i * cell;
    objs.push(
      tag(
        new fabric.Line([box.left, y, box.left + side, y], {
          stroke: style.gridLineColor,
          strokeWidth: w,
        }),
        major ? 'sudoku-rule-major' : 'sudoku-rule',
        puzzle.id,
      ),
    );
  }
  for (let i = 0; i <= n; i++) {
    const major = i % shape.w === 0;
    const w = major ? style.thickLineWidth : style.gridLineWidth;
    const x = box.left + i * cell;
    objs.push(
      tag(
        new fabric.Line([x, gridTop, x, gridTop + side], {
          stroke: style.gridLineColor,
          strokeWidth: w,
        }),
        major ? 'sudoku-rule-major' : 'sudoku-rule',
        puzzle.id,
      ),
    );
  }

  // ---- clues ---------------------------------------------------------------
  const fontSize = cell * style.fontScale;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = grid[r * n + c];
      if (!v) continue;
      const label = cellLabel(v, n, style.hexLabels);
      objs.push(
        tag(
          new fabric.Textbox(label, {
            left: box.left + c * cell + cell / 2,
            top: gridTop + r * cell + cell / 2,
            width: cell,
            fontSize,
            fontFamily: style.fontFamily,
            fill: style.numberColor,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            splitByGrapheme: false,
          }),
          opts.solution ? 'sudoku-answer' : 'sudoku-clue',
          puzzle.id,
        ),
      );
    }
  }

  return objs;
}

/** Heading text for a puzzle, honouring the style toggles. */
export function puzzleLabel(p: SudokuPuzzle, style: SudokuStyle): string | undefined {
  const bits: string[] = [];
  if (style.showTitle) bits.push(`Puzzle ${p.index}`);
  if (style.showDifficulty) bits.push(cap(p.difficulty));
  return bits.length ? bits.join(' · ') : undefined;
}

/**
 * How many puzzles fit sensibly per page at a given trim size.
 * Small grids on big pages can take more; 16x16 needs the room.
 */
export function suggestPerPage(
  gridSize: number,
  pageWidth: number,
  pageHeight: number,
): number[] {
  const shortest = Math.min(pageWidth, pageHeight) / 72; // inches
  if (gridSize === 16) return shortest >= 8 ? [1, 2] : [1];
  if (gridSize === 9) return shortest >= 8 ? [1, 2, 4] : [1, 2];
  return shortest >= 8 ? [1, 2, 4, 6] : [1, 2, 4];
}

/** Sensible solutions-per-page — answers are small, so pack more in. */
/** Solution counts that actually fit this page size. "1 per page" is always
 *  offered; the larger counts are included only when they genuinely fit. */
export function suggestSolutionsPerPage(
  gridSize: number,
  pageWidth: number,
  pageHeight: number,
): number[] {
  const shortest = Math.min(pageWidth, pageHeight) / 72;
  const rest =
    gridSize === 16 ? (shortest >= 8 ? [2, 4] : [2])
    : gridSize === 9 ? (shortest >= 8 ? [2, 4, 6] : [2, 4])
    : (shortest >= 8 ? [2, 4, 6, 9] : [2, 4, 6]);
  return [1, ...rest.filter((n) => n !== 1)];
}
