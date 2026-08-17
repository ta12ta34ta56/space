import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';

/**
 * Handwriting page designs.
 *
 * A template is a *frame*: title, decoration, instructions, and the exact
 * rectangles where practice rows and pictures belong. The generator fills those
 * rectangles, so a worksheet lands correctly inside any design at any trim size.
 *
 * Every element is a plain fabric object, so the user can still edit anything
 * afterwards (CRITICAL RULE #4).
 *
 * ## Image slots
 *
 * Several designs reserve an `imageSlot`. It renders as a dashed placeholder
 * with a hint, and the user drops their own art in. That is the "manual work"
 * half of the module: we lay the page out correctly, they bring the pictures.
 */

export interface HwTemplateContext {
  page: Page;
  pageNumber: number;
  pageCount: number;
  /** the character this page teaches, e.g. 'A' or 'A a' */
  title: string;
  /** the bare character, for word prompts */
  char: string;
  /** practice rows requested */
  rows: number;
  font: string;
  kdpSafe: boolean;
  folio?: number;
  ink: string;
  accent: string;
  /** an example word, e.g. "Apple" */
  word?: string;
  /**
   * The finished sentence, e.g. "A is for Apple".
   *
   * Built by `phraseFor()` rather than here, because X is a special case:
   * nothing a child knows starts with X, so it reads "Box ends with X".
   * Templates must not re-derive this or that correction is lost.
   */
  phrase?: string;
}

export interface HwRowSlot {
  left: number;
  top: number;
  width: number;
  /** ascender→descender height of the letters in this row */
  height: number;
}

export interface HwImageSlot {
  left: number;
  top: number;
  width: number;
  height: number;
  hint: string;
}

export interface HwTemplateResult {
  chrome: fabric.FabricObject[];
  rows: HwRowSlot[];
  /** where the user can drop their own artwork */
  imageSlots: HwImageSlot[];
  /** a big display letter, when the design has one */
  heroLetter?: { left: number; top: number; height: number };
  /**
   * Shaded left-hand column of an alphabet grid: the generator writes the
   * letter label into each row.
   */
  labelColumn?: {
    left: number; width: number; top: number; rowHeight: number; rows: number;
  };
  /** Two-column matching exercise; the generator fills both sides. */
  matchColumns?: { left: number; top: number; width: number; height: number };
}

