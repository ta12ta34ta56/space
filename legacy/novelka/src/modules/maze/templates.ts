import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';
import type { MazeSlot } from './renderer';

/**
 * Maze page designs.
 *
 * A template is a *frame*: title, decoration, instructions, and the exact
 * squares where mazes belong. The generator fills those squares, so a maze
 * lands correctly inside any design at any trim size.
 *
 * Every element is a plain fabric object, so the user can still edit anything
 * afterwards (CRITICAL RULE #4).
 */

export interface MzTemplateContext {
  page: Page;
  pageNumber: number;
  pageCount: number;
  /** mazes to place on this page */
  count: number;
  font: string;
  kdpSafe: boolean;
  title: string;
  /** "Maze 7 · Hard" for the first maze on the page */
  subtitle?: string;
  difficulty?: string;
  folio?: number;
  ink: string;
  accent: string;
}

export interface MzTemplateResult {
  chrome: fabric.FabricObject[];
  slots: MazeSlot[];
}

export interface MzTemplate {
  id: string;
  name: string;
  audience: 'kids' | 'classic' | 'advanced' | 'minimal';
  accessLevel: 'free' | 'ad_unlock' | 'premium_only';
  /** how many mazes the design hosts per page */
  supports: number[];
  description: string;
  /** SVG preview, viewBox 0 0 100 141 */
  preview: string;
  build: (ctx: MzTemplateContext) => MzTemplateResult;
}

// ----------------------------------------------------------------- helpers

const text = (t: string, o: Partial<fabric.TextboxProps>) =>
  new fabric.Textbox(t, { fontFamily: 'Inter', objectCaching: false, ...o });

const rect = (o: Partial<fabric.RectProps>) =>
  new fabric.Rect({ objectCaching: false, ...o });

const line = (
  x1: number, y1: number, x2: number, y2: number,
  stroke: string, w = 1, dash?: number[],
) => new fabric.Line([x1, y1, x2, y2], {
  stroke, strokeWidth: w, strokeDashArray: dash,
  strokeLineCap: 'round', objectCaching: false,
});

export function area(ctx: MzTemplateContext) {
  if (ctx.kdpSafe) {
    const m = kdpMarginsFor(Math.max(ctx.pageCount, 24));
    return safeAreaFor(ctx.page.width, ctx.page.height, ctx.pageNumber, m);
  }
  const m = 54;
  return {
    left: m, top: m,
    width: ctx.page.width - m * 2,
    height: ctx.page.height - m * 2,
    isRecto: ctx.pageNumber % 2 === 1,
  };
}

/**
 * Fit `count` SQUARES into a box.
 *
 * A maze must stay square or the cells distort, so the layout picks the column
 * count that maximises square size rather than filling the box edge to edge.
 */
function squareSlots(
  box: { left: number; top: number; width: number; height: number },
  count: number,
  gap: number,
  captionH: number,
): MazeSlot[] {
  let best = { cols: 1, rows: count, size: 0 };
  for (let cols = 1; cols <= count; cols++) {
    const rows = Math.ceil(count / cols);
    const w = (box.width - gap * (cols - 1)) / cols;
    const h = (box.height - gap * (rows - 1)) / rows - captionH;
    const size = Math.min(w, h);
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

const folioOf = (ctx: MzTemplateContext, a: ReturnType<typeof area>) =>
  ctx.folio === undefined ? [] : [
    text(String(ctx.folio), {
      left: a.left, top: a.top + a.height - 12, width: a.width,
      fontSize: 9.5, fontFamily: ctx.font, fill: '#9aa4b5', textAlign: 'center',
    }),
  ];

const mazePreview = (x: number, y: number, w: number, h: number) => {
  // A rough lattice, enough to read as "a maze" in a 100x141 thumbnail.
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#111827" stroke-width="1"/>`;
  const n = 6;
  for (let i = 1; i < n; i++) {
    const gx = x + (w / n) * i;
    const gy = y + (h / n) * i;
    s += `<line x1="${gx}" y1="${y + (h / n) * ((i * 3) % n)}" x2="${gx}" y2="${y + (h / n) * (((i * 3) % n) + 2)}" stroke="#111827" stroke-width="0.7"/>`;
    s += `<line x1="${x + (w / n) * ((i * 2) % n)}" y1="${gy}" x2="${x + (w / n) * (((i * 2) % n) + 2)}" y2="${gy}" stroke="#111827" stroke-width="0.7"/>`;
  }
  return s;
};

// ------------------------------------------------------------- 1. classic

const classic: MzTemplate = {
  id: 'classic',
  name: 'Classic',
  audience: 'classic',
  accessLevel: 'free',
  supports: [1],
  description: 'One large maze with a title and difficulty line. The default.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="16" font-size="9" fill="#333">Maze 1</text>
    <text x="72" y="16" font-size="6" fill="#888">Medium</text>
    <line x1="10" y1="20" x2="90" y2="20" stroke="#ddd"/>
    ${mazePreview(12, 28, 76, 76)}
    <text x="50" y="120" font-size="5" fill="#999" text-anchor="middle">Find your way from start to finish</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text(ctx.subtitle ?? ctx.title, {
      left: a.left, top: a.top, width: a.width * 0.6,
      fontSize: 20, fontFamily: ctx.font, fill: ctx.ink, fontWeight: '700',
    }));
    if (ctx.difficulty) {
      chrome.push(text(ctx.difficulty, {
        left: a.left + a.width * 0.6, top: a.top + 6, width: a.width * 0.4,
        fontSize: 11, fontFamily: ctx.font, fill: '#7c8697', textAlign: 'right',
      }));
    }
    chrome.push(line(a.left, a.top + 30, a.left + a.width, a.top + 30, '#dde2ea', 1));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + 44;
    const footH = ctx.folio !== undefined ? 30 : 10;
    return {
      chrome,
      slots: squareSlots(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        1, 18, 0,
      ),
    };
  },
};

