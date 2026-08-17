import * as fabric from 'fabric';
import { nanoid } from 'nanoid';
import type { WordSearchPuzzle } from './generator';
import type { PuzzleLayoutFrame } from '../../domain/types';

/**
 * Puzzle -> canvas elements.
 *
 * Everything is a plain fabric object (CRITICAL RULE #4): letters are Textboxes,
 * optional cell rules are Lines, answer marks are Lines/Ellipses. Once placed,
 * the user can move, recolour, resize or delete any single letter.
 *
 * Every object is tagged with `wsRole` / `wsPuzzle` for legacy compatibility,
 * and with `instanceId` / `instanceRole` / `contentId` for the structured domain model.
 */

export type LetterCase = 'upper' | 'lower';
export type GridStyle = 'plain' | 'lines' | 'boxes' | 'shaded';
export type BankStyle = 'columns' | 'inline' | 'boxed' | 'checklist';

export interface WordSearchStyle {
  fontFamily: string;
  letterColor: string;
  /** grid rules / cell boxes */
  gridLineColor: string;
  gridLineWidth: number;
  /** outer frame around the whole grid */
  frameWidth: number;
  backgroundColor: string | null;
  /** 0-1, letter size relative to the cell */
  fontScale: number;
  /** extra tracking between letters */
  letterSpacing: number;
  letterCase: LetterCase;
  gridStyle: GridStyle;
  bankStyle: BankStyle;
  bankColumns: number;
  bankFontSize: number;
  bankColor: string;
  titleFontSize?: number;
  titleColor?: string;
  showTitle: boolean;
  showDifficulty: boolean;
  /** draw the word bank under the grid */
  showWordBank: boolean;
  /** answer key marker */
  answerStyle: 'line' | 'oval' | 'highlight';
  answerColor: string;
}

export const DEFAULT_WS_STYLE: WordSearchStyle = {
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
  showTitle: true,
  showDifficulty: false,
  showWordBank: true,
  answerStyle: 'oval',
  answerColor: '#d64550',
};

