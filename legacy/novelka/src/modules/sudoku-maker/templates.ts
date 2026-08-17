import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';
import type { GridSize } from './generator';
import { JOURNAL_TEMPLATE_FACTORIES } from './journal-templates';

/**
 * Sudoku page templates.
 *
 * A template is a *frame*: title, decoration, instruction line, footer — plus
 * the exact rectangles where puzzle grids belong. The generator fills those
 * rectangles, so the puzzle always lands perfectly inside the design no matter
 * which template, trim size or puzzle count is chosen.
 *
 * Every element is a plain fabric object, so the user can still edit anything
 * afterwards (CRITICAL RULE #4).
 */

export interface TemplateContext {
  page: Page;
  pageNumber: number;
  pageCount: number;
  /** puzzles to place on this page */
  count: number;
  gridSize: GridSize;
  font: string;
  kdpSafe: boolean;
  /** heading text, e.g. "Sudoku" */
  title: string;
  /** "Puzzle 7 · Medium" for the first puzzle on the page */
  subtitle?: string;
  /** page number shown in the footer, if any */
  folio?: number;
  ink: string;
  accent: string;
}

/** Where one puzzle grid goes. */
export interface PuzzleSlot {
  left: number;
  /** top of the grid itself (not the caption) */
  top: number;
  size: number;
  /** caption drawn above the grid */
  captionTop?: number;
  /** caption drawn below the grid */
  footerTop?: number;
}

export interface TemplateResult {
  /** decoration — everything that is not the puzzle */
  chrome: fabric.FabricObject[];
  slots: PuzzleSlot[];
}

export interface SudokuTemplate {
  id: string;
  name: string;
  audience: 'kids' | 'classic' | 'advanced' | 'minimal';
  accessLevel: 'free' | 'ad_unlock' | 'premium_only';
  /** grid sizes this design suits best */
  bestFor: GridSize[];
  /** how many puzzles the design supports per page */
  supports: number[];
  description: string;
  /** SVG preview, viewBox 0 0 100 141 */
  preview: string;
  build: (ctx: TemplateContext) => TemplateResult;
}

// ---------------------------------------------------------------- helpers

const text = (t: string, o: Partial<fabric.TextboxProps>) =>
  new fabric.Textbox(t, { fontFamily: 'Inter', ...o });

export function area(ctx: TemplateContext) {
  if (ctx.kdpSafe) {
    const m = kdpMarginsFor(Math.max(ctx.pageCount, 24));
    return safeAreaFor(ctx.page.width, ctx.page.height, ctx.pageNumber, m);
  }
  const m = 54;
  return {
    left: m,
    top: m,
    width: ctx.page.width - m * 2,
    height: ctx.page.height - m * 2,
    isRecto: ctx.pageNumber % 2 === 1,
  };
}

/** Fit `count` squares into a box, returning square size and grid shape. */
function fit(count: number, w: number, h: number, gap: number, extra: number) {
  let best = { cols: 1, rows: count, size: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows - extra;
    const size = Math.min(cw, ch);
    if (size > best.size) best = { cols, rows, size };
  }
  return best;
}

/** Centre `count` squares in a box, with room for a caption on each. */
function gridSlots(
  box: { left: number; top: number; width: number; height: number },
  count: number,
  gap: number,
  captionH: number,
  maxSize = Infinity,
): PuzzleSlot[] {
  const f = fit(count, box.width, box.height, gap, captionH);
  const size = Math.min(f.size, maxSize);
  const cellH = size + captionH;
  const blockH = f.rows * cellH + gap * (f.rows - 1);
  const startY = box.top + Math.max(0, (box.height - blockH) / 2);

  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / f.cols);
    const c = i % f.cols;
    const inRow = Math.min(f.cols, count - r * f.cols);
    const rowW = inRow * size + gap * (inRow - 1);
    const rowX = box.left + (box.width - rowW) / 2;
    const top = startY + r * (cellH + gap);
    return {
      left: rowX + c * (size + gap),
      top: top + captionH,
      size,
      captionTop: captionH > 0 ? top : undefined,
    };
  });
}

