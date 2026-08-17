import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';
import {
  clockIcon,
  ornamentRule,
  sprig,
  starRow,
  text,
  writeLine,
} from '../sudoku-maker/furniture';

/**
 * Crossword page templates.
 *
 * A template is a *frame*: title, decoration, footer — plus the exact rectangle
 * where the grid belongs and the rectangle the clue lists get. The generator
 * fills those, so the puzzle always lands correctly inside the design whatever
 * the trim size.
 *
 * Every element is a plain fabric object (CRITICAL RULE #4).
 */

export interface CwTemplateContext {
  page: Page;
  pageNumber: number;
  pageCount: number;
  count: number;
  /** cells per side */
  gridSize: number;
  /** points the clue lists need at full width */
  clueHeight: number;
  font: string;
  kdpSafe: boolean;
  title: string;
  subtitle?: string;
  theme?: string;
  /** difficulty word, for star ratings */
  level?: string;
  folio?: number;
  ink: string;
  accent: string;
}

export interface CwSlot {
  left: number;
  /** top of the grid itself (not the caption) */
  top: number;
  size: number;
  captionTop?: number;
  /** where the clue block starts */
  clueTop?: number;
  clueLeft?: number;
  clueWidth?: number;
  clueColumns?: number;
  /** how much vertical room the clue column may use */
  clueMaxHeight?: number;
}

export interface CwTemplateResult {
  chrome: fabric.FabricObject[];
  slots: CwSlot[];
}

export interface CwTemplate {
  id: string;
  name: string;
  audience: 'kids' | 'classic' | 'themed' | 'minimal';
  accessLevel: 'free' | 'ad_unlock' | 'premium_only';
  supports: number[];
  isSolution?: boolean;
  description: string;
  /** SVG preview, viewBox 0 0 100 141 */
  preview: string;
  build: (ctx: CwTemplateContext) => CwTemplateResult;
}

// ---------------------------------------------------------------- helpers

function area(ctx: CwTemplateContext) {
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

/** Grid on top, clue lists underneath. The classic crossword page. */
function stackedSlot(
  box: { left: number; top: number; width: number; height: number },
  clueH: number,
  gap: number,
  clueCols: number,
  captionH = 0,
): CwSlot[] {
  const avail = box.height - captionH - clueH - gap;
  const size = Math.max(60, Math.min(box.width, avail));
  return [{
    left: box.left + (box.width - size) / 2,
    top: box.top + captionH,
    size,
    captionTop: captionH > 0 ? box.top : undefined,
    clueTop: box.top + captionH + size + gap,
    clueLeft: box.left,
    clueWidth: box.width,
    clueColumns: clueCols,
  }];
}

/**
 * Grid on the left, clues in a column beside it.
 *
 * The clue column only needs to be as tall as its clues, so the grid should be
 * free to grow past it and use the full height of the page — sizing the grid to
 * the clue column instead left the bottom half of the sheet empty.
 */
function besideSlot(
  box: { left: number; top: number; width: number; height: number },
  gridFrac: number,
  gap: number,
  clueH: number,
  captionH = 0,
): CwSlot[] {
  const avail = box.height - captionH;

  // The clue column only needs to be as tall as its clues. Give the grid every
  // point of height available, and only narrow it if the clue column would be
  // squeezed below a readable width.
  const minClueW = Math.max(132, box.width * 0.3);
  const widestByClues = box.width - gap - minClueW;
  const size = Math.max(60, Math.min(avail, widestByClues));

  // On a portrait trim the grid is limited by the width the clue column leaves,
  // so it can never fill the height. Centre the whole block vertically rather
  // than pinning it to the top, which just looks like the page ran short.
  const blockH = Math.max(size, Math.min(clueH, avail));
  const top = box.top + captionH + Math.max(0, (avail - blockH) / 2);

  void gridFrac;
  return [{
    left: box.left,
    top,
    size,
    captionTop: captionH > 0 ? box.top : undefined,
    clueTop: top,
    clueLeft: box.left + size + gap,
    clueWidth: Math.max(minClueW, box.width - size - gap),
    clueColumns: 1,
    clueMaxHeight: clueH,
  }];
}

/** Answer grids packed several to a page. */
function keySlots(
  box: { left: number; top: number; width: number; height: number },
  count: number,
  gap: number,
  captionH: number,
): CwSlot[] {
  let best = { cols: 1, rows: count, size: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const cw = (box.width - gap * (cols - 1)) / cols;
    const ch = (box.height - gap * (rows - 1)) / rows - captionH;
    const size = Math.min(cw, ch);
    if (size > best.size) best = { cols, rows, size };
  }
  const { cols, rows, size } = best;
  const cellH = size + captionH;
  const blockH = rows * cellH + gap * (rows - 1);
  const startY = box.top + Math.max(0, (box.height - blockH) / 2);

  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const inRow = Math.min(cols, count - r * cols);
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

const fakeGrid = (x: number, y: number, w: number, n: number) => {
  let out = '';
  const step = w / n;
  // a plausible freeform shape
  const on = (r: number, c: number) =>
    r === 3 || c === 4 || (r === 6 && c > 1 && c < 8) || (c === 2 && r > 1 && r < 7);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!on(r, c)) continue;
      out += `<rect x="${(x + c * step).toFixed(2)}" y="${(y + r * step).toFixed(2)}" width="${step.toFixed(2)}" height="${step.toFixed(2)}" fill="none" stroke="#333" stroke-width="0.35"/>`;
    }
  }
  return out;
};

