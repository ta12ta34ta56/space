import * as fabric from 'fabric';
import { engine } from '../engine/canvas-engine';
import { loadFont } from '../engine/font-manager';
import { kdpMarginsFor, safeAreaFor } from './kdp';
import { IN } from '../types/canvas.types';

/**
 * Templates build plain fabric objects, so everything stays a normal, fully
 * editable canvas element (CRITICAL RULE #4).
 *
 * Interior templates lay themselves out inside the KDP safe area for the
 * current page, so the gutter is respected automatically.
 */

export interface TemplateContext {
  w: number;
  h: number;
  font: string;
  /** 1-based page number — decides which side the gutter is on */
  pageNumber: number;
  /** total pages in the document, drives gutter width */
  pageCount: number;
}

export interface TemplateDef {
  id: string;
  name: string;
  category: 'interior' | 'planner' | 'puzzle' | 'school';
  accessLevel: 'free' | 'ad_unlock' | 'premium_only';
  /** SVG preview markup for the card (viewBox 0 0 100 141) */
  preview: string;
  /** true when the layout should sit inside the KDP safe area */
  kdpSafe?: boolean;
  build: (ctx: TemplateContext) => Promise<fabric.FabricObject[]>;
  description?: string;
}

const INK = '#111827';
const RULE = '#c9d1dc';
const FAINT = '#dfe5ec';

const text = (t: string, o: Partial<fabric.TextboxProps>) =>
  new fabric.Textbox(t, { fontFamily: 'Inter', fill: INK, ...o });

const line = (x1: number, y1: number, x2: number, y2: number, stroke = RULE, w = 1) =>
  new fabric.Line([x1, y1, x2, y2], { stroke, strokeWidth: w, selectable: true });

/** Content box for the current page, honouring the KDP gutter. */
function area(ctx: TemplateContext) {
  const m = kdpMarginsFor(ctx.pageCount);
  return safeAreaFor(ctx.w, ctx.h, ctx.pageNumber, m);
}

// ---------------------------------------------------------------- interiors

const lined: TemplateDef = {
  id: 'lined',
  name: 'Lined pages',
  category: 'interior',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'College-ruled writing lines inside the safe area.',
  preview: `<rect width="100" height="141" fill="#fff"/>${Array.from(
    { length: 16 },
    (_, i) => `<rect x="14" y="${18 + i * 7}" width="72" height="0.7" fill="#c9d1dc"/>`,
  ).join('')}`,
  build: async ({ font, pageNumber, pageCount, w, h }) => {
    await loadFont(font);
    const a = area({ w, h, font, pageNumber, pageCount });
    const gap = 0.28 * IN; // ~20pt, college ruled
    const objs: fabric.FabricObject[] = [];
    for (let y = a.top + gap; y <= a.top + a.height; y += gap) {
      objs.push(line(a.left, y, a.left + a.width, y));
    }
    return objs;
  },
};

const dotted: TemplateDef = {
  id: 'dotted',
  name: 'Dot grid',
  category: 'interior',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Bullet-journal dot grid at 5 mm.',
  preview: `<rect width="100" height="141" fill="#fff"/>${Array.from({ length: 15 }, (_, r) =>
    Array.from(
      { length: 11 },
      (_, c) => `<circle cx="${14 + c * 7.2}" cy="${18 + r * 7.2}" r="0.9" fill="#b9c2cf"/>`,
    ).join(''),
  ).join('')}`,
  build: async ({ w, h, font, pageNumber, pageCount }) => {
    const a = area({ w, h, font, pageNumber, pageCount });
    const step = 5 * (IN / 25.4); // 5 mm
    const objs: fabric.FabricObject[] = [];
    for (let y = a.top; y <= a.top + a.height; y += step) {
      for (let x = a.left; x <= a.left + a.width; x += step) {
        objs.push(
          new fabric.Circle({
            left: x,
            top: y,
            radius: 0.9,
            fill: '#b9c2cf',
            originX: 'center',
            originY: 'center',
          }),
        );
      }
    }
    return objs;
  },
};

const graph: TemplateDef = {
  id: 'graph',
  name: 'Graph paper',
  category: 'interior',
  accessLevel: 'free',
  kdpSafe: true,
  description: '5 mm squares for maths and design work.',
  preview: `<rect width="100" height="141" fill="#fff"/>${[
    ...Array.from({ length: 12 }, (_, i) => `<rect x="14" y="${18 + i * 8.6}" width="72" height="0.5" fill="#dfe5ec"/>`),
    ...Array.from({ length: 10 }, (_, i) => `<rect x="${14 + i * 8}" y="18" width="0.5" height="103" fill="#dfe5ec"/>`),
  ].join('')}`,
  build: async ({ w, h, font, pageNumber, pageCount }) => {
    const a = area({ w, h, font, pageNumber, pageCount });
    const step = 5 * (IN / 25.4);
    const objs: fabric.FabricObject[] = [];
    for (let y = a.top; y <= a.top + a.height; y += step)
      objs.push(line(a.left, y, a.left + a.width, y, FAINT, 0.75));
    for (let x = a.left; x <= a.left + a.width; x += step)
      objs.push(line(x, a.top, x, a.top + a.height, FAINT, 0.75));
    return objs;
  },
};

const halfLined: TemplateDef = {
  id: 'half-lined',
  name: 'Sketch + write',
  category: 'interior',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Blank box on top, writing lines below — great for kids.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="14" y="16" width="72" height="55" fill="none" stroke="#c9d1dc" stroke-width="1"/>${Array.from(
    { length: 7 },
    (_, i) => `<rect x="14" y="${80 + i * 7}" width="72" height="0.7" fill="#c9d1dc"/>`,
  ).join('')}`,
  build: async ({ w, h, font, pageNumber, pageCount }) => {
    const a = area({ w, h, font, pageNumber, pageCount });
    const boxH = a.height * 0.46;
    const objs: fabric.FabricObject[] = [
      new fabric.Rect({
        left: a.left,
        top: a.top,
        width: a.width,
        height: boxH,
        fill: null,
        stroke: RULE,
        strokeWidth: 1.2,
        rx: 4,
        ry: 4,
      }),
    ];
    const gap = 0.32 * IN;
    for (let y = a.top + boxH + gap; y <= a.top + a.height; y += gap) {
      objs.push(line(a.left, y, a.left + a.width, y));
    }
    return objs;
  },
};

// ------------------------------------------------------------------ journal

const guidedJournal: TemplateDef = {
  id: 'guided-journal',
  name: 'Guided journal page',
  category: 'planner',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Date, prompt and lines — the classic journal interior.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="14" y="14" width="30" height="4" fill="#111827"/><rect x="14" y="26" width="72" height="0.7" fill="#c9d1dc"/><rect x="14" y="36" width="50" height="3" fill="#9aa4b5"/>${Array.from(
    { length: 11 },
    (_, i) => `<rect x="14" y="${50 + i * 7}" width="72" height="0.7" fill="#c9d1dc"/>`,
  ).join('')}`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [
      text('Date: ____________', {
        left: a.left,
        top: a.top,
        width: a.width * 0.6,
        fontSize: 11,
        fill: '#6b7280',
        fontFamily: ctx.font,
      }),
      line(a.left, a.top + 22, a.left + a.width, a.top + 22, RULE, 1.4),
      text('Today I am grateful for…', {
        left: a.left,
        top: a.top + 34,
        width: a.width,
        fontSize: 13,
        fontFamily: ctx.font,
        fill: '#374151',
      }),
    ];
    const gap = 0.3 * IN;
    for (let y = a.top + 62; y <= a.top + a.height; y += gap) {
      objs.push(line(a.left, y, a.left + a.width, y));
    }
    return objs;
  },
};

