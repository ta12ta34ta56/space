import * as fabric from 'fabric';
import type { CrosswordPuzzle, Placement } from './generator';

/**
 * Puzzle -> canvas elements.
 *
 * Everything is a plain fabric object (CRITICAL RULE #4): the grid is Rects and
 * Lines, clue numbers and answers are Textboxes. Once placed the author can
 * move, restyle or delete any single piece.
 *
 * Every object is tagged `cwRole` / `cwPuzzle` so the live-adjust layout engine
 * can find and re-place it. Those keys MUST be in CanvasEngine.EXTRA_PROPS or
 * they are silently dropped on the first page save.
 */

export type BlockStyle = 'solid' | 'hollow' | 'none';

/**
 * What the solver is given to work from.
 *
 *  - `clues`      classic crossword: "3. Largest land mammal (8)"
 *  - `words`      word-fit / criss-cross puzzle: just the answer list, sorted
 *                 by length then alphabetically, no numbers
 *  - `both`       the numbered clue, with its answer printed after it —
 *                 useful for kids' books and for proofing a title
 */
export type HintStyle = 'clues' | 'words' | 'both';

export interface CrosswordStyle {
  fontFamily: string;
  /** answer letters (solution pages only) */
  letterColor: string;
  gridLineColor: string;
  gridLineWidth: number;
  /** outer frame around the grid */
  frameWidth: number;
  /** fill for live (writable) cells */
  cellFill: string | null;
  /** how unused cells are drawn */
  blockStyle: BlockStyle;
  blockColor: string;
  /** clue number size relative to the cell */
  numberScale: number;
  numberColor: string;
  /** answer letter size relative to the cell */
  fontScale: number;
  clueFontSize: number;
  clueColor: string;
  /** where the clue lists sit */
  clueColumns: number;
  /** clue list, plain word list, or both */
  hintStyle: HintStyle;
  showTitle: boolean;
  showDifficulty: boolean;
  /** print the clue lists at all */
  showClues: boolean;
}

export const DEFAULT_CW_STYLE: CrosswordStyle = {
  fontFamily: 'Inter',
  letterColor: '#111827',
  gridLineColor: '#111827',
  gridLineWidth: 0.8,
  frameWidth: 0,
  cellFill: null,
  blockStyle: 'none',
  blockColor: '#111827',
  numberScale: 0.3,
  numberColor: '#4b5563',
  fontScale: 0.6,
  clueFontSize: 9.5,
  clueColor: '#111827',
  clueColumns: 2,
  hintStyle: 'clues',
  showTitle: true,
  showDifficulty: false,
  showClues: true,
};