const fakeClues = (x: number, y: number, w: number, rows: number, cols: number) => {
  let out = '';
  const cw = w / cols;
  for (let c = 0; c < cols; c++) {
    out += `<rect x="${(x + c * cw).toFixed(2)}" y="${y}" width="10" height="2.4" fill="#333" opacity=".8"/>`;
    for (let r = 0; r < rows; r++) {
      out += `<rect x="${(x + c * cw).toFixed(2)}" y="${(y + 5 + r * 4).toFixed(2)}" width="${(cw * 0.82).toFixed(2)}" height="1.7" rx=".8" fill="#666" opacity=".55"/>`;
    }
  }
  return out;
};

// ------------------------------------------------------------- 1. classic

const classic: CwTemplate = {
  id: 'classic',
  name: 'Classic book',
  audience: 'classic',
  accessLevel: 'free',
  supports: [1],
  description: 'Title, grid and two columns of ACROSS / DOWN clues. The standard KDP crossword interior.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="15" font-size="8" font-family="Georgia">CROSSWORD</text>
    <text x="10" y="24" font-size="4" fill="#555">Puzzle No. 1</text>
    ${fakeGrid(22, 28, 56, 10)}
    ${fakeClues(10, 92, 80, 7, 2)}
    <path d="M40 133 h20" stroke="#111" stroke-width="0.5"/>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      text(ctx.title, {
        left: a.left, top: a.top, width: a.width * 0.66,
        fontSize: Math.round(ctx.page.width * 0.055),
        fontFamily: ctx.font, fill: ctx.ink,
      }),
    );

    const headTop = a.top + Math.round(ctx.page.width * 0.072);
    if (ctx.subtitle) {
      const bits = ctx.subtitle.split('·').map((s) => s.trim());
      chrome.push(
        text(bits[0] ?? '', {
          left: a.left, top: headTop, width: a.width * 0.5,
          fontSize: 10, fontFamily: ctx.font, fill: ctx.ink,
        }),
      );
      if (bits.length > 1) {
        chrome.push(
          text(bits.slice(1).join(' · '), {
            left: a.left + a.width * 0.5, top: headTop, width: a.width * 0.5,
            fontSize: 10, fontFamily: ctx.font, fill: ctx.ink, textAlign: 'right',
          }),
        );
      }
    }

    const bodyTop = headTop + 18;
    const footH = ctx.folio !== undefined ? 26 : 6;
    const slots = stackedSlot(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.clueHeight, 18, 2,
    );

    if (ctx.folio !== undefined) {
      chrome.push(
        text(String(ctx.folio), {
          left: a.left, top: a.top + a.height - 13, width: a.width,
          fontSize: 10, fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
        }),
      );
    }
    return { chrome, slots };
  },
};

// ---------------------------------------------------------- 2. clues beside