const DIVIDER =
  'M 0 4 L 42 4 M 46 4 l 4 -4 l 4 4 l -4 4 z M 58 4 L 100 4';

// ------------------------------------------------------------- 1. classic

const classic: SudokuTemplate = {
  id: 'classic',
  name: 'Classic book',
  audience: 'classic',
  accessLevel: 'free',
  bestFor: [9, 16],
  supports: [1, 2],
  description: 'Title, puzzle number and level, ornament and folio — the standard KDP interior.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="16" font-size="9" font-family="Georgia">SUDOKU</text>
    <text x="10" y="30" font-size="4.5" fill="#555">puzzle No. 1</text>
    <text x="66" y="30" font-size="4.5" fill="#555">Level: Easy</text>
    <rect x="10" y="34" width="80" height="80" fill="none" stroke="#111" stroke-width="1.6"/>
    ${[1, 2].map((i) => `<rect x="${10 + i * 26.6}" y="34" width="0.9" height="80" fill="#111"/><rect x="10" y="${34 + i * 26.6}" width="80" height="0.9" fill="#111"/>`).join('')}
    <path d="M32 124 h36" stroke="#111" stroke-width="0.7"/>
    <text x="48" y="136" font-size="5" fill="#111">1</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      text(ctx.title, {
        left: a.left,
        top: a.top,
        width: a.width * 0.6,
        fontSize: Math.round(ctx.page.width * 0.055),
        fontFamily: ctx.font,
        fill: ctx.ink,
      }),
    );

    const headTop = a.top + Math.round(ctx.page.width * 0.075);
    if (ctx.subtitle) {
      const [no, lvl] = ctx.subtitle.split('·').map((s) => s.trim());
      chrome.push(
        text(no ?? '', {
          left: a.left,
          top: headTop,
          width: a.width * 0.5,
          fontSize: 10,
          fontFamily: ctx.font,
          fill: ctx.ink,
        }),
      );
      if (lvl) {
        chrome.push(
          text(`Level: ${lvl}`, {
            left: a.left + a.width * 0.5,
            top: headTop,
            width: a.width * 0.5,
            fontSize: 10,
            fontFamily: ctx.font,
            fill: ctx.ink,
            textAlign: 'right',
          }),
        );
      }
    }

    const bodyTop = headTop + 18;
    const footH = 46;
    const slots = gridSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.count,
      26,
      0,
    );

    // ornament + folio
    const orn = new fabric.Path(DIVIDER, {
      left: a.left + a.width / 2,
      top: a.top + a.height - 34,
      stroke: ctx.ink,
      strokeWidth: 0.9,
      fill: null,
      originX: 'center',
      scaleX: (a.width * 0.4) / 100,
    });
    chrome.push(orn);

    if (ctx.folio !== undefined) {
      chrome.push(
        text(String(ctx.folio), {
          left: a.left,
          top: a.top + a.height - 16,
          width: a.width,
          fontSize: 11,
          fontFamily: ctx.font,
          fill: ctx.ink,
          textAlign: 'center',
        }),
      );
    }
    return { chrome, slots };
  },
};

// ------------------------------------------------------------ 2. kids 4x4