export interface RenderBox {
  left: number;
  top: number;
  /** the grid is square; this is the side length */
  size: number;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function tag(o: fabric.FabricObject, role: string, puzzleId: string) {
  const a = o as unknown as Record<string, unknown>;
  a.moduleId = 'crossword';
  a.cwRole = role;
  a.cwPuzzle = puzzleId;
  a.name = role;
  return o;
}

/**
 * Render one puzzle's grid.
 *
 * Only cells that belong to an answer are drawn — a freeform crossword is a
 * shape, not a full square of boxes, so empty cells are simply left blank
 * (or drawn as blocks if the author prefers that look).
 */
export function renderCrossword(
  puzzle: CrosswordPuzzle,
  box: RenderBox,
  style: CrosswordStyle,
  opts: {
    /** fill in the answers (solution pages) */
    answers?: boolean;
    /** heading above the grid */
    label?: string;
    /** smaller type for packed solution grids */
    compact?: boolean;
  } = {},
): fabric.FabricObject[] {
  const n = puzzle.size;
  const objs: fabric.FabricObject[] = [];

  const headerH = opts.label ? (opts.compact ? 14 : 26) : 0;
  const side = box.size;
  const cell = side / n;

  // A freeform crossword rarely fills its square. Work out the rows and columns
  // actually used and centre that shape in the slot, otherwise the puzzle sits
  // hard against the top-left of an invisible box.
  let uR = n, uR2 = -1, uC = n, uC2 = -1;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (puzzle.grid[r * n + c] !== null) {
        uR = Math.min(uR, r); uR2 = Math.max(uR2, r);
        uC = Math.min(uC, c); uC2 = Math.max(uC2, c);
      }
    }
  }
  const usedW = uR2 < 0 ? n : (uC2 - uC + 1);
  const usedH = uR2 < 0 ? n : (uR2 - uR + 1);
  // shift so the used block is centred, and pull the unused margin back out
  const shiftX = (side - usedW * cell) / 2 - uC * cell;
  const shiftY = (side - usedH * cell) / 2 - uR * cell;
  const gridLeft = box.left + shiftX;
  const gridTop = box.top + headerH + shiftY;

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
        'cw-label',
        puzzle.id,
      ),
    );
  }

  // ---- cells ---------------------------------------------------------------
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = puzzle.grid[r * n + c];
      const live = v !== null;
      const x = gridLeft + c * cell;
      const y = gridTop + r * cell;

      if (!live) {
        // unused cell: only drawn if the author wants blocks
        if (style.blockStyle === 'solid') {
          objs.push(
            tag(
              new fabric.Rect({
                left: x, top: y, width: cell, height: cell,
                fill: style.blockColor, stroke: null,
              }),
              'cw-block',
              puzzle.id,
            ),
          );
        } else if (style.blockStyle === 'hollow') {
          objs.push(
            tag(
              new fabric.Rect({
                left: x, top: y, width: cell, height: cell,
                fill: null, stroke: style.gridLineColor,
                strokeWidth: style.gridLineWidth * 0.5,
                opacity: 0.35,
              }),
              'cw-block',
              puzzle.id,
            ),
          );
        }
        continue;
      }

      // live cell — a box the solver writes in
      objs.push(
        tag(
          new fabric.Rect({
            left: x, top: y, width: cell, height: cell,
            fill: style.cellFill,
            stroke: style.gridLineColor,
            strokeWidth: style.gridLineWidth,
          }),
          'cw-cell',
          puzzle.id,
        ),
      );

      // Clue number in the top-left corner. A word-fit puzzle has no numbered
      // clues to refer to, so the numbers are just noise there.
      const num = (style.hintStyle ?? 'clues') === 'words' ? 0 : puzzle.numbers[r * n + c];
      if (num) {
        objs.push(
          tag(
            new fabric.Textbox(String(num), {
              left: x + cell * 0.08,
              top: y + cell * 0.04,
              width: cell * 0.62,
              fontSize: Math.max(4, cell * style.numberScale),
              fontFamily: style.fontFamily,
              fill: style.numberColor,
              textAlign: 'left',
              splitByGrapheme: false,
            }),
            'cw-number',
            puzzle.id,
          ),
        );
      }

      // the answer letter, on solution pages
      if (opts.answers) {
        objs.push(
          tag(
            new fabric.Textbox(v, {
              left: x + cell / 2,
              top: y + cell * 0.56,
              width: cell,
              fontSize: cell * style.fontScale,
              fontFamily: style.fontFamily,
              fill: style.letterColor,
              textAlign: 'center',
              originX: 'center',
              originY: 'center',
              splitByGrapheme: false,
            }),
            'cw-answer',
            puzzle.id,
          ),
        );
      }
    }
  }

  // ---- outer frame ---------------------------------------------------------
  if (style.frameWidth > 0) {
    // A freeform grid is not a full square, so the frame is drawn as the
    // outline of the used area rather than a box around everything.
    let minR = n, maxR = -1, minC = n, maxC = -1;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (puzzle.grid[r * n + c] !== null) {
          minR = Math.min(minR, r); maxR = Math.max(maxR, r);
          minC = Math.min(minC, c); maxC = Math.max(maxC, c);
        }
      }
    }
    if (maxR >= 0) {
      objs.push(
        tag(
          new fabric.Rect({
            left: gridLeft + minC * cell,
            top: gridTop + minR * cell,
            width: (maxC - minC + 1) * cell,
            height: (maxR - minR + 1) * cell,
            fill: null,
            stroke: style.gridLineColor,
            strokeWidth: style.frameWidth,
          }),
          'cw-frame',
          puzzle.id,
        ),
      );
    }
  }

  return objs;
}

/** One printed line for an answer, in the author's chosen hint style. */
function clueText(p: Placement, showLength: boolean, hint: HintStyle) {
  if (hint === 'words') {
    // a word-fit puzzle lists the answers only — no numbers, no clues
    return p.word.toUpperCase();
  }
  const len = showLength ? ` (${p.clean.length})` : '';
  if (hint === 'both') return `${p.number}. ${p.clue}${len} — ${p.word.toUpperCase()}`;
  return `${p.number}. ${p.clue}${len}`;
}

/**
 * Answers sorted for a word list: shortest first, then alphabetically.
 * That is the convention in word-fit books, because solvers place the
 * unusual lengths first.
 */
function wordListOrder(items: Placement[]): Placement[] {
  return [...items].sort(
    (a, b) => a.clean.length - b.clean.length || a.clean.localeCompare(b.clean),
  );
}