const habitTracker: TemplateDef = {
  id: 'habit-tracker',
  name: 'Habit tracker',
  category: 'planner',
  accessLevel: 'free',
  kdpSafe: true,
  description: '31-day grid with room for habit names.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="14" y="12" width="40" height="5" fill="#111827"/>${Array.from(
    { length: 9 },
    (_, r) =>
      `<rect x="14" y="${26 + r * 10}" width="72" height="0.5" fill="#dfe5ec"/>` +
      Array.from({ length: 8 }, (_, c) => `<rect x="${38 + c * 6}" y="26" width="0.5" height="90" fill="#dfe5ec"/>`).join(''),
  ).join('')}`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [
      text('HABIT TRACKER', {
        left: a.left,
        top: a.top,
        width: a.width,
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: ctx.font,
      }),
      text('Month: ______________', {
        left: a.left,
        top: a.top + 22,
        width: a.width,
        fontSize: 10,
        fill: '#6b7280',
        fontFamily: ctx.font,
      }),
    ];

    const gridTop = a.top + 46;
    const labelW = a.width * 0.34;
    const days = 31;
    const cell = (a.width - labelW) / days;
    const rows = Math.min(14, Math.floor((a.top + a.height - gridTop) / 20));
    const rowH = 20;

    for (let d = 0; d <= days; d++) {
      const x = a.left + labelW + d * cell;
      objs.push(line(x, gridTop, x, gridTop + rows * rowH, FAINT, 0.75));
    }
    for (let r = 0; r <= rows; r++) {
      const y = gridTop + r * rowH;
      objs.push(line(a.left, y, a.left + a.width, y, FAINT, 0.75));
    }
    for (let d = 0; d < days; d += 5) {
      objs.push(
        text(String(d + 1), {
          left: a.left + labelW + d * cell + 1,
          top: gridTop - 12,
          width: cell * 4,
          fontSize: 7,
          fill: '#9aa4b5',
          fontFamily: ctx.font,
        }),
      );
    }
    return objs;
  },
};

const weeklyPlanner: TemplateDef = {
  id: 'weekly-planner',
  name: 'Weekly planner',
  category: 'planner',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Seven day blocks plus a notes strip.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="14" y="12" width="36" height="5" fill="#111827"/>${Array.from(
    { length: 7 },
    (_, i) =>
      `<rect x="14" y="${26 + i * 14}" width="72" height="12" fill="none" stroke="#dfe5ec" stroke-width="0.8"/><rect x="17" y="${29 + i * 14}" width="14" height="2.5" fill="#9aa4b5"/>`,
  ).join('')}`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [
      text('WEEK OF ______________', {
        left: a.left,
        top: a.top,
        width: a.width,
        fontSize: 14,
        fontWeight: 'bold',
        fontFamily: ctx.font,
      }),
    ];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const top = a.top + 32;
    const blockH = (a.top + a.height - top) / 7.6;
    days.forEach((d, i) => {
      const y = top + i * blockH;
      objs.push(
        new fabric.Rect({
          left: a.left,
          top: y,
          width: a.width,
          height: blockH - 5,
          fill: null,
          stroke: FAINT,
          strokeWidth: 0.9,
          rx: 3,
          ry: 3,
        }),
      );
      objs.push(
        text(d, {
          left: a.left + 6,
          top: y + 4,
          width: a.width * 0.4,
          fontSize: 9,
          fill: '#6b7280',
          fontFamily: ctx.font,
        }),
      );
    });
    return objs;
  },
};