const beside: CwTemplate = {
  id: 'beside',
  name: 'Clues beside',
  audience: 'classic',
  accessLevel: 'free',
  supports: [1],
  description: 'Grid on the left with a tall column of clues alongside. Best on wide or landscape trims — on a tall page the grid is limited by the clue column.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="8" y="14" font-size="6.5" font-family="Georgia">CROSSWORD</text>
    ${fakeGrid(6, 22, 52, 10)}
    ${fakeClues(63, 24, 30, 18, 1)}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      text(ctx.title, {
        left: a.left, top: a.top, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.05),
        fontFamily: ctx.font, fill: ctx.ink,
      }),
    );
    if (ctx.subtitle) {
      chrome.push(
        text(ctx.subtitle, {
          left: a.left, top: a.top + Math.round(ctx.page.width * 0.062),
          width: a.width, fontSize: 9.5, fontFamily: ctx.font, fill: '#6b7280',
        }),
      );
    }

    const bodyTop = a.top + Math.round(ctx.page.width * 0.09);
    const footH = ctx.folio !== undefined ? 24 : 4;
    const slots = besideSlot(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      0.58, 16, ctx.clueHeight,
    );

    if (ctx.folio !== undefined) {
      chrome.push(
        text(String(ctx.folio), {
          left: a.left, top: a.top + a.height - 12, width: a.width,
          fontSize: 10, fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
        }),
      );
    }
    return { chrome, slots };
  },
};

// ------------------------------------------------------------- 3. themed

const themed: CwTemplate = {
  id: 'themed',
  name: 'Themed — elegant',
  audience: 'themed',
  accessLevel: 'free',
  supports: [1],
  description: 'Theme name in a ruled band above the grid, clues in two columns below.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <path d="M10 13 h80" stroke="#2b7fb8" stroke-width="0.6"/>
    <text x="50" y="24" font-size="7" text-anchor="middle" font-family="Georgia" fill="#2b7fb8">NATURE</text>
    <path d="M10 29 h80" stroke="#2b7fb8" stroke-width="0.6"/>
    ${fakeGrid(24, 34, 52, 10)}
    ${fakeClues(10, 94, 80, 7, 2)}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    const rule = (y: number) =>
      new fabric.Line([a.left, y, a.left + a.width, y], {
        stroke: ctx.accent, strokeWidth: 0.8,
      });

    chrome.push(rule(a.top + 2));
    chrome.push(
      text((ctx.theme ?? ctx.title).toUpperCase(), {
        left: a.left, top: a.top + 10, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.04),
        fontFamily: ctx.font, fill: ctx.accent,
        textAlign: 'center', charSpacing: 120,
      }),
    );
    const bandBottom = a.top + 12 + Math.round(ctx.page.width * 0.04) * 1.5;
    chrome.push(rule(bandBottom));

    if (ctx.subtitle) {
      chrome.push(
        text(ctx.subtitle, {
          left: a.left, top: bandBottom + 6, width: a.width,
          fontSize: 9.5, fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
        }),
      );
    }

    const bodyTop = bandBottom + (ctx.subtitle ? 24 : 12);
    const footH = ctx.folio !== undefined ? 26 : 6;
    const slots = stackedSlot(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.clueHeight, 16, 2,
    );

    if (ctx.folio !== undefined) {
      chrome.push(
        text(String(ctx.folio), {
          left: a.left, top: a.top + a.height - 13, width: a.width,
          fontSize: 10, fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
        }),
      );
    }
    return { chrome, slots };
  },
};

// ------------------------------------------------------------- 4. minimal

const minimal: CwTemplate = {
  id: 'minimal',
  name: 'Minimal',
  audience: 'minimal',
  accessLevel: 'free',
  supports: [1],
  description: 'Just a number, the grid and the clues. Largest possible grid.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="16" font-size="4.5" fill="#888">01</text>
    ${fakeGrid(20, 22, 60, 10)}
    ${fakeClues(10, 96, 80, 7, 2)}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      text(String(ctx.folio ?? ctx.pageNumber).padStart(2, '0'), {
        left: a.left, top: a.top, width: a.width * 0.3,
        fontSize: 11, fontFamily: ctx.font, fill: '#8a94a6',
      }),
    );
    if (ctx.theme) {
      chrome.push(
        text(ctx.theme, {
          left: a.left + a.width * 0.3, top: a.top, width: a.width * 0.7,
          fontSize: 11, fontFamily: ctx.font, fill: '#8a94a6', textAlign: 'right',
        }),
      );
    }

    const bodyTop = a.top + 22;
    const slots = stackedSlot(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - 22 },
      ctx.clueHeight, 16, 2,
    );
    return { chrome, slots };
  },
};