export interface RenderBox {
  left: number;
  top: number;
  /** the grid is square; this is the side length */
  size: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Tag every object with both legacy tags and structured instance metadata. */
export function tagObject(
  o: fabric.FabricObject,
  role: string,
  puzzleId: string,
  instanceId?: string,
  instanceRole?: string,
  customId?: string,
) {
  const a = o as unknown as Record<string, unknown>;
  a.id = customId || (a.id as string) || nanoid(8);
  a.moduleId = 'wordsearch';
  a.wsRole = role;
  a.wsPuzzle = puzzleId;
  a.instanceId = instanceId || puzzleId;
  a.instanceRole = instanceRole || role;
  a.contentId = puzzleId;
  a.role = instanceRole || role;
  a.name = role;
  return o;
}

/** Legacy tag wrapper. */
function tag(o: fabric.FabricObject, role: string, puzzleId: string, instanceId?: string, instanceRole?: string) {
  return tagObject(o, role, puzzleId, instanceId, instanceRole);
}

/**
 * Render one puzzle's canvas objects according to exact solver layout frames.
 */
export function renderWordSearchFromFrame(
  puzzle: WordSearchPuzzle,
  frame: PuzzleLayoutFrame,
  style: WordSearchStyle,
  opts: {
    instanceId: string;
    answers?: boolean;
    label?: string;
    compact?: boolean;
    bankWords?: string[];
  },
): fabric.FabricObject[] {
  const n = puzzle.size;
  const objs: fabric.FabricObject[] = [];
  const instanceId = opts.instanceId;
  const gridFrame = frame.gridFrame;
  const cell = frame.cellSize || gridFrame.width / n;

  // 1. Caption
  if (frame.captionFrame && opts.label) {
    objs.push(
      tag(
        new fabric.Textbox(opts.label, {
          left: frame.captionFrame.left,
          top: frame.captionFrame.top,
          width: frame.captionFrame.width,
          fontSize: opts.compact ? 9 : 12,
          fontWeight: 'bold',
          fontFamily: style.fontFamily,
          fill: style.letterColor,
          textAlign: 'center',
        }),
        'ws-label',
        puzzle.id,
        instanceId,
        'caption',
      ),
    );
  }

  // 2. Grid background
  if (style.backgroundColor) {
    objs.push(
      tag(
        new fabric.Rect({
          left: gridFrame.left,
          top: gridFrame.top,
          width: gridFrame.width,
          height: gridFrame.height,
          fill: style.backgroundColor,
          selectable: true,
        }),
        'ws-bg',
        puzzle.id,
        instanceId,
        'grid',
      ),
    );
  }

  // 3. Grid rules / boxes
  if (style.gridStyle === 'lines' || style.gridStyle === 'boxes') {
    for (let i = 0; i <= n; i++) {
      const y = gridFrame.top + i * cell;
      objs.push(
        tag(
          new fabric.Line([gridFrame.left, y, gridFrame.left + gridFrame.width, y], {
            stroke: style.gridLineColor,
            strokeWidth: style.gridLineWidth,
          }),
          'ws-rule',
          puzzle.id,
          instanceId,
          'grid',
        ),
      );
      const x = gridFrame.left + i * cell;
      objs.push(
        tag(
          new fabric.Line([x, gridFrame.top, x, gridFrame.top + gridFrame.height], {
            stroke: style.gridLineColor,
            strokeWidth: style.gridLineWidth,
          }),
          'ws-rule',
          puzzle.id,
          instanceId,
          'grid',
        ),
      );
    }
  }

  // 4. Grid checker shading
  if (style.gridStyle === 'shaded') {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if ((r + c) % 2 === 1) continue;
        objs.push(
          tag(
            new fabric.Rect({
              left: gridFrame.left + c * cell,
              top: gridFrame.top + r * cell,
              width: cell,
              height: cell,
              fill: style.gridLineColor,
              opacity: 0.25,
            }),
            'ws-shade',
            puzzle.id,
            instanceId,
            'grid',
          ),
        );
      }
    }
  }

  // 5. Outer frame
  if (style.frameWidth > 0 && style.gridStyle !== 'plain') {
    objs.push(
      tag(
        new fabric.Rect({
          left: gridFrame.left,
          top: gridFrame.top,
          width: gridFrame.width,
          height: gridFrame.height,
          fill: null,
          stroke: style.gridLineColor,
          strokeWidth: style.frameWidth,
        }),
        'ws-frame',
        puzzle.id,
        instanceId,
        'grid',
      ),
    );
  }

  // 6. Letters
  const fontSize = cell * style.fontScale;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const raw = puzzle.grid[r * n + c];
      const ch = style.letterCase === 'lower' ? raw.toLowerCase() : raw;
      objs.push(
        tag(
          new fabric.Textbox(ch, {
            left: gridFrame.left + c * cell + cell / 2,
            top: gridFrame.top + r * cell + cell / 2,
            width: cell,
            fontSize,
            fontFamily: style.fontFamily,
            fill: style.letterColor,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            charSpacing: style.letterSpacing,
            splitByGrapheme: false,
          }),
          'ws-letter',
          puzzle.id,
          instanceId,
          'grid',
        ),
      );
    }
  }

  // 7. Answer key marks
  if (opts.answers) {
    for (const pl of puzzle.placements) {
      const x1 = gridFrame.left + (pl.col + 0.5) * cell;
      const y1 = gridFrame.top + (pl.row + 0.5) * cell;
      const endR = pl.row + pl.dr * (pl.clean.length - 1);
      const endC = pl.col + pl.dc * (pl.clean.length - 1);
      const x2 = gridFrame.left + (endC + 0.5) * cell;
      const y2 = gridFrame.top + (endR + 0.5) * cell;

      if (style.answerStyle === 'line') {
        objs.push(
          tag(
            new fabric.Line([x1, y1, x2, y2], {
              stroke: style.answerColor,
              strokeWidth: Math.max(1, cell * 0.09),
              strokeLineCap: 'round',
              opacity: 0.9,
            }),
            'ws-answer',
            puzzle.id,
            instanceId,
            'solution',
          ),
        );
        continue;
      }

      // oval / highlight: a capsule around the run
      const len = Math.hypot(x2 - x1, y2 - y1);
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const rx = len / 2 + cell * 0.42;
      const ry = cell * 0.42;
      const highlight = style.answerStyle === 'highlight';
      objs.push(
        tag(
          new fabric.Ellipse({
            left: (x1 + x2) / 2,
            top: (y1 + y2) / 2,
            rx,
            ry,
            angle,
            originX: 'center',
            originY: 'center',
            fill: highlight ? style.answerColor : null,
            opacity: highlight ? 0.28 : 1,
            stroke: highlight ? null : style.answerColor,
            strokeWidth: highlight ? 0 : Math.max(0.8, cell * 0.055),
          }),
          'ws-answer',
          puzzle.id,
          instanceId,
          'solution',
        ),
      );
    }
  }

  // 8. Word Bank
  if (style.showWordBank && !opts.compact && frame.wordListFrame) {
    const words = opts.bankWords ?? puzzle.placements.map((p) => p.word);
    if (words.length) {
      const wf = frame.wordListFrame;
      const fs = style.bankFontSize;
      const show = (w: string) =>
        style.letterCase === 'lower' ? w.toLowerCase() : w.toUpperCase();

      if (style.bankStyle === 'boxed') {
        objs.push(
          tag(
            new fabric.Rect({
              left: wf.left,
              top: wf.top - 4,
              width: wf.width,
              height: wf.height + 8,
              rx: 6,
              ry: 6,
              fill: null,
              stroke: style.gridLineColor,
              strokeWidth: Math.max(0.6, style.frameWidth * 0.6),
            }),
            'ws-bank-frame',
            puzzle.id,
            instanceId,
            'word-list',
          ),
        );
      }

      if (frame.bankItemFrames && frame.bankItemFrames.length === words.length) {
        words.forEach((w, i) => {
          const bf = frame.bankItemFrames![i];
          const label = style.bankStyle === 'checklist' ? `☐  ${show(w)}` : show(w);
          objs.push(
            tag(
              new fabric.Textbox(label, {
                left: bf.left,
                top: bf.top,
                width: bf.width,
                fontSize: fs,
                fontFamily: style.fontFamily,
                fill: style.bankColor,
                textAlign: frame.bankColumns === 1 ? 'center' : 'left',
              }),
              'ws-bank',
              puzzle.id,
              instanceId,
              'word-list',
            ),
          );
        });
      } else {
        // Fallback flow
        const cols = frame.bankColumns || style.bankColumns;
        const rows = Math.ceil(words.length / cols);
        const colW = wf.width / cols;
        const lh = fs * 1.55;
        words.forEach((w, i) => {
          const c = Math.floor(i / rows);
          const r = i % rows;
          const label = style.bankStyle === 'checklist' ? `☐  ${show(w)}` : show(w);
          objs.push(
            tag(
              new fabric.Textbox(label, {
                left: wf.left + c * colW,
                top: wf.top + r * lh + (style.bankStyle === 'boxed' ? 2 : 0),
                width: colW,
                fontSize: fs,
                fontFamily: style.fontFamily,
                fill: style.bankColor,
                textAlign: cols === 1 ? 'center' : 'left',
              }),
              'ws-bank',
              puzzle.id,
              instanceId,
              'word-list',
            ),
          );
        });
      }
    }
  }

  // 9. Optional divider between units
  if (frame.dividerFrame) {
    objs.push(
      tag(
        new fabric.Line([frame.dividerFrame.left, frame.dividerFrame.top, frame.dividerFrame.left + frame.dividerFrame.width, frame.dividerFrame.top], {
          stroke: '#cbd5e1',
          strokeWidth: 1,
        }),
        'ws-divider',
        puzzle.id,
        instanceId,
        'divider',
      ),
    );
  }

  return objs;
}