const checklist: TemplateDef = {
  id: 'checklist',
  name: 'Checklist',
  category: 'planner',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Tick boxes with writing lines.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="14" y="12" width="30" height="5" fill="#111827"/>${Array.from(
    { length: 12 },
    (_, i) =>
      `<rect x="14" y="${28 + i * 8.5}" width="5" height="5" fill="none" stroke="#9aa4b5" stroke-width="0.8"/><rect x="23" y="${32 + i * 8.5}" width="63" height="0.6" fill="#dfe5ec"/>`,
  ).join('')}`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [
      text('TO DO', {
        left: a.left,
        top: a.top,
        width: a.width,
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: ctx.font,
      }),
    ];
    const gap = 0.34 * IN;
    const box = 11;
    for (let y = a.top + 36; y <= a.top + a.height - box; y += gap) {
      objs.push(
        new fabric.Rect({
          left: a.left,
          top: y,
          width: box,
          height: box,
          fill: null,
          stroke: '#9aa4b5',
          strokeWidth: 1,
          rx: 2,
          ry: 2,
        }),
      );
      objs.push(line(a.left + box + 8, y + box, a.left + a.width, y + box));
    }
    return objs;
  },
};

// ------------------------------------------------------------------- covers

const boldCover: TemplateDef = {
  id: 'cover-bold',
  name: 'Bold cover',
  category: 'interior',
  accessLevel: 'free',
  preview: `<rect width="100" height="141" fill="#6366f1"/><rect x="10" y="52" width="80" height="4" fill="#fff"/><rect x="10" y="24" width="62" height="20" fill="#fff" opacity=".9"/><rect x="10" y="66" width="44" height="8" fill="#fff" opacity=".6"/>`,
  build: async ({ w, h, font }) => {
    await loadFont(font);
    return [
      new fabric.Rect({ left: 0, top: 0, width: w, height: h, fill: '#6366f1' }),
      text('YOUR\nTITLE HERE', {
        left: w * 0.1,
        top: h * 0.22,
        width: w * 0.8,
        fontSize: Math.round(w * 0.11),
        fontWeight: 'bold',
        fill: '#ffffff',
        lineHeight: 1.02,
        fontFamily: font,
      }),
      new fabric.Rect({ left: w * 0.1, top: h * 0.55, width: w * 0.8, height: 5, fill: '#fff' }),
      text('Subtitle or author name', {
        left: w * 0.1,
        top: h * 0.6,
        width: w * 0.8,
        fontSize: Math.round(w * 0.038),
        fill: 'rgba(255,255,255,0.85)',
        fontFamily: font,
      }),
    ];
  },
};

const titlePage: TemplateDef = {
  id: 'title-page',
  name: 'Title page',
  category: 'interior',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Interior title page — the first thing after the cover.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="22" y="52" width="56" height="7" fill="#111827"/><rect x="34" y="66" width="32" height="3" fill="#9aa4b5"/><rect x="38" y="112" width="24" height="3" fill="#9aa4b5"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    return [
      text('Your Title', {
        left: a.left,
        top: a.top + a.height * 0.34,
        width: a.width,
        fontSize: Math.round(ctx.w * 0.085),
        textAlign: 'center',
        fontFamily: ctx.font,
      }),
      text('A subtitle goes here', {
        left: a.left,
        top: a.top + a.height * 0.46,
        width: a.width,
        fontSize: Math.round(ctx.w * 0.032),
        textAlign: 'center',
        fill: '#6b7280',
        fontFamily: ctx.font,
      }),
      text('Author Name', {
        left: a.left,
        top: a.top + a.height * 0.82,
        width: a.width,
        fontSize: Math.round(ctx.w * 0.034),
        textAlign: 'center',
        fill: '#374151',
        fontFamily: ctx.font,
      }),
    ];
  },
};

// ----------------------------------------------------------------- activity

const puzzlePage: TemplateDef = {
  id: 'puzzle-page',
  name: 'Puzzle page',
  category: 'puzzle',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Title, a big square frame and an instruction line.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="18" y="12" width="64" height="6" fill="#111827"/><rect x="14" y="30" width="72" height="72" fill="none" stroke="#111827" stroke-width="1.4"/><rect x="24" y="115" width="52" height="3" fill="#9aa4b5"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    // Leave room for the 1.6pt stroke so the frame's bounding box (stroke
    // included) stays inside the safe area even on narrow gutters.
    const side = Math.min(a.width - 4, a.height * 0.62);
    return [
      text('PUZZLE TITLE', {
        left: a.left,
        top: a.top,
        width: a.width,
        fontSize: Math.round(ctx.w * 0.055),
        fontWeight: 'bold',
        textAlign: 'center',
        fontFamily: ctx.font,
      }),
      text('Puzzle #1', {
        left: a.left,
        top: a.top + 34,
        width: a.width,
        fontSize: 11,
        textAlign: 'center',
        fill: '#6b7280',
        fontFamily: ctx.font,
      }),
      new fabric.Rect({
        left: a.left + (a.width - side) / 2,
        top: a.top + 58,
        width: side,
        height: side,
        fill: null,
        stroke: INK,
        strokeWidth: 1.6,
      }),
      text('Instructions go here.', {
        left: a.left,
        top: a.top + a.height - 18,
        width: a.width,
        fontSize: 10,
        textAlign: 'center',
        fill: '#6b7280',
        fontFamily: ctx.font,
      }),
    ];
  },
};

const worksheet: TemplateDef = {
  id: 'worksheet',
  name: 'Worksheet',
  category: 'school',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Name/date header with writing lines.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="14" y="12" width="44" height="6" fill="#111827"/><rect x="14" y="24" width="72" height="0.8" fill="#9aa4b5"/>${Array.from(
    { length: 12 },
    (_, i) => `<rect x="14" y="${38 + i * 7.5}" width="72" height="0.7" fill="#c9d1dc"/>`,
  ).join('')}`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [
      text('Worksheet title', {
        left: a.left,
        top: a.top,
        width: a.width,
        fontSize: Math.round(ctx.w * 0.05),
        fontWeight: 'bold',
        fontFamily: ctx.font,
      }),
      text('Name: ______________________     Date: ____________', {
        left: a.left,
        top: a.top + 30,
        width: a.width,
        fontSize: 10,
        fill: '#4b5563',
        fontFamily: ctx.font,
      }),
      line(a.left, a.top + 50, a.left + a.width, a.top + 50, RULE, 1.2),
    ];
    const gap = 0.32 * IN;
    for (let y = a.top + 72; y <= a.top + a.height; y += gap) {
      objs.push(line(a.left, y, a.left + a.width, y));
    }
    return objs;
  },
};

const twoColumn: TemplateDef = {
  id: 'two-column',
  name: 'Two column',
  category: 'interior',
  accessLevel: 'free',
  kdpSafe: true,
  description: 'Body text in two columns.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="14" y="12" width="56" height="6" fill="#111827"/><rect x="14" y="30" width="33" height="90" fill="#eef1f5"/><rect x="53" y="30" width="33" height="90" fill="#eef1f5"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const body =
      'Replace this placeholder text with your own content. Every element on the page is a normal canvas object, so you can move, resize, restyle or delete it.';
    const colW = (a.width - 18) / 2;
    return [
      text('Document heading', {
        left: a.left,
        top: a.top,
        width: a.width,
        fontSize: Math.round(ctx.w * 0.055),
        fontWeight: 'bold',
        fontFamily: ctx.font,
      }),
      text(body, {
        left: a.left,
        top: a.top + 46,
        width: colW,
        fontSize: 11,
        fill: '#374151',
        fontFamily: ctx.font,
      }),
      text(body, {
        left: a.left + colW + 18,
        top: a.top + 46,
        width: colW,
        fontSize: 11,
        fill: '#374151',
        fontFamily: ctx.font,
      }),
    ];
  },
};