const kidsBig: SudokuTemplate = {
  id: 'kids-big',
  name: 'Kids — big & friendly',
  audience: 'kids',
  accessLevel: 'free',
  bestFor: [4, 9],
  supports: [1, 2],
  description: 'Rounded colour panel, huge grid and a simple instruction line. Made for 4×4.',
  preview: `<rect width="100" height="141" fill="#dff1fb"/>
    <rect x="6" y="6" width="88" height="129" rx="7" fill="#fff"/>
    <text x="50" y="24" font-size="11" text-anchor="middle" font-family="Verdana" fill="#2b7fb8">PUZZLE</text>
    <circle cx="22" cy="38" r="6" fill="#ffd166"/><circle cx="50" cy="38" r="6" fill="#ef8fa0"/><circle cx="78" cy="38" r="6" fill="#8fd4a8"/>
    <rect x="16" y="50" width="68" height="68" fill="none" stroke="#2b7fb8" stroke-width="2"/>
    <rect x="50" y="50" width="1.6" height="68" fill="#2b7fb8"/><rect x="16" y="84" width="68" height="1.6" fill="#2b7fb8"/>
    <text x="50" y="130" font-size="4.5" text-anchor="middle" fill="#5b7a8c">Fill 1-4 in every row</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    // soft page tint + white card
    chrome.push(
      new fabric.Rect({
        left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
        fill: '#dff1fb', selectable: true,
      }),
      new fabric.Rect({
        left: a.left - 14, top: a.top - 14,
        width: a.width + 28, height: a.height + 28,
        rx: 18, ry: 18, fill: '#ffffff', selectable: true,
      }),
    );

    chrome.push(
      text(ctx.title.toUpperCase(), {
        left: a.left, top: a.top + 4, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.085),
        fontWeight: 'bold', fontFamily: ctx.font,
        fill: ctx.accent, textAlign: 'center', charSpacing: 60,
      }),
    );

    // three friendly dots
    const dotY = a.top + Math.round(ctx.page.width * 0.13);
    ['#ffd166', '#ef8fa0', '#8fd4a8'].forEach((c, i) => {
      chrome.push(
        new fabric.Circle({
          left: a.left + a.width * (0.3 + i * 0.2),
          top: dotY, radius: 9, fill: c,
          originX: 'center', originY: 'center',
        }),
      );
    });

    const bodyTop = dotY + 26;
    const footH = 40;
    const slots = gridSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.count, 24, ctx.count > 1 ? 20 : 0,
    );

    const n = ctx.gridSize;
    chrome.push(
      text(`Fill in 1–${n} so every row, column and box has each number once.`, {
        left: a.left, top: a.top + a.height - 26, width: a.width,
        fontSize: 10, fontFamily: ctx.font, fill: '#5b7a8c', textAlign: 'center',
      }),
    );
    return { chrome, slots };
  },
};

// ------------------------------------------------ 3. kids activity (2-up)

const kidsPlay: SudokuTemplate = {
  id: 'kids-play',
  name: 'Kids — playtime',
  audience: 'kids',
  accessLevel: 'ad_unlock',
  bestFor: [4, 9],
  supports: [2, 4],
  description: 'Bright banner and framed puzzle cards. Great for two or four 4×4 grids.',
  preview: `<rect width="100" height="141" fill="#eafbe7"/>
    <rect x="0" y="0" width="100" height="22" fill="#8fd4a8"/>
    <text x="50" y="15" font-size="9" text-anchor="middle" font-family="Verdana" fill="#fff">SUDOKU FUN</text>
    ${[0, 1].map((r) => [0, 1].map((c) => `<rect x="${8 + c * 46}" y="${30 + r * 52}" width="38" height="44" rx="5" fill="#fff" stroke="#8fd4a8"/><rect x="${12 + c * 46}" y="${38 + r * 52}" width="30" height="30" fill="none" stroke="#4b9e77"/>`).join('')).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      new fabric.Rect({
        left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
        fill: '#eafbe7',
      }),
      new fabric.Rect({
        left: 0, top: 0, width: ctx.page.width, height: a.top + 30, fill: '#8fd4a8',
      }),
      text(ctx.title.toUpperCase(), {
        left: 0, top: a.top + 2, width: ctx.page.width,
        fontSize: Math.round(ctx.page.width * 0.06),
        fontWeight: 'bold', fontFamily: ctx.font,
        fill: '#ffffff', textAlign: 'center', charSpacing: 40,
      }),
    );

    const bodyTop = a.top + 48;
    const slots = gridSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - 10 },
      ctx.count, 20, 22,
    );

    // white card behind each puzzle
    for (const s of slots) {
      chrome.push(
        new fabric.Rect({
          left: s.left - 12, top: (s.captionTop ?? s.top) - 10,
          width: s.size + 24, height: s.size + (s.top - (s.captionTop ?? s.top)) + 22,
          rx: 10, ry: 10, fill: '#ffffff', stroke: '#8fd4a8', strokeWidth: 1.2,
        }),
      );
    }
    return { chrome, slots };
  },
};