/**
 * Render one puzzle's letter grid (legacy box layout).
 */
export function renderWordSearch(
  puzzle: WordSearchPuzzle,
  box: RenderBox,
  style: WordSearchStyle,
  opts: {
    /** draw the answer key marks over the grid */
    answers?: boolean;
    /** heading above the grid, e.g. "Puzzle 3 · Animals" */
    label?: string;
    /** shrink text for small answer-key grids */
    compact?: boolean;
    /** words to list under the grid; omit to use the puzzle's own list */
    bankWords?: string[];
    /** bottom of the area the bank may use */
    bankBottom?: number;
    instanceId?: string;
    instanceRole?: string;
  } = {},
): fabric.FabricObject[] {
  const n = puzzle.size;
  const objs: fabric.FabricObject[] = [];
  const instanceId = opts.instanceId || puzzle.id;
  const instanceRole = opts.instanceRole || (opts.answers ? 'solution' : 'puzzle');

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
          fill: style.letterColor,
          textAlign: 'center',
        }),
        'ws-label',
        puzzle.id,
        instanceId,
        'caption',
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
        'ws-bg',
        puzzle.id,
        instanceId,
        instanceRole,
      ),
    );
  }

  // ---- optional cell rules -------------------------------------------------
  if (style.gridStyle === 'lines' || style.gridStyle === 'boxes') {
    for (let i = 0; i <= n; i++) {
      const y = gridTop + i * cell;
      objs.push(
        tag(
          new fabric.Line([box.left, y, box.left + side, y], {
            stroke: style.gridLineColor,
            strokeWidth: style.gridLineWidth,
          }),
          'ws-rule',
          puzzle.id,
          instanceId,
          'grid',
        ),
      );
      const x = box.left + i * cell;
      objs.push(
        tag(
          new fabric.Line([x, gridTop, x, gridTop + side], {
            stroke: style.gridLineColor,
            strokeWidth: style.gridLineWidth,
          }),
          'ws-rule',
          puzzle.id,
          instanceId,
          'grid',
        ),
      );
    }
  }

  if (style.gridStyle === 'shaded') {
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if ((r + c) % 2 === 1) continue;
        objs.push(
          tag(
            new fabric.Rect({
              left: box.left + c * cell,
              top: gridTop + r * cell,
              width: cell,
              height: cell,
              fill: style.gridLineColor,
              opacity: 0.25,
            }),
            'ws-shade',
            puzzle.id,
            instanceId,
            'grid',
          ),
        );
      }
    }
  }

  // ---- outer frame ---------------------------------------------------------
  if (style.frameWidth > 0 && style.gridStyle !== 'plain') {
    objs.push(
      tag(
        new fabric.Rect({
          left: box.left,
          top: gridTop,
          width: side,
          height: side,
          fill: null,
          stroke: style.gridLineColor,
          strokeWidth: style.frameWidth,
        }),
        'ws-frame',
        puzzle.id,
        instanceId,
        'grid',
      ),
    );
  }

  // ---- letters -------------------------------------------------------------
  const fontSize = cell * style.fontScale;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const raw = puzzle.grid[r * n + c];
      const ch = style.letterCase === 'lower' ? raw.toLowerCase() : raw;
      objs.push(
        tag(
          new fabric.Textbox(ch, {
            left: box.left + c * cell + cell / 2,
            top: gridTop + r * cell + cell / 2,
            width: cell,
            fontSize,
            fontFamily: style.fontFamily,
            fill: style.letterColor,
            textAlign: 'center',
            originX: 'center',
            originY: 'center',
            charSpacing: style.letterSpacing,
            splitByGrapheme: false,
          }),
          'ws-letter',
          puzzle.id,
          instanceId,
          'grid',
        ),
      );
    }
  }

  // ---- answer key marks ----------------------------------------------------
  if (opts.answers) {
    for (const pl of puzzle.placements) {
      const x1 = box.left + (pl.col + 0.5) * cell;
      const y1 = gridTop + (pl.row + 0.5) * cell;
      const endR = pl.row + pl.dr * (pl.clean.length - 1);
      const endC = pl.col + pl.dc * (pl.clean.length - 1);
      const x2 = box.left + (endC + 0.5) * cell;
      const y2 = gridTop + (endR + 0.5) * cell;

      if (style.answerStyle === 'line') {
        objs.push(
          tag(
            new fabric.Line([x1, y1, x2, y2], {
              stroke: style.answerColor,
              strokeWidth: Math.max(1, cell * 0.09),
              strokeLineCap: 'round',
              opacity: 0.9,
            }),
            'ws-answer',
            puzzle.id,
            instanceId,
            'solution',
          ),
        );
        continue;
      }

      // oval / highlight: a capsule around the run
      const len = Math.hypot(x2 - x1, y2 - y1);
      const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
      const rx = len / 2 + cell * 0.42;
      const ry = cell * 0.42;
      const highlight = style.answerStyle === 'highlight';
      objs.push(
        tag(
          new fabric.Ellipse({
            left: (x1 + x2) / 2,
            top: (y1 + y2) / 2,
            rx,
            ry,
            angle,
            originX: 'center',
            originY: 'center',
            fill: highlight ? style.answerColor : null,
            opacity: highlight ? 0.28 : 1,
            stroke: highlight ? null : style.answerColor,
            strokeWidth: highlight ? 0 : Math.max(0.8, cell * 0.055),
          }),
          'ws-answer',
          puzzle.id,
          instanceId,
          'solution',
        ),
      );
    }
  }

  // ---- word bank -----------------------------------------------------------
  if (style.showWordBank && !opts.compact) {
    const words = opts.bankWords ?? puzzle.placements.map((p) => p.word);
    if (words.length) {
      objs.push(
        ...renderWordBank(
          puzzle,
          words,
          {
            left: box.left,
            top: gridTop + side + cell * 0.5,
            width: side,
            bottom: opts.bankBottom,
          },
          style,
          instanceId,
        ),
      );
    }
  }

  return objs;
}