const certificate: TemplateDef = {
  id: 'certificate',
  name: 'Certificate',
  category: 'interior',
  accessLevel: 'ad_unlock',
  kdpSafe: true,
  preview: `<rect width="100" height="141" fill="#fffdf5"/><rect x="10" y="12" width="80" height="117" fill="none" stroke="#b45309" stroke-width="2.5"/><rect x="24" y="37" width="52" height="6" fill="#b45309"/><rect x="28" y="68" width="44" height="5" fill="#9ca3af"/><rect x="30" y="104" width="40" height="3" fill="#9ca3af"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    // Layout inside the KDP safe area: the border is decorative CONTENT (it
    // must not run into the gutter or get trimmed), so it is drawn at the
    // safe-area inset minus the stroke overhang, not at the page edges.
    const a = area(ctx);
    const pad = Math.max(10, Math.round(ctx.w * 0.045));
    return [
      // Full-page paper-tone background. A filled rect needs NO stroke — a
      // default strokeWidth of 1 would extend the bounds 0.5pt beyond the trim
      // and trip the KDP "object outside page" check at non-integer trims.
      new fabric.Rect({ left: 0, top: 0, width: ctx.w, height: ctx.h, fill: '#fffdf5', strokeWidth: 0 }),
      new fabric.Rect({
        left: a.left + pad,
        top: a.top + pad,
        width: Math.max(20, a.width - pad * 2),
        height: Math.max(20, a.height - pad * 2),
        fill: null,
        stroke: '#b45309',
        strokeWidth: 5,
      }),
      text('CERTIFICATE OF ACHIEVEMENT', {
        left: a.left + pad * 1.6,
        top: a.top + a.height * 0.16,
        width: Math.max(40, a.width - pad * 3.2),
        fontSize: Math.round(ctx.w * 0.048),
        fontWeight: 'bold',
        textAlign: 'center',
        fill: '#b45309',
        fontFamily: ctx.font,
      }),
      text('is proudly presented to', {
        left: a.left + pad * 1.6,
        top: a.top + a.height * 0.3,
        width: Math.max(40, a.width - pad * 3.2),
        fontSize: Math.round(ctx.w * 0.024),
        textAlign: 'center',
        fill: '#6b7280',
        fontFamily: ctx.font,
      }),
      text('Recipient Name', {
        left: a.left + pad * 1.6,
        top: a.top + a.height * 0.38,
        width: Math.max(40, a.width - pad * 3.2),
        fontSize: Math.round(ctx.w * 0.062),
        textAlign: 'center',
        fontFamily: ctx.font,
      }),
      text('__________________\nSignature', {
        left: a.left + pad * 1.6,
        top: a.top + a.height * 0.68,
        width: Math.max(40, a.width - pad * 3.2),
        fontSize: Math.round(ctx.w * 0.022),
        textAlign: 'center',
        fill: '#6b7280',
        fontFamily: ctx.font,
      }),
    ];
  },
};


// ------------------------------------------------------- premium planners
// Modelled on the layouts KDP planner sellers actually ship: a time-blocked
// schedule column beside priority / to-do / notes panels.

const PANEL_LINE = '#d7dde6';

/** Titled panel with a filled header bar. */
function panel(
  x: number, y: number, w: number, h: number,
  title: string, font: string,
  accent: string, headerText = '#ffffff',
) {
  const headH = 20;
  return [
    new fabric.Rect({ left: x, top: y, width: w, height: h, fill: null,
      stroke: PANEL_LINE, strokeWidth: 1, rx: 4, ry: 4 }),
    new fabric.Rect({ left: x, top: y, width: w, height: headH, fill: accent, rx: 4, ry: 4 }),
    new fabric.Rect({ left: x, top: y + headH - 5, width: w, height: 5, fill: accent }),
    text(title, { left: x + 8, top: y + 5, width: w - 16, fontSize: 9,
      fontWeight: 'bold', fill: headerText, fontFamily: font, charSpacing: 60 }),
  ] as fabric.FabricObject[];
}

function writeLines(
  x: number, y: number, w: number, count: number, gap: number, color = PANEL_LINE,
) {
  return Array.from({ length: count }, (_, i) =>
    line(x, y + i * gap, x + w, y + i * gap, color, 0.75));
}

function checkRows(
  x: number, y: number, w: number, count: number, gap: number, box = 9,
) {
  const out: fabric.FabricObject[] = [];
  for (let i = 0; i < count; i++) {
    const yy = y + i * gap;
    out.push(new fabric.Rect({ left: x, top: yy - box + 2, width: box, height: box,
      fill: null, stroke: '#9aa4b5', strokeWidth: 0.9, rx: 1.5, ry: 1.5 }));
    out.push(line(x + box + 6, yy, x + w, yy, PANEL_LINE, 0.75));
  }
  return out;
}

const dailyPlanner: TemplateDef = {
  id: 'daily-planner',
  name: 'Daily planner',
  category: 'planner',
  accessLevel: 'ad_unlock',
  kdpSafe: true,
  description: 'Hourly schedule, priorities, to-do and notes — the bestseller layout.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="8" y="8" width="52" height="8" fill="#111827"/><rect x="66" y="8" width="26" height="10" fill="#eef1f5" stroke="#d7dde6"/>` +
    Array.from({ length: 13 }, (_, i) => `<rect x="8" y="${24 + i * 8}" width="52" height="0.6" fill="#d7dde6"/><rect x="8" y="${24 + i * 8}" width="12" height="0.6" fill="#9aa4b5"/>`).join('') +
    `<rect x="66" y="24" width="26" height="30" fill="none" stroke="#d7dde6"/><rect x="66" y="24" width="26" height="6" fill="#6366f1"/>` +
    `<rect x="66" y="60" width="26" height="34" fill="none" stroke="#d7dde6"/><rect x="66" y="60" width="26" height="6" fill="#34d399"/>` +
    `<rect x="66" y="100" width="26" height="30" fill="none" stroke="#d7dde6"/><rect x="66" y="100" width="26" height="6" fill="#fbbf24"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [];
    const gapX = 14;
    const leftW = a.width * 0.56;
    const rightX = a.left + leftW + gapX;
    const rightW = a.width - leftW - gapX;

    objs.push(text('DAILY PLAN', { left: a.left, top: a.top, width: leftW,
      fontSize: Math.round(ctx.w * 0.062), fontWeight: 'bold', fontFamily: ctx.font, charSpacing: 40 }));
    objs.push(...panel(rightX, a.top, rightW, 34, 'DATE', ctx.font, '#e9edf3', '#4b5563'));

    // hourly schedule
    const schedTop = a.top + 52;
    objs.push(text("TODAY'S SCHEDULE", { left: a.left, top: schedTop - 16, width: leftW,
      fontSize: 9, fontWeight: 'bold', fill: '#6b7280', fontFamily: ctx.font, charSpacing: 60 }));
    const rows = 15;
    const rowH = (a.top + a.height - schedTop) / rows;
    const timeW = leftW * 0.26;
    for (let i = 0; i <= rows; i++) {
      objs.push(line(a.left, schedTop + i * rowH, a.left + leftW, schedTop + i * rowH, PANEL_LINE, 0.75));
    }
    objs.push(line(a.left + timeW, schedTop, a.left + timeW, schedTop + rows * rowH, PANEL_LINE, 0.9));
    for (let i = 0; i < rows; i++) {
      const hour = 6 + i;
      const lbl = hour < 12 ? `${hour}-${hour + 1} AM` : hour === 12 ? '12-1 PM' : `${hour - 12}-${hour - 11} PM`;
      objs.push(text(lbl, { left: a.left + 5, top: schedTop + i * rowH + rowH / 2 - 5,
        width: timeW - 8, fontSize: 7.5, fill: '#6b7280', fontFamily: ctx.font }));
    }

    // right column
    const pTop = a.top + 52;
    const pH = 96;
    objs.push(...panel(rightX, pTop, rightW, pH, 'TOP PRIORITIES', ctx.font, '#6366f1'));
    objs.push(...checkRows(rightX + 10, pTop + 40, rightW - 20, 4, 18));

    const tTop = pTop + pH + 14;
    const tH = 132;
    objs.push(...panel(rightX, tTop, rightW, tH, 'TO DO LIST', ctx.font, '#34d399'));
    objs.push(...checkRows(rightX + 10, tTop + 40, rightW - 20, 6, 17));

    const nTop = tTop + tH + 14;
    const nH = Math.max(60, a.top + a.height - nTop);
    objs.push(...panel(rightX, nTop, rightW, nH, 'NOTES', ctx.font, '#fbbf24', '#7c4a03'));
    objs.push(...writeLines(rightX + 10, nTop + 40, rightW - 20, Math.floor((nH - 46) / 16), 16));
    return objs;
  },
};

const dailySchedule30: TemplateDef = {
  id: 'daily-schedule-30',
  name: 'Half-hour schedule',
  category: 'planner',
  accessLevel: 'ad_unlock',
  kdpSafe: true,
  description: '6am–midnight in 30-minute slots, with meal tracker and notes.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="8" y="8" width="46" height="8" fill="#111827"/>` +
    Array.from({ length: 22 }, (_, i) => `<rect x="8" y="${22 + i * 5.2}" width="46" height="4.4" fill="${i % 2 ? '#f6f7f9' : '#eef1f5'}" stroke="#d7dde6" stroke-width="0.3"/>`).join('') +
    `<rect x="60" y="22" width="32" height="34" fill="#f0f1ec" stroke="#d7dde6"/><rect x="60" y="62" width="32" height="40" fill="#e8e6dd" stroke="#d7dde6"/><rect x="60" y="108" width="32" height="26" fill="#f0f1ec" stroke="#d7dde6"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [];
    const gapX = 14;
    const leftW = a.width * 0.5;
    const rightX = a.left + leftW + gapX;
    const rightW = a.width - leftW - gapX;

    objs.push(text('DAILY SCHEDULE', { left: a.left, top: a.top, width: a.width,
      fontSize: Math.round(ctx.w * 0.055), fontWeight: 'bold', fontFamily: ctx.font, charSpacing: 30 }));

    const top = a.top + 44;
    const slots = 30;
    const rowH = (a.top + a.height - top) / slots;
    const timeW = leftW * 0.3;
    for (let i = 0; i < slots; i++) {
      const y = top + i * rowH;
      if (i % 2 === 0) {
        objs.push(new fabric.Rect({ left: a.left, top: y, width: leftW, height: rowH,
          fill: '#f4f5f7', stroke: PANEL_LINE, strokeWidth: 0.75 }));
      } else {
        objs.push(new fabric.Rect({ left: a.left, top: y, width: leftW, height: rowH,
          fill: null, stroke: PANEL_LINE, strokeWidth: 0.75 }));
      }
      const h24 = 6 + Math.floor(i / 2);
      const half = i % 2 === 1;
      const hh = h24 > 12 ? h24 - 12 : h24;
      const ap = h24 >= 12 ? 'PM' : 'AM';
      objs.push(text(`${hh}:${half ? '30' : '00'} ${ap}`, {
        left: a.left + 4, top: y + rowH / 2 - 4, width: timeW,
        fontSize: 6.5, fill: '#6b7280', fontFamily: ctx.font }));
    }
    objs.push(line(a.left + timeW, top, a.left + timeW, top + slots * rowH, PANEL_LINE, 0.8));

    const pTop = a.top + 44;
    const ph = 104;
    objs.push(...panel(rightX, pTop, rightW, ph, 'TOP PRIORITIES', ctx.font, '#e9edf3', '#374151'));
    for (let i = 0; i < 5; i++) {
      const y = pTop + 38 + i * 14;
      objs.push(text(String(i + 1), { left: rightX + 8, top: y - 8, width: 12,
        fontSize: 8, fill: '#9aa4b5', fontFamily: ctx.font }));
      objs.push(line(rightX + 24, y, rightX + rightW - 10, y, PANEL_LINE, 0.75));
    }

    const mTop = pTop + ph + 14;
    const mh = 92;
    objs.push(...panel(rightX, mTop, rightW, mh, 'MEAL TRACKER', ctx.font, '#e9edf3', '#374151'));
    ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS'].forEach((m, i) => {
      const y = mTop + 40 + i * 15;
      objs.push(text(m, { left: rightX + 9, top: y - 9, width: rightW - 18,
        fontSize: 7, fill: '#6b7280', fontFamily: ctx.font }));
      objs.push(line(rightX + 9, y + 2, rightX + rightW - 9, y + 2, PANEL_LINE, 0.75));
    });

    const nTop = mTop + mh + 14;
    const nh = Math.max(50, a.top + a.height - nTop);
    objs.push(...panel(rightX, nTop, rightW, nh, 'NOTES', ctx.font, '#e9edf3', '#374151'));
    objs.push(...writeLines(rightX + 9, nTop + 38, rightW - 18, Math.floor((nh - 44) / 15), 15));
    return objs;
  },
};

const productivityPad: TemplateDef = {
  id: 'productivity-pad',
  name: 'Productivity pad',
  category: 'planner',
  accessLevel: 'premium_only',
  kdpSafe: true,
  description: 'Appointments, must-dos, wins and goals in colour-coded blocks.',
  preview: `<rect width="100" height="141" fill="#fff"/>` +
    `<rect x="6" y="16" width="42" height="30" fill="none" stroke="#5eead4"/><rect x="6" y="16" width="42" height="6" fill="#5eead4"/>` +
    `<rect x="52" y="16" width="42" height="30" fill="none" stroke="#fca5a5"/><rect x="52" y="16" width="42" height="6" fill="#fca5a5"/>` +
    `<rect x="6" y="52" width="42" height="22" fill="none" stroke="#93c5fd"/><rect x="6" y="52" width="42" height="6" fill="#93c5fd"/>` +
    `<rect x="52" y="52" width="42" height="22" fill="none" stroke="#a5b4fc"/><rect x="52" y="52" width="42" height="6" fill="#a5b4fc"/>` +
    `<rect x="6" y="80" width="42" height="40" fill="none" stroke="#fca5a5"/><rect x="6" y="80" width="42" height="6" fill="#fca5a5"/>` +
    `<rect x="52" y="80" width="42" height="18" fill="none" stroke="#5eead4"/><rect x="52" y="80" width="42" height="6" fill="#5eead4"/>` +
    `<rect x="52" y="102" width="42" height="18" fill="none" stroke="#a5b4fc"/><rect x="52" y="102" width="42" height="6" fill="#a5b4fc"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [];
    const gap = 12;
    const colW = (a.width - gap) / 2;
    const rx = a.left + colW + gap;

    objs.push(text('DAILY FOCUS', { left: a.left, top: a.top, width: a.width * 0.6,
      fontSize: Math.round(ctx.w * 0.05), fontWeight: 'bold', fontFamily: ctx.font }));
    objs.push(...panel(a.left + a.width * 0.64, a.top - 4, a.width * 0.36, 28,
      "TODAY'S DATE", ctx.font, '#93c5fd'));

    let y = a.top + 40;
    const h1 = a.height * 0.19;
    objs.push(...panel(a.left, y, colW, h1, 'APPOINTMENTS', ctx.font, '#5eead4', '#065f46'));
    objs.push(...writeLines(a.left + 9, y + 40, colW - 18, 5, (h1 - 46) / 5));
    objs.push(...panel(rx, y, colW, h1, 'MUST DO TODAY', ctx.font, '#fca5a5', '#7f1d1d'));
    objs.push(...checkRows(rx + 9, y + 40, colW - 18, 5, (h1 - 46) / 5));

    y += h1 + gap;
    const h2 = a.height * 0.13;
    objs.push(...panel(a.left, y, colW, h2, "TODAY'S BIGGEST WIN", ctx.font, '#93c5fd', '#1e3a8a'));
    objs.push(...panel(rx, y, colW, h2, '#1 PROCRASTINATION ITEM', ctx.font, '#a5b4fc', '#312e81'));

    y += h2 + gap;
    const h3 = a.height * 0.26;
    objs.push(...panel(a.left, y, colW, h3, 'IMPORTANT TASKS', ctx.font, '#fca5a5', '#7f1d1d'));
    objs.push(...checkRows(a.left + 9, y + 40, colW - 18, 8, (h3 - 48) / 8));
    const halfH = (h3 - gap) / 2;
    objs.push(...panel(rx, y, colW, halfH, 'DO FOR OTHERS', ctx.font, '#5eead4', '#065f46'));
    objs.push(...writeLines(rx + 9, y + 38, colW - 18, 3, (halfH - 44) / 3));
    objs.push(...panel(rx, y + halfH + gap, colW, halfH, 'DO FOR MYSELF', ctx.font, '#a5b4fc', '#312e81'));
    objs.push(...writeLines(rx + 9, y + halfH + gap + 38, colW - 18, 3, (halfH - 44) / 3));

    y += h3 + gap;
    const h4 = Math.max(46, a.top + a.height - y);
    objs.push(...panel(a.left, y, colW, h4, '#1 GOAL FOR TODAY', ctx.font, '#93c5fd', '#1e3a8a'));
    objs.push(...panel(rx, y, colW, h4, 'SECONDARY GOAL', ctx.font, '#fca5a5', '#7f1d1d'));
    return objs;
  },
};