// --------------------------------------------------------------- 2. two-up

const twoUp: MzTemplate = {
  id: 'two-up',
  name: 'Two per page',
  audience: 'classic',
  accessLevel: 'free',
  supports: [2],
  description: 'Two mazes stacked, each with its own number. Good value per page.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="12" font-size="6" fill="#333">Maze 1</text>
    ${mazePreview(18, 16, 64, 50)}
    <text x="10" y="82" font-size="6" fill="#333">Maze 2</text>
    ${mazePreview(18, 86, 64, 50)}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [...folioOf(ctx, a)];
    const footH = ctx.folio !== undefined ? 24 : 4;
    return {
      chrome,
      slots: squareSlots(
        { left: a.left, top: a.top, width: a.width, height: a.height - footH },
        2, 22, 18,
      ),
    };
  },
};

// -------------------------------------------------------------- 3. four-up

const fourUp: MzTemplate = {
  id: 'four-up',
  name: 'Four per page',
  audience: 'classic',
  accessLevel: 'free',
  supports: [4],
  description: 'A 2x2 grid of small mazes. Best for quick puzzles and travel books.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    ${[0, 1].flatMap((r) => [0, 1].map((c) =>
      `<text x="${10 + c * 44}" y="${18 + r * 62}" font-size="5" fill="#333">Maze ${r * 2 + c + 1}</text>`
      + mazePreview(10 + c * 44, 22 + r * 62, 38, 38))).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [...folioOf(ctx, a)];
    const footH = ctx.folio !== undefined ? 24 : 4;
    return {
      chrome,
      slots: squareSlots(
        { left: a.left, top: a.top, width: a.width, height: a.height - footH },
        4, 20, 15,
      ),
    };
  },
};

// ------------------------------------------------------------ 4. kids big

const kidsBig: MzTemplate = {
  id: 'kids-big',
  name: 'Kids — big & bold',
  audience: 'kids',
  accessLevel: 'free',
  supports: [1],
  description: 'A huge maze with thick walls and a friendly instruction line.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="16" font-size="10" fill="#2b7fb8" text-anchor="middle" font-weight="bold">Help the mouse!</text>
    ${mazePreview(8, 26, 84, 84)}
    <circle cx="14" cy="32" r="3" fill="#16a34a"/>
    <circle cx="86" cy="104" r="3" fill="#e11d48"/>
    <text x="50" y="126" font-size="6" fill="#888" text-anchor="middle">Start at the green dot</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text(ctx.title || 'Find the way out!', {
      left: a.left, top: a.top, width: a.width,
      fontSize: 20, fontFamily: ctx.font, fill: ctx.accent,
      textAlign: 'center', fontWeight: '700',
    }));
    chrome.push(text('Start at the green dot and follow the path to the red dot.', {
      left: a.left, top: a.top + 28, width: a.width,
      fontSize: 10.5, fontFamily: ctx.font, fill: '#8a93a3', textAlign: 'center',
    }));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + 50;
    const footH = ctx.folio !== undefined ? 28 : 8;
    return {
      chrome,
      slots: squareSlots(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        1, 16, 0,
      ),
    };
  },
};