// ------------------------------------------------------- 5. journal / daily

const journal: CwTemplate = {
  id: 'journal',
  name: 'Daily — journal',
  audience: 'themed',
  accessLevel: 'ad_unlock',
  supports: [1],
  description: 'Cream page with date field, star difficulty and a timer — matches the Sudoku journal designs.',
  preview: `<rect width="100" height="141" fill="#fdfcf7"/>
    <text x="50" y="14" font-size="7" text-anchor="middle" font-family="Georgia" fill="#555">DAILY CROSSWORD</text>
    <text x="9" y="26" font-size="3.6" fill="#444">Date: ________</text>
    ${[0, 1, 2, 3, 4].map((i) => `<path d="M${62 + i * 6} 21.4 l1.05 2.13 2.35.34-1.7 1.66.4 2.34-2.1-1.11-2.1 1.11.4-2.34-1.7-1.66 2.35-.34z" fill="${i === 0 ? '#777' : 'none'}" stroke="#777" stroke-width="0.35"/>`).join('')}
    ${fakeGrid(24, 32, 52, 10)}
    ${fakeClues(10, 92, 80, 6, 2)}
    <path d="M30 128 h40" stroke="#999" stroke-width="0.4"/>
    <text x="50" y="136" font-size="3.4" text-anchor="middle" fill="#555" font-style="italic">One clue at a time.</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    const soft = '#8a9490';

    chrome.push(
      new fabric.Rect({
        left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
        fill: '#fdfcf7', selectable: true,
      }),
      text(ctx.title.toUpperCase(), {
        left: a.left, top: a.top, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.042),
        fontFamily: ctx.font, fill: '#6b7280',
        textAlign: 'center', charSpacing: 90,
      }),
      sprig({ left: a.left + a.width - 18, top: a.top + 14, size: 34, color: soft, angle: 118 }),
    );

    // date + stars
    const hy = a.top + Math.round(ctx.page.width * 0.07);
    chrome.push(
      text('Date:', {
        left: a.left, top: hy, width: 36,
        fontSize: 11, fontFamily: ctx.font, fill: ctx.ink,
      }),
      writeLine({ left: a.left + 34, top: hy + 13, width: a.width * 0.32, color: ctx.ink }),
    );

    const starsFilled =
      ctx.level === 'easy' ? 1 : ctx.level === 'medium' ? 3
        : ctx.level === 'hard' ? 4 : ctx.level === 'expert' ? 5 : 0;
    chrome.push(
      text('Difficulty', {
        left: a.left + a.width * 0.52, top: hy, width: 62,
        fontSize: 11, fontFamily: ctx.font, fill: ctx.ink,
      }),
      ...starRow({
        left: a.left + a.width * 0.52 + 64, top: hy - 1,
        size: 11, gap: 3, filled: starsFilled, color: '#6b7280',
      }),
    );

    const bodyTop = hy + 26;
    const footH = 44;
    const slots = stackedSlot(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.clueHeight, 14, 2,
    );

    const fy = a.top + a.height - 30;
    chrome.push(
      ...ornamentRule({ centerX: a.left + a.width / 2, top: fy, width: a.width * 0.6, color: '#9aa3ad' }),
      clockIcon(a.left + 10, fy + 18, 7, ctx.ink),
      text('Time:', {
        left: a.left + 22, top: fy + 11, width: 46,
        fontSize: 10, fontFamily: ctx.font, fill: ctx.ink,
      }),
      writeLine({ left: a.left + 54, top: fy + 22, width: a.width * 0.22, color: ctx.ink }),
      text('One clue at a time.', {
        left: a.left + a.width * 0.5, top: fy + 11, width: a.width * 0.5,
        fontSize: 10, fontFamily: ctx.font, fill: '#6b7280',
        fontStyle: 'italic', textAlign: 'right',
      }),
    );
    return { chrome, slots };
  },
};

// --------------------------------------------------------- 6. kids friendly

const kids: CwTemplate = {
  id: 'kids',
  name: 'Kids — big & friendly',
  audience: 'kids',
  accessLevel: 'free',
  supports: [1],
  description: 'Colour panel, big cells and large clue type for young solvers.',
  preview: `<rect width="100" height="141" fill="#e8f4fb"/>
    <rect x="6" y="6" width="88" height="129" rx="7" fill="#fff"/>
    <text x="50" y="22" font-size="10" text-anchor="middle" font-family="Verdana" fill="#2b7fb8">PUZZLE</text>
    <circle cx="26" cy="32" r="4.5" fill="#ffd166"/><circle cx="50" cy="32" r="4.5" fill="#ef8fa0"/><circle cx="74" cy="32" r="4.5" fill="#8fd4a8"/>
    ${fakeGrid(26, 40, 48, 8)}
    ${fakeClues(12, 96, 76, 6, 2)}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      new fabric.Rect({
        left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
        fill: '#e8f4fb', selectable: true,
      }),
      new fabric.Rect({
        left: a.left - 14, top: a.top - 14,
        width: a.width + 28, height: a.height + 28,
        rx: 18, ry: 18, fill: '#ffffff', selectable: true,
      }),
      text(ctx.title.toUpperCase(), {
        left: a.left, top: a.top + 4, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.072),
        fontWeight: 'bold', fontFamily: ctx.font,
        fill: ctx.accent, textAlign: 'center', charSpacing: 50,
      }),
    );

    const dotY = a.top + Math.round(ctx.page.width * 0.11);
    ['#ffd166', '#ef8fa0', '#8fd4a8'].forEach((c, i) => {
      chrome.push(
        new fabric.Circle({
          left: a.left + a.width * (0.3 + i * 0.2), top: dotY,
          radius: 8, fill: c, originX: 'center', originY: 'center',
        }),
      );
    });

    const bodyTop = dotY + 22;
    const footH = 26;
    const slots = stackedSlot(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.clueHeight, 14, 2,
    );

    chrome.push(
      text('Read the clue, then write one letter in each box.', {
        left: a.left, top: a.top + a.height - 18, width: a.width,
        fontSize: 9.5, fontFamily: ctx.font, fill: '#5b7a8c', textAlign: 'center',
      }),
    );
    return { chrome, slots };
  },
};