const weeklySpread: TemplateDef = {
  id: 'weekly-spread',
  name: 'Weekly spread',
  category: 'planner',
  accessLevel: 'ad_unlock',
  kdpSafe: true,
  description: 'Seven day boxes with a tasks and notes sidebar.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="8" y="8" width="40" height="7" fill="#111827"/>` +
    Array.from({ length: 7 }, (_, i) => `<rect x="8" y="${22 + i * 16}" width="52" height="14" fill="none" stroke="#d7dde6"/><rect x="8" y="${22 + i * 16}" width="12" height="14" fill="#eef1f5"/>`).join('') +
    `<rect x="64" y="22" width="28" height="52" fill="none" stroke="#d7dde6"/><rect x="64" y="22" width="28" height="6" fill="#86efac"/>` +
    `<rect x="64" y="80" width="28" height="54" fill="none" stroke="#d7dde6"/><rect x="64" y="80" width="28" height="6" fill="#fbbf24"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [];
    const gap = 12;
    const leftW = a.width * 0.63;
    const rx = a.left + leftW + gap;
    const rw = a.width - leftW - gap;

    objs.push(text('WEEK OF ______________', { left: a.left, top: a.top, width: a.width,
      fontSize: Math.round(ctx.w * 0.045), fontWeight: 'bold', fontFamily: ctx.font }));

    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
    const top = a.top + 38;
    const bh = (a.top + a.height - top) / 7;
    days.forEach((d, i) => {
      const y = top + i * bh;
      objs.push(new fabric.Rect({ left: a.left, top: y, width: leftW, height: bh - 4,
        fill: null, stroke: PANEL_LINE, strokeWidth: 0.9, rx: 3, ry: 3 }));
      objs.push(new fabric.Rect({ left: a.left, top: y, width: 46, height: bh - 4,
        fill: '#eef1f5', rx: 3, ry: 3 }));
      objs.push(text(d, { left: a.left + 4, top: y + (bh - 4) / 2 - 4, width: 42,
        fontSize: 6.5, fill: '#4b5563', fontFamily: ctx.font, textAlign: 'center' }));
    });

    const th = (a.top + a.height - top - gap) / 2;
    objs.push(...panel(rx, top, rw, th, 'TASKS', ctx.font, '#86efac', '#14532d'));
    objs.push(...checkRows(rx + 8, top + 38, rw - 16, Math.floor((th - 46) / 16), 16));
    objs.push(...panel(rx, top + th + gap, rw, th, 'NOTES', ctx.font, '#fbbf24', '#7c4a03'));
    objs.push(...writeLines(rx + 8, top + th + gap + 38, rw - 16, Math.floor((th - 46) / 15), 15));
    return objs;
  },
};

const gratitudeJournal: TemplateDef = {
  id: 'gratitude',
  name: 'Gratitude & reflection',
  category: 'planner',
  accessLevel: 'ad_unlock',
  kdpSafe: true,
  description: 'Mood scale, gratitude list and reflection prompts.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="8" y="8" width="44" height="7" fill="#111827"/>` +
    Array.from({ length: 5 }, (_, i) => `<circle cx="${16 + i * 12}" cy="26" r="4" fill="none" stroke="#9aa4b5"/>`).join('') +
    `<rect x="8" y="38" width="84" height="34" fill="none" stroke="#d7dde6"/><rect x="8" y="38" width="84" height="6" fill="#fbcfe8"/>` +
    `<rect x="8" y="78" width="84" height="26" fill="none" stroke="#d7dde6"/><rect x="8" y="78" width="84" height="6" fill="#bfdbfe"/>` +
    `<rect x="8" y="110" width="84" height="24" fill="none" stroke="#d7dde6"/><rect x="8" y="110" width="84" height="6" fill="#ddd6fe"/>`,
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [];
    objs.push(text('TODAY I FEEL', { left: a.left, top: a.top, width: a.width * 0.5,
      fontSize: Math.round(ctx.w * 0.045), fontWeight: 'bold', fontFamily: ctx.font }));
    objs.push(text('Date: ____________', { left: a.left + a.width * 0.6, top: a.top + 4,
      width: a.width * 0.4, fontSize: 9, fill: '#6b7280', fontFamily: ctx.font, textAlign: 'right' }));

    const faces = ['😞', '😐', '🙂', '😄', '🤩'];
    faces.forEach((f, i) => {
      objs.push(new fabric.Circle({ left: a.left + 14 + i * 34, top: a.top + 40,
        radius: 12, fill: null, stroke: '#9aa4b5', strokeWidth: 1,
        originX: 'center', originY: 'center' }));
      objs.push(text(f, { left: a.left + 2 + i * 34, top: a.top + 32, width: 24,
        fontSize: 13, textAlign: 'center', fontFamily: ctx.font }));
    });

    let y = a.top + 70;
    const h = (a.top + a.height - y - 24) / 3;
    objs.push(...panel(a.left, y, a.width, h, 'THREE THINGS I AM GRATEFUL FOR', ctx.font, '#fbcfe8', '#831843'));
    objs.push(...writeLines(a.left + 10, y + 42, a.width - 20, 3, (h - 50) / 3));
    y += h + 12;
    objs.push(...panel(a.left, y, a.width, h, 'TODAY I ACCOMPLISHED', ctx.font, '#bfdbfe', '#1e3a8a'));
    objs.push(...writeLines(a.left + 10, y + 42, a.width - 20, 3, (h - 50) / 3));
    y += h + 12;
    objs.push(...panel(a.left, y, a.width, h, 'TOMORROW I WILL', ctx.font, '#ddd6fe', '#3730a3'));
    objs.push(...writeLines(a.left + 10, y + 42, a.width - 20, 3, (h - 50) / 3));
    return objs;
  },
};