/**
 * The ACROSS and DOWN clue lists.
 *
 * Laid out in columns and returned as individual Textboxes so the author can
 * restyle or reword any single clue on the canvas.
 *
 * `opts.includeAnswers` appends an ANSWERS section (the solution words, no
 * clue text) after the regular list — the "Clues & Words" content mode.
 * `opts.heading` overrides the word-list heading (used by the "Words only"
 * content mode, which prints the answer key instead of the text clues).
 */
export function renderClues(
  puzzle: CrosswordPuzzle,
  box: { left: number; top: number; width: number; height?: number },
  style: CrosswordStyle,
  opts: { showLength?: boolean; compact?: boolean; heading?: string; includeAnswers?: boolean } = {},
): fabric.FabricObject[] {
  const objs: fabric.FabricObject[] = [];
  const fs = style.clueFontSize;
  const lh = fs * 1.45;
  const headFs = fs * 1.15;
  const cols = Math.max(1, style.clueColumns);
  const colW = box.width / cols;
  const showLen = opts.showLength ?? true;

  const hint = style.hintStyle ?? 'clues';

  // Build the printed list. In `words` mode a crossword becomes a word-fit
  // puzzle: one alphabetical answer list under a WORDS heading, with no
  // across/down split, because the solver is fitting words rather than
  // solving numbered clues.
  type Line = { text: string; heading: boolean; group: number };
  const lines: Line[] = [];

  if (hint === 'words') {
    lines.push({ text: opts.heading ?? 'WORDS', heading: true, group: 0 });
    const all = wordListOrder(puzzle.placements);
    // split evenly so both columns are used, still in sorted order
    const half = Math.ceil(all.length / Math.max(1, cols));
    all.forEach((p, i) => {
      lines.push({
        text: clueText(p, showLen, hint),
        heading: false,
        group: cols > 1 && i >= half ? 1 : 0,
      });
    });
  } else {
    if (puzzle.across.length) {
      lines.push({ text: 'ACROSS', heading: true, group: 0 });
      for (const p of puzzle.across) {
        lines.push({ text: clueText(p, showLen, hint), heading: false, group: 0 });
      }
    }
    if (puzzle.down.length) {
      lines.push({ text: 'DOWN', heading: true, group: 1 });
      for (const p of puzzle.down) {
        lines.push({ text: clueText(p, showLen, hint), heading: false, group: 1 });
      }
    }
  }

  // The answer key: the solution words themselves, no clue text. Printed when
  // the content mode asks for the words ("both" or "words").
  if (opts.includeAnswers) {
    lines.push({ text: 'ANSWERS', heading: true, group: 2 });
    for (const p of wordListOrder(puzzle.placements)) {
      lines.push({ text: p.word.toUpperCase(), heading: false, group: 2 });
    }
  }

  // Measure the *real* wrapped height by asking fabric, rather than guessing
  // from an average character width. A narrow column plus a long clue wraps to
  // two or three lines, and a character-count estimate under-reports it — which
  // is what made clues print on top of each other in the beside layout.
  const measured = new Map<string, number>();
  const heightOf = (l: Line) => {
    if (l.heading) return headFs * 1.9;
    const key = `${l.text}|${Math.round(colW)}|${fs}`;
    const hit = measured.get(key);
    if (hit !== undefined) return hit;
    const probe = new fabric.Textbox(l.text, {
      width: colW - 8,
      fontSize: fs,
      fontFamily: style.fontFamily,
      lineHeight: 1.28,
    });
    const h = probe.height + lh * 0.18;
    measured.set(key, h);
    return h;
  };

  const totalH = lines.reduce((s, l) => s + heightOf(l), 0);
  const colH = box.height ?? totalH / cols;

  // Where each line goes. A DOWN heading may only appear at the top of a
  // column or directly under the last ACROSS clue — never stranded with one
  // orphan ACROSS clue sitting above it in a fresh column.
  const placed: { line: Line; col: number; y: number }[] = [];

  // With exactly two columns the conventional printed layout is ACROSS on the
  // left and DOWN on the right. Pouring one continuous stream instead strands
  // the last ACROSS clue above the DOWN heading, which reads as a mistake.
  const acrossH = lines.filter((l) => l.group === 0).reduce((s2, l) => s2 + heightOf(l), 0);
  const downH = lines.filter((l) => l.group === 1).reduce((s2, l) => s2 + heightOf(l), 0);
  const splitByGroup =
    cols === 2 && lines.some((l) => l.group === 0) && lines.some((l) => l.group === 1) &&
    Math.max(acrossH, downH) <= colH * 1.35;

  if (splitByGroup) {
    let ya = 0;
    let yd = 0;
    for (const line of lines) {
      if (line.group === 0) { placed.push({ line, col: 0, y: ya }); ya += heightOf(line); }
      else { placed.push({ line, col: 1, y: yd }); yd += heightOf(line); }
    }
  } else {
    let col = 0;
    let y = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const h = heightOf(line);
      // a heading must not be the last thing in a column
      const next = lines[i + 1];
      const needed = line.heading && next ? h + heightOf(next) : h;
      if (y + needed > colH && col < cols - 1) {
        col++;
        y = 0;
      }
      placed.push({ line, col, y });
      y += h;
    }
  }

  for (const { line, col: c, y: yy } of placed) {
    objs.push(
      tag(
        new fabric.Textbox(line.text, {
          left: box.left + c * colW,
          top: box.top + yy,
          width: colW - 8,
          fontSize: line.heading ? headFs : fs,
          fontWeight: line.heading ? 'bold' : 'normal',
          fontFamily: style.fontFamily,
          fill: line.heading ? style.letterColor : style.clueColor,
          charSpacing: line.heading ? 60 : 0,
          lineHeight: 1.28,
        }),
        line.heading ? 'cw-clue-head' : 'cw-clue',
        puzzle.id,
      ),
    );
  }

  return objs;
}

