import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';

/**
 * Word search page templates.
 *
 * A template is a *frame*: title, decoration, instruction line, footer — plus
 * the exact rectangles where the letter grid and its word bank belong. The
 * generator fills those rectangles, so the puzzle always lands perfectly inside
 * the design no matter which template, trim size or puzzle count is chosen.
 *
 * Every element is a plain fabric object, so the user can still edit anything
 * afterwards (CRITICAL RULE #4).
 */

export interface WsTemplateContext {
  page: Page;
  pageNumber: number;
  pageCount: number;
  /** puzzles to place on this page */
  count: number;
  /** letters per side */
  gridSize: number;
  /** how many words are in the bank, so space can be reserved */
  wordCount: number;
  /** points the bank needs at full width */
  bankHeight: number;
  font: string;
  kdpSafe: boolean;
  /** heading text, e.g. "Word Search" */
  title: string;
  /** "Puzzle 7 · Animals" for the first puzzle on the page */
  subtitle?: string;
  /** theme name for the page heading */
  theme?: string;
  folio?: number;
  ink: string;
  accent: string;
}

/** Where one puzzle goes. */
export interface WsSlot {
  left: number;
  /** top of the letter grid itself (not the caption) */
  top: number;
  size: number;
  /** caption drawn above the grid */
  captionTop?: number;
  /** where the word bank starts */
  bankTop?: number;
  /** width available to the bank */
  bankWidth?: number;
  /** how many columns the bank should use in this design */
  bankColumns?: number;
}

export interface WsTemplateResult {
  chrome: fabric.FabricObject[];
  slots: WsSlot[];
}

export interface WsTemplate {
  id: string;
  name: string;
  audience: 'kids' | 'classic' | 'themed' | 'minimal';
  accessLevel: 'free' | 'ad_unlock' | 'premium_only';
  /** grid sizes this design suits best (inclusive range) */
  sizeRange: [number, number];
  /** how many puzzles the design supports per page */
  supports: number[];
  /** true when the design is meant for answer keys */
  isSolution?: boolean;
  description: string;
  /** SVG preview, viewBox 0 0 100 141 */
  preview: string;
  build: (ctx: WsTemplateContext) => WsTemplateResult;
}

// ---------------------------------------------------------------- helpers

const text = (t: string, o: Partial<fabric.TextboxProps>) =>
  new fabric.Textbox(t, { fontFamily: 'Inter', ...o });

function area(ctx: WsTemplateContext) {
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

/**
 * Stack `count` puzzles down a box, each with a caption, a square grid and a
 * word bank underneath. The grid is sized so the whole stack fits exactly.
 */
function stackSlots(
  box: { left: number; top: number; width: number; height: number },
  count: number,
  captionH: number,
  bankH: number,
  gap: number,
  bankColumns: number,
): WsSlot[] {
  // each unit = caption + square grid + bank
  const perUnitExtra = captionH + bankH;
  const avail = (box.height - gap * (count - 1)) / count - perUnitExtra;
  const size = Math.max(60, Math.min(avail, box.width));
  const unitH = captionH + size + bankH;
  const blockH = count * unitH + gap * (count - 1);
  const startY = box.top + Math.max(0, (box.height - blockH) / 2);
  const left = box.left + (box.width - size) / 2;

  return Array.from({ length: count }, (_, i) => {
    const top = startY + i * (unitH + gap);
    return {
      left,
      top: top + captionH,
      size,
      captionTop: captionH > 0 ? top : undefined,
      bankTop: top + captionH + size + 8,
      // the bank may use the full column width, not just the grid width
      bankWidth: box.width,
      bankColumns,
    };
  });
}

/** Side-by-side squares for answer keys (no bank). */
function keySlots(
  box: { left: number; top: number; width: number; height: number },
  count: number,
  gap: number,
  captionH: number,
): WsSlot[] {
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

const DIVIDER = 'M 0 4 L 42 4 M 46 4 l 4 -4 l 4 4 l -4 4 z M 58 4 L 100 4';

/** Small helper for the SVG previews: a block of fake letters. */
const fakeGrid = (x: number, y: number, w: number, n: number, fill = '#333') => {
  const step = w / n;
  let out = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out += `<rect x="${(x + c * step + step * 0.22).toFixed(2)}" y="${(y + r * step + step * 0.22).toFixed(2)}" width="${(step * 0.5).toFixed(2)}" height="${(step * 0.55).toFixed(2)}" fill="${fill}" opacity=".75"/>`;
    }
  }
  return out;
};

const fakeBank = (x: number, y: number, w: number, rows: number, cols: number, fill = '#666') => {
  let out = '';
  const cw = w / cols;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out += `<rect x="${(x + c * cw).toFixed(2)}" y="${(y + r * 5).toFixed(2)}" width="${(cw * 0.72).toFixed(2)}" height="2.2" rx="1" fill="${fill}" opacity=".6"/>`;
    }
  }
  return out;
};