const monthlyCalendar: TemplateDef = {
  id: 'monthly-calendar',
  name: 'Monthly calendar',
  category: 'planner',
  accessLevel: 'ad_unlock',
  kdpSafe: true,
  description: '7×5 date grid with a notes strip.',
  preview: `<rect width="100" height="141" fill="#fff"/><rect x="8" y="8" width="40" height="7" fill="#111827"/>` +
    Array.from({ length: 7 }, (_, c) => `<rect x="${8 + c * 12}" y="22" width="11.5" height="7" fill="#eef1f5" stroke="#d7dde6" stroke-width="0.4"/>`).join('') +
    Array.from({ length: 5 }, (_, r) => Array.from({ length: 7 }, (_, c) => `<rect x="${8 + c * 12}" y="${31 + r * 17}" width="11.5" height="16" fill="none" stroke="#d7dde6" stroke-width="0.4"/>`).join('')).join(''),
  build: async (ctx) => {
    await loadFont(ctx.font);
    const a = area(ctx);
    const objs: fabric.FabricObject[] = [];
    objs.push(text('MONTH: ______________', { left: a.left, top: a.top, width: a.width,
      fontSize: Math.round(ctx.w * 0.045), fontWeight: 'bold', fontFamily: ctx.font }));

    const dows = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
    const top = a.top + 40;
    const cw = a.width / 7;
    const headH = 18;
    dows.forEach((d, i) => {
      objs.push(new fabric.Rect({ left: a.left + i * cw, top, width: cw, height: headH,
        fill: '#eef1f5', stroke: PANEL_LINE, strokeWidth: 0.75 }));
      objs.push(text(d, { left: a.left + i * cw, top: top + 5, width: cw,
        fontSize: 7, textAlign: 'center', fill: '#4b5563', fontFamily: ctx.font }));
    });
    const gridTop = top + headH;
    const notesH = 70;
    const ch = (a.top + a.height - gridTop - notesH - 12) / 5;
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 7; c++) {
        objs.push(new fabric.Rect({ left: a.left + c * cw, top: gridTop + r * ch,
          width: cw, height: ch, fill: null, stroke: PANEL_LINE, strokeWidth: 0.75 }));
      }
    }
    const nTop = gridTop + 5 * ch + 12;
    objs.push(...panel(a.left, nTop, a.width, notesH, 'NOTES', ctx.font, '#e9edf3', '#374151'));
    objs.push(...writeLines(a.left + 10, nTop + 38, a.width - 20, 3, 15));
    return objs;
  },
};