// -------------------------------------------------------- 4. minimal 2-up

const twoUp: SudokuTemplate = {
  id: 'two-up',
  name: 'Two per page',
  audience: 'minimal',
  accessLevel: 'free',
  bestFor: [9],
  supports: [2],
  description: 'Two grids with a divider between — the most common puzzle-book layout.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="12" font-size="6" text-anchor="middle" font-family="Georgia">SUDOKU</text>
    <rect x="18" y="20" width="64" height="46" fill="none" stroke="#111" stroke-width="1.3"/>
    <path d="M32 76 h36" stroke="#111" stroke-width="0.7"/>
    <rect x="18" y="84" width="64" height="46" fill="none" stroke="#111" stroke-width="1.3"/>
    <text x="50" y="138" font-size="4.5" text-anchor="middle">3</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    chrome.push(
      text(ctx.title, {
        left: a.left, top: a.top, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.042),
        fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center', charSpacing: 80,
      }),
    );

    const bodyTop = a.top + 30;
    const footH = 34;
    const slots = gridSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.count, 30, 16,
    );

    if (slots.length === 2) {
      const mid = (slots[0].top + slots[0].size + (slots[1].captionTop ?? slots[1].top)) / 2;
      chrome.push(
        new fabric.Path(DIVIDER, {
          left: a.left + a.width / 2, top: mid,
          stroke: ctx.ink, strokeWidth: 0.9, fill: null,
          originX: 'center', scaleX: (a.width * 0.35) / 100,
        }),
      );
    }

    if (ctx.folio !== undefined) {
      chrome.push(
        text(String(ctx.folio), {
          left: a.left, top: a.top + a.height - 14, width: a.width,
          fontSize: 10, fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
        }),
      );
    }
    return { chrome, slots };
  },
};

// ------------------------------------------------------- 5. advanced 16x16

const advanced: SudokuTemplate = {
  id: 'advanced',
  name: 'Advanced 16×16',
  audience: 'advanced',
  accessLevel: 'free',
  bestFor: [16],
  supports: [1],
  description: 'Edge-to-edge single grid with a slim header — built for 16×16 legibility.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <rect x="8" y="8" width="84" height="14" fill="#1f2937"/>
    <text x="50" y="18" font-size="6" text-anchor="middle" fill="#fff" font-family="Verdana">16 × 16</text>
    <rect x="8" y="30" width="84" height="84" fill="none" stroke="#111" stroke-width="1.6"/>
    ${[1, 2, 3].map((i) => `<rect x="${8 + i * 21}" y="30" width="0.8" height="84" fill="#111"/><rect x="8" y="${30 + i * 21}" width="84" height="0.8" fill="#111"/>`).join('')}
    <text x="50" y="128" font-size="4.5" text-anchor="middle" fill="#555">Use 1–9 and A–G</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    const barH = 26;

    chrome.push(
      new fabric.Rect({
        left: a.left, top: a.top, width: a.width, height: barH,
        fill: ctx.ink, rx: 4, ry: 4,
      }),
      text(ctx.subtitle ?? ctx.title, {
        left: a.left + 12, top: a.top + 7, width: a.width - 24,
        fontSize: 11, fontWeight: 'bold', fontFamily: ctx.font,
        fill: '#ffffff', charSpacing: 40,
      }),
    );

    const bodyTop = a.top + barH + 16;
    const footH = 28;
    const slots = gridSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.count, 18, 0,
    );

    chrome.push(
      text('Use 1–9 and A–G. Every row, column and 4×4 box holds each symbol once.', {
        left: a.left, top: a.top + a.height - 18, width: a.width,
        fontSize: 9, fontFamily: ctx.font, fill: '#6b7280', textAlign: 'center',
      }),
    );
    return { chrome, slots };
  },
};

// -------------------------------------------------------- 6. journal style