/** Height the word bank will need at a given width. Used before laying out. */
export function bankHeight(
  wordCount: number,
  style: WordSearchStyle,
): number {
  if (!style.showWordBank || wordCount === 0) return 0;
  const lh = style.bankFontSize * 1.55;
  if (style.bankStyle === 'inline') {
    return lh * Math.max(2, Math.ceil(wordCount / 6)) + 8;
  }
  const rows = Math.ceil(wordCount / Math.max(1, style.bankColumns));
  return rows * lh + (style.bankStyle === 'boxed' ? 20 : 8);
}

/**
 * The list of words to find, under the grid.
 */
function renderWordBank(
  puzzle: WordSearchPuzzle,
  words: string[],
  box: { left: number; top: number; width: number; bottom?: number },
  style: WordSearchStyle,
  instanceId?: string,
): fabric.FabricObject[] {
  const objs: fabric.FabricObject[] = [];
  const fs = style.bankFontSize;
  const lh = fs * 1.55;
  const instId = instanceId || puzzle.id;
  const show = (w: string) =>
    style.letterCase === 'lower' ? w.toLowerCase() : w.toUpperCase();

  if (style.bankStyle === 'inline') {
    objs.push(
      tag(
        new fabric.Textbox(words.map(show).join('   ·   '), {
          left: box.left,
          top: box.top,
          width: box.width,
          fontSize: fs,
          fontFamily: style.fontFamily,
          fill: style.bankColor,
          textAlign: 'center',
          lineHeight: 1.5,
        }),
        'ws-bank',
        puzzle.id,
        instId,
        'word-list',
      ),
    );
    return objs;
  }

  const cols = Math.max(1, style.bankColumns);
  const rows = Math.ceil(words.length / cols);
  const colW = box.width / cols;

  if (style.bankStyle === 'boxed') {
    objs.push(
      tag(
        new fabric.Rect({
          left: box.left,
          top: box.top - 6,
          width: box.width,
          height: rows * lh + 14,
          rx: 6,
          ry: 6,
          fill: null,
          stroke: style.gridLineColor,
          strokeWidth: Math.max(0.6, style.frameWidth * 0.6),
        }),
        'ws-bank-frame',
        puzzle.id,
        instId,
        'word-list',
      ),
    );
  }

  // fill column-major so the list reads down each column, like a real book
  words.forEach((w, i) => {
    const c = Math.floor(i / rows);
    const r = i % rows;
    const label = style.bankStyle === 'checklist' ? `☐  ${show(w)}` : show(w);
    objs.push(
      tag(
        new fabric.Textbox(label, {
          left: box.left + c * colW,
          top: box.top + r * lh + (style.bankStyle === 'boxed' ? 2 : 0),
          width: colW,
          fontSize: fs,
          fontFamily: style.fontFamily,
          fill: style.bankColor,
          textAlign: cols === 1 ? 'center' : 'left',
        }),
        'ws-bank',
        puzzle.id,
        instId,
        'word-list',
      ),
    );
  });

  return objs;
}