export const TEMPLATES: TemplateDef[] = [
  dailyPlanner,
  dailySchedule30,
  productivityPad,
  weeklySpread,
  monthlyCalendar,
  gratitudeJournal,
  lined,
  dotted,
  graph,
  halfLined,
  guidedJournal,
  habitTracker,
  weeklyPlanner,
  checklist,
  worksheet,
  puzzlePage,
  twoColumn,
  titlePage,
  boldCover,
  certificate,
];

export const TEMPLATE_CATEGORIES = [
  { key: 'planner', label: 'Planners' },
  { key: 'interior', label: 'Interiors' },
  { key: 'puzzle', label: 'Puzzles' },
  { key: 'school', label: 'School' },
] as const;

/**
 * Guarantee every object of a template sits strictly inside the KDP safe area
 * (safe margins + gutter on the correct side). Two passes:
 *
 *  0. Stroke overhang: fabric's bounding rect puts stroke width on the
 *     right/bottom only, but a stroke visually extends half its width beyond
 *     EVERY edge (and KDP preflight measures it that way). The bounding box is
 *     therefore expanded by strokeWidth/2 on all sides before anything else,
 *     so a 1pt rule or a stroked panel never bleeds past the margin line.
 *  1. Shrink-to-fit: if the (stroke-inclusive) bounding box is larger than
 *     the safe area (a full-width panel, a wide title bar, a long rule),
 *     scale down uniformly. Corrections are sub-1% so they are invisible.
 *  2. Position clamp: translate the object so its bounding box sits exactly
 *     inside the safe area. Full-page artwork (a page-sized background) is
 *     exempt — that is intentional bleed art.
 */