// --------------------------------------------------------- 7. answer keys

const answers: CwTemplate = {
  id: 'answers',
  name: 'Answer key grid',
  audience: 'minimal',
  accessLevel: 'free',
  supports: [1, 2, 4, 6],
  isSolution: true,
  description: 'Filled answer grids packed several to a page with their puzzle numbers.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="14" font-size="7" text-anchor="middle" font-family="Georgia">Answers</text>
    ${[0, 1].map((r) => [0, 1].map((c) => fakeGrid(10 + c * 44, 24 + r * 52, 38, 9)).join('')).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      text(ctx.title, {
        left: a.left, top: a.top, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.042),
        fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
      }),
    );

    const bodyTop = a.top + Math.round(ctx.page.width * 0.07);
    const footH = ctx.folio !== undefined ? 26 : 6;
    const slots = keySlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.count, 20, 16,
    );

    if (ctx.folio !== undefined) {
      chrome.push(
        text(String(ctx.folio), {
          left: a.left, top: a.top + a.height - 13, width: a.width,
          fontSize: 10, fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
        }),
      );
    }
    return { chrome, slots };
  },
};

export const CW_TEMPLATES: CwTemplate[] = [
  classic, beside, themed, minimal, journal, kids, answers,
];

export const getCwTemplate = (id: string) =>
  CW_TEMPLATES.find((t) => t.id === id) ?? classic;

export function cwTemplatesFor(perPage: number) {
  return CW_TEMPLATES.filter((t) => !t.isSolution && t.supports.includes(perPage));
}