/** Heading text for a puzzle, honouring the style toggles. */
export function wsLabel(p: WordSearchPuzzle, style: WordSearchStyle): string | undefined {
  const bits: string[] = [];
  if (style.showTitle) bits.push(`Puzzle ${p.index}`);
  if (p.theme) bits.push(p.theme);
  if (style.showDifficulty) bits.push(cap(p.difficulty));
  return bits.length ? bits.join(' · ') : undefined;
}

/**
 * How many puzzles fit sensibly per page.
 */
export function suggestWsPerPage(
  gridSize: number,
  pageWidth: number,
  pageHeight: number,
): number[] {
  const longest = Math.max(pageWidth, pageHeight) / 72;
  if (gridSize >= 17) return [1];
  if (gridSize >= 14) return longest >= 10.5 ? [1, 2] : [1];
  if (gridSize >= 12) return longest >= 9.5 ? [1, 2] : [1];
  return longest >= 8.4 ? [1, 2] : [1];
}

/** Answer keys are small — pack several per page. */
/** Solution counts that actually fit this page size — "1 per page" is always
 *  offered, larger counts only when they genuinely fit. */
export function suggestWsSolutionsPerPage(
  gridSize: number,
  pageWidth: number,
  pageHeight: number,
): number[] {
  const shortest = Math.min(pageWidth, pageHeight) / 72;
  const rest =
    gridSize >= 17 ? (shortest >= 8 ? [2, 4] : [2])
    : gridSize >= 13 ? (shortest >= 8 ? [2, 4] : [2])
    : (shortest >= 8 ? [2, 4, 6] : [2, 4]);
  return [1, ...rest.filter((n) => n !== 1)];
}