// ------------------------------------------------------------- 1. classic

const classic: WsTemplate = {
  id: 'classic',
  name: 'Classic book',
  audience: 'classic',
  accessLevel: 'free',
  sizeRange: [8, 25],
  supports: [1],
  description:
    'Title, puzzle number, letter grid and a three-column word list. The standard KDP word search interior.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="16" font-size="9" font-family="Georgia">WORD SEARCH</text>
    <text x="10" y="27" font-size="4.5" fill="#555">Puzzle No. 1</text>
    <rect x="14" y="32" width="72" height="72" fill="none" stroke="#111" stroke-width="1"/>
    ${fakeGrid(14, 32, 72, 10)}
    ${fakeBank(14, 112, 72, 4, 3)}
    <path d="M32 132 h36" stroke="#111" stroke-width="0.6"/>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      text(ctx.title, {
        left: a.left,
        top: a.top,
        width: a.width * 0.62,
        fontSize: Math.round(ctx.page.width * 0.055),
        fontFamily: ctx.font,
        fill: ctx.ink,
      }),
    );

    const headTop = a.top + Math.round(ctx.page.width * 0.075);
    if (ctx.subtitle) {
      const bits = ctx.subtitle.split('·').map((s) => s.trim());
      chrome.push(
        text(bits[0] ?? '', {
          left: a.left,
          top: headTop,
          width: a.width * 0.5,
          fontSize: 10,
          fontFamily: ctx.font,
          fill: ctx.ink,
        }),
      );
      if (bits.length > 1) {
        chrome.push(
          text(bits.slice(1).join(' · '), {
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
    const footH = 40;
    const slots = stackSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.count,
      0,
      ctx.bankHeight,
      20,
      3,
    );

    chrome.push(
      new fabric.Path(DIVIDER, {
        left: a.left + a.width / 2,
        top: a.top + a.height - 30,
        stroke: ctx.ink,
        strokeWidth: 0.9,
        fill: null,
        originX: 'center',
        scaleX: (a.width * 0.4) / 100,
      }),
    );

    if (ctx.folio !== undefined) {
      chrome.push(
        text(String(ctx.folio), {
          left: a.left,
          top: a.top + a.height - 14,
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

// -------------------------------------------------------- 2. kids big fun

const kidsBig: WsTemplate = {
  id: 'kids-big',
  name: 'Kids — big & friendly',
  audience: 'kids',
  accessLevel: 'free',
  sizeRange: [6, 14],
  supports: [1],
  description:
    'Rounded colour panel, big letters, checklist word bank with tick boxes. Made for young solvers.',
  preview: `<rect width="100" height="141" fill="#fff4e0"/>
    <rect x="6" y="6" width="88" height="129" rx="7" fill="#fff"/>
    <text x="50" y="22" font-size="10" text-anchor="middle" font-family="Verdana" fill="#e08b3a">FIND THEM!</text>
    <circle cx="24" cy="32" r="5" fill="#ffd166"/><circle cx="50" cy="32" r="5" fill="#ef8fa0"/><circle cx="76" cy="32" r="5" fill="#8fd4a8"/>
    <rect x="18" y="42" width="64" height="64" rx="4" fill="none" stroke="#e08b3a" stroke-width="1.6"/>
    ${fakeGrid(18, 42, 64, 8, '#7a5a35')}
    ${fakeBank(20, 114, 60, 3, 2, '#8a6a45')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      new fabric.Rect({
        left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
        fill: '#fff4e0', selectable: true,
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
        fontSize: Math.round(ctx.page.width * 0.075),
        fontWeight: 'bold', fontFamily: ctx.font,
        fill: ctx.accent, textAlign: 'center', charSpacing: 50,
      }),
    );

    const dotY = a.top + Math.round(ctx.page.width * 0.115);
    ['#ffd166', '#ef8fa0', '#8fd4a8'].forEach((c, i) => {
      chrome.push(
        new fabric.Circle({
          left: a.left + a.width * (0.3 + i * 0.2),
          top: dotY, radius: 8, fill: c,
          originX: 'center', originY: 'center',
        }),
      );
    });

    if (ctx.theme) {
      chrome.push(
        text(ctx.theme.toUpperCase(), {
          left: a.left, top: dotY + 14, width: a.width,
          fontSize: 12, fontFamily: ctx.font, fill: '#8a6a45',
          textAlign: 'center', charSpacing: 80,
        }),
      );
    }

    const bodyTop = dotY + (ctx.theme ? 36 : 22);
    const footH = 34;
    const slots = stackSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.count, 0, ctx.bankHeight, 16, 2,
    );

    chrome.push(
      text('Circle each word when you find it. Words go across and down.', {
        left: a.left, top: a.top + a.height - 22, width: a.width,
        fontSize: 9.5, fontFamily: ctx.font, fill: '#a08055', textAlign: 'center',
      }),
    );
    return { chrome, slots };
  },
};

// ---------------------------------------------------- 3. themed / elegant

const themed: WsTemplate = {
  id: 'themed',
  name: 'Themed — elegant',
  audience: 'themed',
  accessLevel: 'free',
  sizeRange: [10, 22],
  supports: [1],
  description:
    'Theme name in a ruled band above the grid, boxed word list below. Great for themed adult collections.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <path d="M10 14 h80" stroke="#2b7fb8" stroke-width="0.7"/>
    <text x="50" y="26" font-size="8" text-anchor="middle" font-family="Georgia" fill="#2b7fb8">GARDEN</text>
    <path d="M10 32 h80" stroke="#2b7fb8" stroke-width="0.7"/>
    <rect x="12" y="38" width="76" height="76" fill="none" stroke="#334" stroke-width="0.8"/>
    ${fakeGrid(12, 38, 76, 12)}
    <rect x="10" y="118" width="80" height="18" rx="2.5" fill="none" stroke="#2b7fb8" stroke-width="0.6"/>
    ${fakeBank(13, 122, 74, 3, 3, '#2b7fb8')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    const line = (y: number) =>
      new fabric.Line([a.left, y, a.left + a.width, y], {
        stroke: ctx.accent, strokeWidth: 0.8,
      });

    chrome.push(line(a.top + 2));
    chrome.push(
      text((ctx.theme ?? ctx.title).toUpperCase(), {
        left: a.left, top: a.top + 10, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.042),
        fontFamily: ctx.font, fill: ctx.accent,
        textAlign: 'center', charSpacing: 120,
      }),
    );
    const bandBottom = a.top + 12 + Math.round(ctx.page.width * 0.042) * 1.5;
    chrome.push(line(bandBottom));

    if (ctx.subtitle) {
      chrome.push(
        text(ctx.subtitle, {
          left: a.left, top: bandBottom + 6, width: a.width,
          fontSize: 9.5, fontFamily: ctx.font, fill: ctx.ink,
          textAlign: 'center',
        }),
      );
    }

    const bodyTop = bandBottom + (ctx.subtitle ? 24 : 12);
    const footH = 36;
    const slots = stackSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
      ctx.count, 0, ctx.bankHeight + 14, 18, 3,
    );

    // boxed frame behind the word bank
    for (const s of slots) {
      if (s.bankTop === undefined) continue;
      chrome.push(
        new fabric.Rect({
          left: a.left, top: s.bankTop - 8,
          width: a.width, height: ctx.bankHeight + 12,
          rx: 4, ry: 4, fill: null,
          stroke: ctx.accent, strokeWidth: 0.7,
        }),
      );
    }

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

// -------------------------------------------------------- 4. minimal / zen

const minimal: WsTemplate = {
  id: 'minimal',
  name: 'Minimal',
  audience: 'minimal',
  accessLevel: 'free',
  sizeRange: [8, 25],
  supports: [1],
  description: 'Nothing but a small number, the grid and an inline word list. Maximum grid size.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="18" font-size="5" fill="#888">01</text>
    <rect x="8" y="26" width="84" height="84" fill="none" stroke="#ddd" stroke-width="0.5"/>
    ${fakeGrid(8, 26, 84, 14)}
    ${fakeBank(12, 118, 76, 2, 4, '#999')}`,
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

    const bodyTop = a.top + 24;
    const slots = stackSlots(
      { left: a.left, top: bodyTop, width: a.width, height: a.height - 24 },
      ctx.count, 0, ctx.bankHeight, 16, 4,
    );
    return { chrome, slots };
  },
};

// ------------------------------------------------------ 5. two per page

const twoUp: WsTemplate = {
  id: 'two-up',
  name: 'Two per page',
  audience: 'classic',
  accessLevel: 'ad_unlock',
  sizeRange: [6, 13],
  supports: [2],
  description: 'Two small puzzles stacked with their own word lists, separated by a rule.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="12" font-size="4.5" fill="#555">Puzzle 1</text>
    <rect x="22" y="16" width="46" height="46" fill="none" stroke="#111" stroke-width="0.7"/>
    ${fakeGrid(22, 16, 46, 8)}
    ${fakeBank(22, 64, 56, 2, 3)}
    <path d="M10 76 h80" stroke="#bbb" stroke-width="0.5"/>
    <text x="10" y="86" font-size="4.5" fill="#555">Puzzle 2</text>
    <rect x="22" y="90" width="46" height="46" fill="none" stroke="#111" stroke-width="0.7"/>
    ${fakeGrid(22, 90, 46, 8)}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    const footH = ctx.folio !== undefined ? 26 : 8;

    const slots = stackSlots(
      { left: a.left, top: a.top, width: a.width, height: a.height - footH },
      ctx.count, 18, ctx.bankHeight, 22, 3,
    );

    // rule between the two puzzles
    for (let i = 1; i < slots.length; i++) {
      const prev = slots[i - 1];
      const y = ((prev.bankTop ?? prev.top) + ctx.bankHeight + (slots[i].captionTop ?? slots[i].top)) / 2;
      chrome.push(
        new fabric.Line([a.left, y, a.left + a.width, y], {
          stroke: '#c7ced8', strokeWidth: 0.7,
        }),
      );
    }

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

// ------------------------------------------------------ 6. journal / notes

const journal: WsTemplate = {
  id: 'journal',
  name: 'With notes',
  audience: 'themed',
  accessLevel: 'premium_only',
  sizeRange: [8, 18],
  supports: [1],
  description:
    'Grid and word list plus a ruled notes area — for puzzle-journal hybrids.',
  preview: `<rect width="100" height="141" fill="#fdfcf8"/>
    <text x="50" y="14" font-size="7" text-anchor="middle" font-family="Georgia">Word Search</text>
    <rect x="18" y="20" width="64" height="64" fill="none" stroke="#7a6a55" stroke-width="0.8"/>
    ${fakeGrid(18, 20, 64, 10, '#5a4a38')}
    ${fakeBank(15, 90, 70, 2, 3, '#7a6a55')}
    ${[0, 1, 2, 3].map((i) => `<path d="M12 ${106 + i * 8} h76" stroke="#d8cfbe" stroke-width="0.5"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(
      new fabric.Rect({
        left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
        fill: '#fdfcf8', selectable: true,
      }),
      text(ctx.theme ?? ctx.title, {
        left: a.left, top: a.top, width: a.width,
        fontSize: Math.round(ctx.page.width * 0.045),
        fontFamily: ctx.font, fill: ctx.ink, textAlign: 'center',
      }),
    );

    const bodyTop = a.top + Math.round(ctx.page.width * 0.075);
    const notesH = Math.max(90, a.height * 0.22);
    const slots = stackSlots(
      {
        left: a.left, top: bodyTop, width: a.width,
        height: a.height - (bodyTop - a.top) - notesH - 24,
      },
      ctx.count, 0, ctx.bankHeight, 16, 3,
    );

    // ruled notes block
    const notesTop = a.top + a.height - notesH;
    chrome.push(
      text('Notes', {
        left: a.left, top: notesTop - 16, width: a.width,
        fontSize: 10, fontFamily: ctx.font, fill: '#8a7a63',
      }),
    );
    const lineGap = 20;
    for (let y = notesTop; y < a.top + a.height - 6; y += lineGap) {
      chrome.push(
        new fabric.Line([a.left, y, a.left + a.width, y], {
          stroke: '#d8cfbe', strokeWidth: 0.6,
        }),
      );
    }
    return { chrome, slots };
  },
};

// --------------------------------------------------------- 7. answer keys

const answerKey: WsTemplate = {
  id: 'answers',
  name: 'Answer key grid',
  audience: 'minimal',
  accessLevel: 'free',
  sizeRange: [6, 25],
  supports: [1, 2, 4, 6, 9],
  isSolution: true,
  description: 'Compact answer grids packed several per page with their puzzle numbers.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="14" font-size="7" text-anchor="middle" font-family="Georgia">Answers</text>
    ${[0, 1].map((r) => [0, 1].map((c) => `<rect x="${12 + c * 42}" y="${24 + r * 50}" width="36" height="36" fill="none" stroke="#111" stroke-width="0.6"/>${fakeGrid(12 + c * 42, 24 + r * 50, 36, 8, '#777')}<line x1="${14 + c * 42}" y1="${30 + r * 50}" x2="${44 + c * 42}" y2="${44 + r * 50}" stroke="#d64550" stroke-width="1"/>`).join('')).join('')}`,
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
      ctx.count, 18, 14,
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

export const WS_TEMPLATES: WsTemplate[] = [
  classic,
  kidsBig,
  themed,
  minimal,
  twoUp,
  journal,
  answerKey,
];

export const getWsTemplate = (id: string) =>
  WS_TEMPLATES.find((t) => t.id === id) ?? classic;

/** Templates that suit a grid size and puzzle count. */
export function wsTemplatesFor(gridSize: number, perPage: number) {
  return WS_TEMPLATES.filter(
    (t) =>
      !t.isSolution &&
      gridSize >= t.sizeRange[0] &&
      gridSize <= t.sizeRange[1] &&
      t.supports.includes(perPage),
  );
}