/**
 * Points the clue/answer block needs at a given width.
 *
 * `contentMode` decides which sections are included, so the page template
 * allocates room for the answers just as it does for the clues:
 *  - `clues` — the clue lists only
 *  - `words` — the answer key (solution words) only
 *  - `both`  — the clue lists plus the answer key
 */
export function clueBlockHeight(
  puzzle: CrosswordPuzzle,
  width: number,
  style: CrosswordStyle,
  contentMode: 'both' | 'clues' | 'words' = 'both',
): number {
  const drawsClues = style.showClues && contentMode !== 'words';
  const drawsAnswers = contentMode === 'both' || contentMode === 'words';
  if (!drawsClues && !drawsAnswers) return 0;
  const fs = style.clueFontSize;
  const lh = fs * 1.45;
  const cols = Math.max(1, style.clueColumns);
  const colW = width / cols;
  const charsPerLine = Math.max(12, Math.floor((colW - 6) / (fs * 0.5)));
  const hint = style.hintStyle ?? 'clues';
  const headH = fs * 1.15 * 1.9;

  const lineH = (text: string) =>
    Math.ceil(text.length / charsPerLine) * lh;

  let total = 0;
  if (drawsClues) {
    if (hint === 'words') {
      // one WORDS heading and a plain answer list
      total += headH;
      for (const p of puzzle.placements) total += lineH(p.word);
    } else {
      const suffix = (p: typeof puzzle.placements[number]) =>
        hint === 'both' ? ` — ${p.word}` : '';
      if (puzzle.across.length) {
        total += headH;
        for (const p of puzzle.across) {
          total += lineH(`${p.number}. ${p.clue} (${p.clean.length})${suffix(p)}`);
        }
      }
      if (puzzle.down.length) {
        total += headH;
        for (const p of puzzle.down) {
          total += lineH(`${p.number}. ${p.clue} (${p.clean.length})${suffix(p)}`);
        }
      }
    }
  }
  if (drawsAnswers) {
    // ANSWERS heading + the solution words
    total += headH;
    for (const p of puzzle.placements) total += lineH(p.word);
  }
  return Math.ceil(total / cols) + 10;
}

/** Heading for a puzzle, honouring the style toggles. */
export function cwLabel(p: CrosswordPuzzle, style: CrosswordStyle): string | undefined {
  const bits: string[] = [];
  if (style.showTitle) bits.push(`Puzzle ${p.index}`);
  if (p.theme) bits.push(p.theme);
  if (style.showDifficulty) bits.push(cap(p.difficulty));
  return bits.length ? bits.join(' · ') : undefined;
}

/** Answer grids are small — pack several per page. */
/** Solution counts that actually fit this page size — "1 per page" is always
 *  offered, larger counts only when they genuinely fit. */
export function suggestCwSolutionsPerPage(
  pageWidth: number,
  pageHeight: number,
): number[] {
  const shortest = Math.min(pageWidth, pageHeight) / 72;
  const rest = shortest >= 8 ? [2, 4, 6] : [2, 4];
  return [1, ...rest.filter((n) => n !== 1)];
}