const journal: SudokuTemplate = {
  id: 'journal',
  name: 'With notes',
  audience: 'classic',
  accessLevel: 'ad_unlock',
  bestFor: [9],
  supports: [1],
  description: 'Grid plus date, timer and a lined notes column for working out.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="8" y="14" font-size="7" font-family="Georgia">SUDOKU</text>
    <text x="60" y="13" font-size="4" fill="#666">Date __/__</text>
    <rect x="8" y="22" width="60" height="60" fill="none" stroke="#111" stroke-width="1.4"/>
    ${[1, 2].map((i) => `<rect x="${8 + i * 20}" y="22" width="0.8" height="60" fill="#111"/><rect x="8" y="${22 + i * 20}" width="60" height="0.8" fill="#111"/>`).join('')}
    ${Array.from({ length: 7 }, (_, i) => `<rect x="72" y="${28 + i * 8}" width="20" height="0.6" fill="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    const colW = a.width * 0.28;
    const gridW = a.width - colW - 18;

    chrome.push(
      text(ctx.title, {
        left: a.left, top: a.top, width: gridW,
        fontSize: Math.round(ctx.page.width * 0.05),
        fontFamily: ctx.font, fill: ctx.ink,
      }),
      text('Date ____ / ____        Time ____ : ____', {
        left: a.left, top: a.top + 26, width: a.width,
        fontSize: 9, fontFamily: ctx.font, fill: '#6b7280',
      }),
    );

    const bodyTop = a.top + 46;
    const slots = gridSlots(
      { left: a.left, top: bodyTop, width: gridW, height: a.height - (bodyTop - a.top) - 20 },
      ctx.count, 18, ctx.subtitle ? 18 : 0,
    );

    // notes column
    const notesX = a.left + gridW + 18;
    chrome.push(
      text('Notes', {
        left: notesX, top: bodyTop, width: colW,
        fontSize: 10, fontWeight: 'bold', fontFamily: ctx.font, fill: ctx.ink,
      }),
    );
    const lineTop = bodyTop + 22;
    const lines = Math.floor((a.top + a.height - lineTop) / 22);
    for (let i = 0; i < lines; i++) {
      chrome.push(
        new fabric.Line(
          [notesX, lineTop + i * 22, notesX + colW, lineTop + i * 22],
          { stroke: '#d7dde6', strokeWidth: 0.7 },
        ),
      );
    }
    return { chrome, slots };
  },
};

// ------------------------------------------------------------ 7. solutions

const solutions: SudokuTemplate = {
  id: 'solutions',
  name: 'Solutions grid',
  audience: 'minimal',
  accessLevel: 'free',
  bestFor: [4, 9, 16],
  supports: [2, 4, 6, 9],
  description: 'Compact answer grids packed several to a page, with a heading.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="14" font-size="8" font-family="Georgia">Solutions</text>
    ${[0, 1, 2].map((r) => [0, 1].map((c) => `<rect x="${12 + c * 42}" y="${26 + r * 36}" width="34" height="30" fill="none" stroke="#111" stroke-width="0.8"/>`).join('')).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    chrome.push(
      text('Solutions', {
        left: a.left, top: a.top, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.045),
        fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
      }),
    );
    const bodyTop = a.top + 34;
    const slots = gridSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - 20 },
      ctx.count, 14, 14,
    );
    if (ctx.folio !== undefined) {
      chrome.push(
        text(String(ctx.folio), {
          left: a.left, top: a.top + a.height - 14, width: a.width,
          fontSize: 10, fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
        }),
      );
    }
    return { chrome, slots };
  },
};

export const SUDOKU_TEMPLATES: SudokuTemplate[] = [
  classic,
  twoUp,
  kidsBig,
  kidsPlay,
  advanced,
  journal,
  // journal / low-content book designs (see journal-templates.ts)
  ...JOURNAL_TEMPLATE_FACTORIES.map((make) => make(area)),
  solutions,
];

export const getTemplate = (id: string) =>
  SUDOKU_TEMPLATES.find((t) => t.id === id) ?? classic;

/** Templates that suit a grid size and puzzle count. */
export function templatesFor(gridSize: GridSize, perPage: number) {
  return SUDOKU_TEMPLATES.filter(
    (t) => t.id !== 'solutions' && t.bestFor.includes(gridSize) && t.supports.includes(perPage),
  );
}

/** Puzzle counts a template can host. */