function clampTemplateObjectsToSafeArea(objs: fabric.FabricObject[], ctx: TemplateContext): fabric.FabricObject[] {
  const m = kdpMarginsFor(Math.max(ctx.pageCount, 24));
  const safe = safeAreaFor(ctx.w, ctx.h, ctx.pageNumber, m);
  for (const o of objs) {
    o.setCoords();
    let bb = o.getBoundingRect();
    const fullPageArt = bb.width >= ctx.w * 0.95 && bb.height >= ctx.h * 0.95;
    if (fullPageArt) continue;
    const pad =
      (Math.max(0, Number(o.strokeWidth ?? 0)) *
        Math.max(Math.abs(o.scaleX ?? 1), Math.abs(o.scaleY ?? 1))) /
      2;
    if (pad > 0) {
      bb = {
        left: bb.left - pad,
        top: bb.top - pad,
        width: bb.width + pad * 2,
        height: bb.height + pad * 2,
      };
    }
    const ratio = Math.min(safe.width / Math.max(bb.width, 1), safe.height / Math.max(bb.height, 1), 1);
    if (ratio < 1) {
      o.scale(ratio);
      o.setCoords();
      bb = o.getBoundingRect();
      if (pad > 0) {
        bb = {
          left: bb.left - pad,
          top: bb.top - pad,
          width: bb.width + pad * 2,
          height: bb.height + pad * 2,
        };
      }
    }
    let dx = 0;
    let dy = 0;
    if (bb.left < safe.left) dx = safe.left - bb.left;
    else if (bb.left + bb.width > safe.left + safe.width) dx = safe.left + safe.width - (bb.left + bb.width);
    if (bb.top < safe.top) dy = safe.top - bb.top;
    else if (bb.top + bb.height > safe.top + safe.height) dy = safe.top + safe.height - (bb.top + bb.height);
    if (dx || dy) {
      o.set({ left: (o.left ?? 0) + dx, top: (o.top ?? 0) + dy });
      o.setCoords();
    }
  }
  return objs;
}

/** Apply to the live canvas (current page). */
export async function applyTemplate(
  t: TemplateDef,
  font: string,
  replace: boolean,
  ctx?: Partial<TemplateContext>,
) {
  const c = engine.requireCanvas();
  if (replace) c.remove(...c.getObjects());
  const fullCtx = {
    w: engine.pageWidth,
    h: engine.pageHeight,
    font,
    pageNumber: ctx?.pageNumber ?? 1,
    pageCount: ctx?.pageCount ?? 1,
  };
  const objs = await t.build(fullCtx);
  engine.addObjects(t.kdpSafe ? clampTemplateObjectsToSafeArea(objs, fullCtx) : objs);
}

/**
 * Build a template into serialized page data without a live canvas — used to
 * apply a template across every page at once.
 */
export async function buildTemplateJSON(
  t: TemplateDef,
  ctx: TemplateContext,
): Promise<unknown[]> {
  const objs = t.kdpSafe
    ? clampTemplateObjectsToSafeArea(await t.build(ctx), ctx)
    : await t.build(ctx);
  const el = document.createElement('canvas');
  const tmp = new fabric.StaticCanvas(el, { width: ctx.w, height: ctx.h });
  objs.forEach((o) => tmp.add(o));
  const json = tmp.toObject(['id', 'elementType', 'name', 'locked']) as {
    objects: unknown[];
  };
  tmp.dispose();
  return json.objects ?? [];
}

// ------------------------------------------------------------- thumbnails
//
// Crisp template previews: instead of stretching the hand-drawn SVG preview,
// the Templates panel shows a REAL miniature of the template — the template is
// built exactly as it would be applied (same build + safe-area clamp) and
// rasterised offscreen at 2× the card size, so the thumbnail is pixel-perfect
// and shows the true layout including the KDP gutter.

/** Reference page the thumbnails are rendered at: 6×9in trim, 100 pages. */
export const THUMBNAIL_CTX: TemplateContext = {
  w: 432,
  h: 648,
  font: 'Inter',
  pageNumber: 1,
  pageCount: 100,
};

/** Render width in device px; the card is ~140 CSS px, so 2× stays crisp. */
const THUMBNAIL_WIDTH = 280;

const thumbCache = new Map<string, string>();
const thumbPending = new Map<string, Promise<string>>();

export function clearTemplateThumbnailCache() {
  thumbCache.clear();
  thumbPending.clear();
}

/** Render (and cache) a crisp miniature of a template. */
export function getTemplateThumbnail(
  t: TemplateDef,
  width = THUMBNAIL_WIDTH,
): Promise<string> {
  const key = `${t.id}@${width}`;
  const hit = thumbCache.get(key);
  if (hit) return Promise.resolve(hit);
  const inflight = thumbPending.get(key);
  if (inflight) return inflight;

  const run = (async () => {
    const objs = t.kdpSafe
      ? clampTemplateObjectsToSafeArea(await t.build(THUMBNAIL_CTX), THUMBNAIL_CTX)
      : await t.build(THUMBNAIL_CTX);
    const el = document.createElement('canvas');
    const tmp = new fabric.StaticCanvas(el, {
      width: THUMBNAIL_CTX.w,
      height: THUMBNAIL_CTX.h,
      backgroundColor: '#ffffff',
    });
    objs.forEach((o) => tmp.add(o));
    // Never inherit a viewport (zoom/pan) into the thumbnail.
    tmp.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const url = tmp.toDataURL({
      format: 'png',
      multiplier: width / THUMBNAIL_CTX.w,
      enableRetinaScaling: false,
    });
    tmp.dispose();
    thumbCache.set(key, url);
    return url;
  })();
  thumbPending.set(key, run);
  return run;
}