// --------------------------------------------------------------- 5. framed

const framed: MzTemplate = {
  id: 'framed',
  name: 'Framed card',
  audience: 'classic',
  accessLevel: 'ad_unlock',
  supports: [1],
  description: 'A soft rounded frame with name, date and timer lines. Keepsake feel.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <rect x="6" y="6" width="88" height="129" rx="7" fill="none" stroke="#d8cfc0"/>
    <text x="13" y="18" font-size="5" fill="#a99">Name ______  Time ______</text>
    ${mazePreview(14, 26, 72, 72)}
    <text x="50" y="112" font-size="5" fill="#a99" text-anchor="middle">How fast can you finish?</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    const pad = 18;

    chrome.push(rect({
      left: a.left, top: a.top, width: a.width, height: a.height,
      fill: null, stroke: '#d8cfc0', strokeWidth: 1.2, rx: 12, ry: 12,
    }));
    chrome.push(text('Name', {
      left: a.left + pad, top: a.top + pad, width: 38,
      fontSize: 10, fontFamily: ctx.font, fill: '#a08d78',
    }));
    chrome.push(line(a.left + pad + 32, a.top + pad + 12,
      a.left + a.width * 0.55, a.top + pad + 12, '#d8cfc0', 0.9));
    chrome.push(text('Time', {
      left: a.left + a.width * 0.62, top: a.top + pad, width: 34,
      fontSize: 10, fontFamily: ctx.font, fill: '#a08d78',
    }));
    chrome.push(line(a.left + a.width * 0.62 + 28, a.top + pad + 12,
      a.left + a.width - pad, a.top + pad + 12, '#d8cfc0', 0.9));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + pad + 30;
    const footH = 40;
    return {
      chrome,
      slots: squareSlots(
        { left: a.left + pad, top: bodyTop, width: a.width - pad * 2,
          height: a.height - (bodyTop - a.top) - footH },
        1, 14, 0,
      ),
    };
  },
};

// -------------------------------------------------------------- 6. minimal

const minimal: MzTemplate = {
  id: 'minimal',
  name: 'Minimal',
  audience: 'minimal',
  accessLevel: 'free',
  supports: [1],
  description: 'Just the maze, edge to edge. No ink wasted.',
  preview: `<rect width="100" height="141" fill="#fff"/>${mazePreview(6, 26, 88, 88)}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [...folioOf(ctx, a)];
    const footH = ctx.folio !== undefined ? 20 : 0;
    return {
      chrome,
      slots: squareSlots(
        { left: a.left, top: a.top, width: a.width, height: a.height - footH },
        1, 0, 0,
      ),
    };
  },
};

// ---------------------------------------------------------- 7. answer keys

const answers: MzTemplate = {
  id: 'answers',
  name: 'Answer key',
  audience: 'minimal',
  accessLevel: 'free',
  supports: [4, 6, 9],
  description: 'Small solved mazes packed onto a page for the back of the book.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="14" font-size="7" fill="#333" text-anchor="middle">Answers</text>
    ${[0, 1, 2].flatMap((r) => [0, 1].map((c) =>
      mazePreview(12 + c * 40, 22 + r * 38, 34, 32))).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text(ctx.title || 'Answers', {
      left: a.left, top: a.top, width: a.width,
      fontSize: 16, fontFamily: ctx.font, fill: ctx.ink,
      textAlign: 'center', fontWeight: '700',
    }));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + 30;
    const footH = ctx.folio !== undefined ? 24 : 4;
    return {
      chrome,
      slots: squareSlots(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        ctx.count, 14, 13,
      ),
    };
  },
};

// ------------------------------------------------------------------ registry

export const MZ_TEMPLATES: MzTemplate[] = [
  classic, twoUp, fourUp, kidsBig, framed, minimal, answers,
];

export const getMzTemplate = (id: string) =>
  MZ_TEMPLATES.find((t) => t.id === id) ?? classic;

/** Designs that host a given number of mazes per page. */
export function mzTemplatesFor(perPage: number) {
  return MZ_TEMPLATES.filter((t) => t.id !== 'answers' && t.supports.includes(perPage));
}

/** Maze counts a design can host. */