export interface HwTemplate {
  id: string;
  name: string;
  audience: 'toddler' | 'preschool' | 'school' | 'minimal';
  accessLevel: 'free' | 'ad_unlock' | 'premium_only';
  description: string;
  /** SVG preview, viewBox 0 0 100 141 */
  preview: string;
  build: (ctx: HwTemplateContext) => HwTemplateResult;
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

export function area(ctx: HwTemplateContext) {
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

/** A dashed box the user drops their own picture into. */
function imagePlaceholder(s: HwImageSlot, font: string): fabric.FabricObject[] {
  return [
    rect({
      left: s.left, top: s.top, width: s.width, height: s.height,
      fill: null, stroke: '#c7ced8', strokeWidth: 1, strokeDashArray: [6, 5],
      rx: 8, ry: 8,
    }),
    text(s.hint, {
      left: s.left, top: s.top + s.height / 2 - 8, width: s.width,
      fontSize: 9, fontFamily: font, fill: '#a4adbb', textAlign: 'center',
      fontStyle: 'italic',
    }),
  ];
}

/** Evenly stack `n` rows in a box, returning their slots. */
function stackRows(
  box: { left: number; top: number; width: number; height: number },
  n: number,
  gapRatio = 0.34,
): HwRowSlot[] {
  if (n <= 0) return [];
  // height = n*h + (n-1)*gap, gap = h*gapRatio
  const h = box.height / (n + (n - 1) * gapRatio);
  const gap = h * gapRatio;
  return Array.from({ length: n }, (_, i) => ({
    left: box.left,
    top: box.top + i * (h + gap),
    width: box.width,
    height: h,
  }));
}

const folioOf = (ctx: HwTemplateContext, a: ReturnType<typeof area>) =>
  ctx.folio === undefined ? [] : [
    text(String(ctx.folio), {
      left: a.left, top: a.top + a.height - 12, width: a.width,
      fontSize: 9.5, fontFamily: ctx.font, fill: '#9aa4b5', textAlign: 'center',
    }),
  ];

// ------------------------------------------------------------ 1. classic

const classic: HwTemplate = {
  id: 'classic',
  name: 'Classic practice',
  audience: 'school',
  accessLevel: 'free',
  description: 'Clean ruled rows with the letter at the top. Works for any age.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="20" font-size="15" font-family="serif" fill="#333">Aa</text>
    <line x1="10" y1="30" x2="90" y2="30" stroke="#ddd"/>
    ${[42, 66, 90, 114].map((y) => `
      <line x1="10" y1="${y - 8}" x2="90" y2="${y - 8}" stroke="#e5e5e5"/>
      <line x1="10" y1="${y - 4}" x2="90" y2="${y - 4}" stroke="#eee" stroke-dasharray="2 2"/>
      <line x1="10" y1="${y}" x2="90" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text(ctx.title, {
      left: a.left, top: a.top, width: a.width * 0.5,
      fontSize: 34, fontFamily: ctx.font, fill: ctx.ink, fontWeight: '700',
    }));
    chrome.push(text('Trace the letters, then write your own.', {
      left: a.left + a.width * 0.5, top: a.top + 16, width: a.width * 0.5,
      fontSize: 10, fontFamily: ctx.font, fill: '#7c8697', textAlign: 'right',
    }));
    chrome.push(line(a.left, a.top + 46, a.left + a.width, a.top + 46, '#dde2ea', 1));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + 62;
    const footH = ctx.folio !== undefined ? 24 : 6;
    return {
      chrome,
      rows: stackRows(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        ctx.rows,
      ),
      imageSlots: [],
    };
  },
};

// ------------------------------------------------- 2. picture word (A is for)

const pictureWord: HwTemplate = {
  id: 'picture-word',
  name: 'A is for Apple',
  audience: 'preschool',
  accessLevel: 'free',
  description: 'Big letter, a picture box for your own art, and the word to trace.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="8" y="34" font-size="30" font-family="serif" fill="#444">A</text>
    <rect x="42" y="10" width="48" height="34" rx="4" fill="none" stroke="#ccc" stroke-dasharray="3 2"/>
    <text x="8" y="52" font-size="9" fill="#888">A is for Apple</text>
    ${[72, 96, 120].map((y) => `
      <line x1="8" y1="${y - 8}" x2="92" y2="${y - 8}" stroke="#e5e5e5"/>
      <line x1="8" y1="${y - 4}" x2="92" y2="${y - 4}" stroke="#eee" stroke-dasharray="2 2"/>
      <line x1="8" y1="${y}" x2="92" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    const heroH = Math.min(a.height * 0.20, 130);

    chrome.push(text(ctx.title, {
      left: a.left, top: a.top, width: a.width * 0.42,
      fontSize: heroH * 0.72, fontFamily: ctx.font, fill: ctx.ink, fontWeight: '700',
    }));

    const slot: HwImageSlot = {
      left: a.left + a.width * 0.46,
      top: a.top,
      width: a.width * 0.54,
      height: heroH,
      hint: 'drop a picture here',
    };
    chrome.push(...imagePlaceholder(slot, ctx.font));

    const wordY = a.top + heroH + 10;
    chrome.push(text(
      ctx.phrase ?? (ctx.word ? `${ctx.char} is for ${ctx.word}` : `${ctx.char} is for _______`),
      {
        left: a.left, top: wordY, width: a.width,
        fontSize: 15, fontFamily: ctx.font, fill: '#5b6472',
      },
    ));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = wordY + 30;
    const footH = ctx.folio !== undefined ? 24 : 6;
    return {
      chrome,
      rows: stackRows(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        ctx.rows,
      ),
      imageSlots: [slot],
    };
  },
};

// ---------------------------------------------------- 3. colour the letter

const colourLetter: HwTemplate = {
  id: 'colour-letter',
  name: 'Colour the letter',
  audience: 'toddler',
  accessLevel: 'free',
  description: 'A giant hollow letter to colour in, with two practice rows below.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="72" font-size="76" font-family="serif" fill="none"
      stroke="#bbb" stroke-width="1.5" text-anchor="middle">A</text>
    <text x="50" y="14" font-size="8" fill="#999" text-anchor="middle">Colour me in!</text>
    ${[108, 130].map((y) => `
      <line x1="10" y1="${y - 7}" x2="90" y2="${y - 7}" stroke="#eee"/>
      <line x1="10" y1="${y}" x2="90" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text('Colour me in, then trace!', {
      left: a.left, top: a.top, width: a.width,
      fontSize: 13, fontFamily: ctx.font, fill: ctx.accent,
      textAlign: 'center', fontWeight: '600',
    }));

    // The hero letter is drawn by the renderer as an outline the child fills.
    const heroH = a.height * 0.44;
    const heroTop = a.top + 26;
    chrome.push(...folioOf(ctx, a));

    const bodyTop = heroTop + heroH + 26;
    const footH = ctx.folio !== undefined ? 24 : 6;
    const rowCount = Math.min(ctx.rows, 2);

    return {
      chrome,
      heroLetter: { left: a.left, top: heroTop, height: heroH },
      rows: stackRows(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        rowCount,
      ),
      imageSlots: [],
    };
  },
};

// -------------------------------------------------------- 4. find the letter

const findLetter: HwTemplate = {
  id: 'find-letter',
  name: 'Find and circle',
  audience: 'preschool',
  accessLevel: 'free',
  description: 'A grid of mixed letters to hunt through, then practice rows.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="12" font-size="7" fill="#999" text-anchor="middle">Circle every A</text>
    <rect x="10" y="18" width="80" height="46" fill="none" stroke="#e0e0e0"/>
    ${Array.from({ length: 4 }, (_, r) => Array.from({ length: 7 }, (_, c) =>
      `<text x="${16 + c * 11}" y="${29 + r * 11}" font-size="8" fill="#777">${'ABKAMDA'[(r * 3 + c) % 7]}</text>`).join('')).join('')}
    ${[86, 108, 130].map((y) => `
      <line x1="10" y1="${y - 7}" x2="90" y2="${y - 7}" stroke="#eee"/>
      <line x1="10" y1="${y}" x2="90" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text(`Circle every  ${ctx.char}`, {
      left: a.left, top: a.top, width: a.width,
      fontSize: 13, fontFamily: ctx.font, fill: ctx.ink,
      textAlign: 'center', fontWeight: '600',
    }));

    // Hunt grid — a light box the generator fills with mixed letters.
    const gridTop = a.top + 24;
    const gridH = a.height * 0.24;
    chrome.push(rect({
      left: a.left, top: gridTop, width: a.width, height: gridH,
      fill: null, stroke: '#e2e6ec', strokeWidth: 1, rx: 6, ry: 6,
    }));

    chrome.push(...folioOf(ctx, a));
    const bodyTop = gridTop + gridH + 22;
    const footH = ctx.folio !== undefined ? 24 : 6;

    return {
      chrome,
      rows: stackRows(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        ctx.rows,
      ),
      imageSlots: [{
        left: a.left, top: gridTop, width: a.width, height: gridH,
        hint: '',
      }],
    };
  },
};

// ------------------------------------------------------------ 5. rainbow

const rainbow: HwTemplate = {
  id: 'rainbow-write',
  name: 'Rainbow writing',
  audience: 'toddler',
  accessLevel: 'free',
  description: 'Trace the same letter three times in three colours. Builds muscle memory.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="13" font-size="7" fill="#999" text-anchor="middle">Trace 3 times!</text>
    ${['#e46a6a', '#e0a44a', '#4a9de0'].map((c, i) => `
      <circle cx="14" cy="${34 + i * 34}" r="4" fill="${c}"/>
      <text x="26" y="${40 + i * 34}" font-size="20" fill="none" stroke="${c}"
        stroke-dasharray="2 2" font-family="serif">A A A</text>
      <line x1="10" y1="${44 + i * 34}" x2="90" y2="${44 + i * 34}" stroke="#ddd"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text('Trace with a different colour each time', {
      left: a.left, top: a.top, width: a.width,
      fontSize: 11.5, fontFamily: ctx.font, fill: ctx.accent, textAlign: 'center',
    }));

    const bodyTop = a.top + 24;
    const footH = ctx.folio !== undefined ? 24 : 6;
    const rows = stackRows(
      { left: a.left + 26, top: bodyTop, width: a.width - 26, height: a.height - (bodyTop - a.top) - footH },
      Math.min(ctx.rows, 3),
      0.5,
    );

    // A colour dot marks each row, telling the child which crayon to pick up.
    const dots = ['#e46a6a', '#e0a44a', '#4a9de0', '#5fb87a', '#9b7fd4'];
    rows.forEach((r, i) => {
      chrome.push(new fabric.Circle({
        left: a.left + 8, top: r.top + r.height * 0.5,
        radius: 6, fill: dots[i % dots.length],
        originX: 'center', originY: 'center', objectCaching: false,
      }));
    });

    chrome.push(...folioOf(ctx, a));
    return { chrome, rows, imageSlots: [] };
  },
};

// --------------------------------------------------------- 6. word practice

const wordPractice: HwTemplate = {
  id: 'word-practice',
  name: 'Word practice',
  audience: 'school',
  accessLevel: 'free',
  description: 'Trace a whole word instead of a single letter. Good for names.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="18" font-size="12" font-family="serif" fill="#444">Apple</text>
    <line x1="10" y1="24" x2="90" y2="24" stroke="#ddd"/>
    ${[46, 70, 94, 118].map((y) => `
      <line x1="10" y1="${y - 8}" x2="90" y2="${y - 8}" stroke="#e8e8e8"/>
      <line x1="10" y1="${y - 4}" x2="90" y2="${y - 4}" stroke="#f0f0f0" stroke-dasharray="2 2"/>
      <line x1="10" y1="${y}" x2="90" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text(ctx.word ?? ctx.title, {
      left: a.left, top: a.top, width: a.width * 0.7,
      fontSize: 24, fontFamily: ctx.font, fill: ctx.ink, fontWeight: '600',
    }));
    chrome.push(line(a.left, a.top + 38, a.left + a.width, a.top + 38, '#dde2ea', 1));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + 54;
    const footH = ctx.folio !== undefined ? 24 : 6;
    return {
      chrome,
      rows: stackRows(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        ctx.rows,
      ),
      imageSlots: [],
    };
  },
};

// --------------------------------------------------- 7. count and trace

const countTrace: HwTemplate = {
  id: 'count-trace',
  name: 'Count and trace',
  audience: 'preschool',
  accessLevel: 'free',
  description: 'For numbers: trace the digit, then count the objects and colour them.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="12" y="34" font-size="28" font-family="serif" fill="#444">3</text>
    ${Array.from({ length: 3 }, (_, i) =>
      `<circle cx="${48 + i * 16}" cy="24" r="6" fill="none" stroke="#ccc"/>`).join('')}
    <text x="50" y="50" font-size="7" fill="#999" text-anchor="middle">colour 3 circles</text>
    ${[76, 100, 124].map((y) => `
      <line x1="10" y1="${y - 8}" x2="90" y2="${y - 8}" stroke="#eee"/>
      <line x1="10" y1="${y}" x2="90" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];
    const n = Number(ctx.char);
    const heroH = Math.min(a.height * 0.16, 110);

    chrome.push(text(ctx.title, {
      left: a.left, top: a.top, width: a.width * 0.24,
      fontSize: heroH * 0.8, fontFamily: ctx.font, fill: ctx.ink, fontWeight: '700',
    }));

    // Counting objects — only when the character really is a digit.
    if (Number.isFinite(n) && n > 0 && n <= 10) {
      const r = Math.min(15, (a.width * 0.7) / (n * 2.6));
      const startX = a.left + a.width * 0.30;
      for (let i = 0; i < n; i++) {
        chrome.push(new fabric.Circle({
          left: startX + i * r * 2.6, top: a.top + heroH * 0.42,
          radius: r, fill: null, stroke: '#c3cad6', strokeWidth: 1.4,
          originX: 'center', originY: 'center', objectCaching: false,
        }));
      }
      chrome.push(text(`Colour ${n} circle${n === 1 ? '' : 's'}`, {
        left: a.left + a.width * 0.28, top: a.top + heroH * 0.92, width: a.width * 0.72,
        fontSize: 10, fontFamily: ctx.font, fill: '#8a93a3', fontStyle: 'italic',
      }));
    }

    chrome.push(...folioOf(ctx, a));
    const bodyTop = a.top + heroH + 34;
    const footH = ctx.folio !== undefined ? 24 : 6;
    return {
      chrome,
      rows: stackRows(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        ctx.rows,
      ),
      imageSlots: [],
    };
  },
};

// ------------------------------------------------------------ 8. minimal

const minimal: HwTemplate = {
  id: 'minimal',
  name: 'Minimal',
  audience: 'minimal',
  accessLevel: 'free',
  description: 'Nothing but rows. Maximum practice per page, no ink wasted.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    ${[24, 46, 68, 90, 112, 132].map((y) => `
      <line x1="8" y1="${y - 7}" x2="92" y2="${y - 7}" stroke="#eee"/>
      <line x1="8" y1="${y - 3.5}" x2="92" y2="${y - 3.5}" stroke="#f2f2f2" stroke-dasharray="2 2"/>
      <line x1="8" y1="${y}" x2="92" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [...folioOf(ctx, a)];
    const footH = ctx.folio !== undefined ? 20 : 0;
    return {
      chrome,
      rows: stackRows(
        { left: a.left, top: a.top, width: a.width, height: a.height - footH },
        ctx.rows,
        0.28,
      ),
      imageSlots: [],
    };
  },
};

// ------------------------------------------------------- 9. dotted journal

const journalCard: HwTemplate = {
  id: 'journal-card',
  name: 'Framed card',
  audience: 'school',
  accessLevel: 'ad_unlock',
  description: 'A soft rounded frame with a name and date line. Looks like a keepsake.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <rect x="6" y="6" width="88" height="129" rx="7" fill="none" stroke="#d8cfc0"/>
    <text x="14" y="20" font-size="6" fill="#a99" >Name ________</text>
    <text x="50" y="40" font-size="20" font-family="serif" fill="#555" text-anchor="middle">Aa</text>
    ${[64, 88, 112].map((y) => `
      <line x1="14" y1="${y - 7}" x2="86" y2="${y - 7}" stroke="#eee"/>
      <line x1="14" y1="${y}" x2="86" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(rect({
      left: a.left, top: a.top, width: a.width, height: a.height,
      fill: null, stroke: '#d8cfc0', strokeWidth: 1.2, rx: 12, ry: 12,
    }));

    const pad = 20;
    chrome.push(text('Name', {
      left: a.left + pad, top: a.top + pad, width: 40,
      fontSize: 10, fontFamily: ctx.font, fill: '#a08d78',
    }));
    chrome.push(line(a.left + pad + 34, a.top + pad + 12,
      a.left + a.width * 0.55, a.top + pad + 12, '#d8cfc0', 0.9));
    chrome.push(text('Date', {
      left: a.left + a.width * 0.62, top: a.top + pad, width: 34,
      fontSize: 10, fontFamily: ctx.font, fill: '#a08d78',
    }));
    chrome.push(line(a.left + a.width * 0.62 + 30, a.top + pad + 12,
      a.left + a.width - pad, a.top + pad + 12, '#d8cfc0', 0.9));

    chrome.push(text(ctx.title, {
      left: a.left, top: a.top + pad + 26, width: a.width,
      fontSize: 30, fontFamily: ctx.font, fill: ctx.ink,
      textAlign: 'center', fontWeight: '600',
    }));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + pad + 78;
    const footH = 30;
    return {
      chrome,
      rows: stackRows(
        { left: a.left + pad, top: bodyTop, width: a.width - pad * 2,
          height: a.height - (bodyTop - a.top) - footH },
        ctx.rows,
      ),
      imageSlots: [],
    };
  },
};

// --------------------------------------------------- 10. draw it yourself

const drawIt: HwTemplate = {
  id: 'draw-it',
  name: 'Draw it yourself',
  audience: 'preschool',
  accessLevel: 'free',
  description: 'Two practice rows and a big empty box for the child to draw in.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="10" y="18" font-size="14" font-family="serif" fill="#444">Aa</text>
    ${[40, 62].map((y) => `
      <line x1="10" y1="${y - 7}" x2="90" y2="${y - 7}" stroke="#eee"/>
      <line x1="10" y1="${y}" x2="90" y2="${y}" stroke="#ccc"/>`).join('')}
    <rect x="10" y="74" width="80" height="56" rx="5" fill="none" stroke="#ddd" stroke-dasharray="4 3"/>
    <text x="50" y="104" font-size="6" fill="#bbb" text-anchor="middle">draw something starting with A</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text(ctx.title, {
      left: a.left, top: a.top, width: a.width * 0.5,
      fontSize: 26, fontFamily: ctx.font, fill: ctx.ink, fontWeight: '700',
    }));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + 44;
    const rowCount = Math.min(ctx.rows, 2);
    const rowsBoxH = a.height * 0.30;
    const rows = stackRows(
      { left: a.left, top: bodyTop, width: a.width, height: rowsBoxH }, rowCount);

    const boxTop = bodyTop + rowsBoxH + 22;
    const footH = ctx.folio !== undefined ? 24 : 6;
    const slot: HwImageSlot = {
      left: a.left, top: boxTop,
      width: a.width,
      height: a.height - (boxTop - a.top) - footH,
      hint: `Draw something that starts with ${ctx.char}`,
    };
    chrome.push(...imagePlaceholder(slot, ctx.font));

    return { chrome, rows, imageSlots: [slot] };
  },
};

// --------------------------------------------------------- 11. big and bold

const bigBold: HwTemplate = {
  id: 'big-bold',
  name: 'Big and bold',
  audience: 'toddler',
  accessLevel: 'free',
  description: 'Only two enormous rows. For the youngest hands and thickest crayons.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    ${[54, 118].map((y) => `
      <line x1="8" y1="${y - 38}" x2="92" y2="${y - 38}" stroke="#eee"/>
      <line x1="8" y1="${y - 19}" x2="92" y2="${y - 19}" stroke="#f0f0f0" stroke-dasharray="3 3"/>
      <line x1="8" y1="${y}" x2="92" y2="${y}" stroke="#bbb" stroke-width="1.4"/>`).join('')}
    <text x="14" y="50" font-size="34" font-family="serif" fill="none" stroke="#ddd" stroke-dasharray="2 2">A</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [...folioOf(ctx, a)];
    const footH = ctx.folio !== undefined ? 22 : 0;
    return {
      chrome,
      rows: stackRows(
        { left: a.left, top: a.top + 6, width: a.width, height: a.height - footH - 6 },
        Math.min(ctx.rows, 2),
        0.30,
      ),
      imageSlots: [],
    };
  },
};

// ------------------------------------------------------- 12. dot to dot

const dotToDot: HwTemplate = {
  id: 'dot-to-dot',
  name: 'Dot to dot letter',
  audience: 'preschool',
  accessLevel: 'premium_only',
  description: 'A numbered dot-to-dot version of the letter, then practice rows.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="12" font-size="7" fill="#999" text-anchor="middle">Join the dots</text>
    ${[[30, 60], [50, 22], [70, 60], [38, 46], [62, 46]].map(([x, y], i) => `
      <circle cx="${x}" cy="${y}" r="1.8" fill="#888"/>
      <text x="${x + 3}" y="${y - 2}" font-size="5" fill="#aaa">${i + 1}</text>`).join('')}
    ${[86, 110, 130].map((y) => `
      <line x1="10" y1="${y - 7}" x2="90" y2="${y - 7}" stroke="#eee"/>
      <line x1="10" y1="${y}" x2="90" y2="${y}" stroke="#ccc"/>`).join('')}`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text('Join the dots in order, then trace', {
      left: a.left, top: a.top, width: a.width,
      fontSize: 11.5, fontFamily: ctx.font, fill: ctx.accent, textAlign: 'center',
    }));
    chrome.push(...folioOf(ctx, a));

    const heroH = a.height * 0.34;
    const heroTop = a.top + 26;
    const bodyTop = heroTop + heroH + 24;
    const footH = ctx.folio !== undefined ? 24 : 6;

    return {
      chrome,
      heroLetter: { left: a.left, top: heroTop, height: heroH },
      rows: stackRows(
        { left: a.left, top: bodyTop, width: a.width, height: a.height - (bodyTop - a.top) - footH },
        Math.min(ctx.rows, 3),
      ),
      imageSlots: [],
    };
  },
};


// ------------------------------------------------- 13. full alphabet grid
//
// Modelled on the classic Korean/Japanese worksheet layout the user shared:
// every letter is a ROW, with a shaded label cell on the left and repeated
// traceable cells across. One page covers half the alphabet.

const alphabetGrid: HwTemplate = {
  id: 'alphabet-grid',
  name: 'Alphabet grid',
  audience: 'school',
  accessLevel: 'free',
  description: 'Every letter on its own row in a ruled grid. Half the alphabet per page.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <rect x="6" y="14" width="88" height="120" fill="none" stroke="#bbb"/>
    ${Array.from({ length: 8 }, (_, r) => `
      <rect x="6" y="${14 + r * 15}" width="18" height="15" fill="#e6f4d7" stroke="#bbb"/>
      <text x="9" y="${25 + r * 15}" font-size="8" fill="#333">${'ABCDEFGH'[r]}</text>
      ${[24, 41, 58, 75].map((x) => `
        <rect x="${x}" y="${14 + r * 15}" width="17" height="15" fill="none" stroke="#ddd"/>
        <text x="${x + 4}" y="${25 + r * 15}" font-size="8" fill="#ccc">${'ABCDEFGH'[r]}</text>`).join('')}`).join('')}
    <text x="8" y="10" font-size="6" fill="#666">Alphabet writing</text>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text(ctx.title || 'Alphabet writing', {
      left: a.left, top: a.top, width: a.width * 0.6,
      fontSize: 17, fontFamily: ctx.font, fill: ctx.ink, fontWeight: '700',
    }));
    chrome.push(text('Say each letter out loud as you write it.', {
      left: a.left, top: a.top + 22, width: a.width,
      fontSize: 9.5, fontFamily: ctx.font, fill: '#8a93a3',
    }));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + 40;
    const footH = ctx.folio !== undefined ? 22 : 4;
    const bodyH = a.height - (bodyTop - a.top) - footH;

    // The grid frame. Rows are returned as slots; the generator fills them.
    chrome.push(rect({
      left: a.left, top: bodyTop, width: a.width, height: bodyH,
      fill: null, stroke: '#b6bdc8', strokeWidth: 1.1,
    }));

    const n = Math.max(6, Math.min(13, ctx.rows));
    const rh = bodyH / n;
    const labelW = a.width * 0.16;

    for (let i = 0; i <= n; i++) {
      chrome.push(line(a.left, bodyTop + i * rh, a.left + a.width, bodyTop + i * rh,
        '#c7ced8', 0.8));
    }
    // shaded label column, as in the reference sheet
    chrome.push(rect({
      left: a.left, top: bodyTop, width: labelW, height: bodyH,
      fill: '#eaf5dc', stroke: '#b6bdc8', strokeWidth: 1,
    }));
    const cols = 5;
    const cellW = (a.width - labelW) / cols;
    for (let c = 1; c < cols; c++) {
      chrome.push(line(a.left + labelW + c * cellW, bodyTop,
        a.left + labelW + c * cellW, bodyTop + bodyH, '#e2e6ec', 0.7));
    }

    // One slot per row, inset to sit inside the cells.
    const rows: HwRowSlot[] = Array.from({ length: n }, (_, i) => ({
      left: a.left + labelW + cellW * 0.12,
      top: bodyTop + i * rh + rh * 0.12,
      width: a.width - labelW - cellW * 0.2,
      height: rh * 0.76,
    }));

    return { chrome, rows, imageSlots: [], labelColumn: { left: a.left, width: labelW, top: bodyTop, rowHeight: rh, rows: n } };
  },
};

// ------------------------------------------------------ 14. match the case

const matchCase: HwTemplate = {
  id: 'match-case',
  name: 'Match capital & small',
  audience: 'preschool',
  accessLevel: 'free',
  description: 'Two columns of letters to join with a pencil line. No tracing.',
  preview: `<rect width="100" height="141" fill="#fff"/>
    <text x="50" y="12" font-size="7" fill="#333" text-anchor="middle">MATCH THE LETTERS</text>
    ${Array.from({ length: 8 }, (_, r) => `
      <rect x="14" y="${18 + r * 14}" width="13" height="11" fill="none" stroke="#333"/>
      <text x="18" y="${27 + r * 14}" font-size="7" fill="#333">${'ABCDEFGH'[r]}</text>
      <rect x="60" y="${18 + r * 14}" width="13" height="11" fill="none" stroke="#333"/>
      <text x="64" y="${27 + r * 14}" font-size="7" fill="#333">${'dbfaechg'[r]}</text>`).join('')}
    <line x1="28" y1="24" x2="59" y2="52" stroke="#333" stroke-width="0.8"/>`,
  build: (ctx) => {
    const a = area(ctx);
    const chrome: fabric.FabricObject[] = [];

    chrome.push(text('Match the capital and small letters', {
      left: a.left, top: a.top, width: a.width,
      fontSize: 14, fontFamily: ctx.font, fill: ctx.ink,
      textAlign: 'center', fontWeight: '700',
    }));
    chrome.push(text('Draw a line from each big letter to its small partner.', {
      left: a.left, top: a.top + 22, width: a.width,
      fontSize: 9.5, fontFamily: ctx.font, fill: '#8a93a3', textAlign: 'center',
    }));
    chrome.push(...folioOf(ctx, a));

    const bodyTop = a.top + 46;
    const footH = ctx.folio !== undefined ? 22 : 4;
    const bodyH = a.height - (bodyTop - a.top) - footH;

    // No practice rows — this design is a matching exercise. The generator
    // fills the two columns from `matchColumns`.
    return {
      chrome,
      rows: [],
      imageSlots: [],
      matchColumns: {
        left: a.left, top: bodyTop, width: a.width, height: bodyH,
      },
    };
  },
};

// ------------------------------------------------------------------ registry

export const HW_TEMPLATES: HwTemplate[] = [
  classic,
  alphabetGrid,
  matchCase,
  pictureWord,
  colourLetter,
  findLetter,
  rainbow,
  wordPractice,
  countTrace,
  drawIt,
  bigBold,
  journalCard,
  dotToDot,
  minimal,
];

export const getHwTemplate = (id: string) =>
  HW_TEMPLATES.find((t) => t.id === id) ?? classic;

/** Designs that suit a given character set. */
/** Designs that cover the whole alphabet on one page, not one letter per page. */
export const WHOLE_ALPHABET_DESIGNS = ['alphabet-grid', 'match-case'];

export function hwTemplatesFor(charset: string) {
  if (charset === 'numbers') {
    // "A is for Apple" and "starts with A" make no sense for a digit.
    return HW_TEMPLATES.filter((t) => !['picture-word', 'draw-it'].includes(t.id));
  }
  return HW_TEMPLATES.filter((t) => t.id !== 'count-trace');
}
