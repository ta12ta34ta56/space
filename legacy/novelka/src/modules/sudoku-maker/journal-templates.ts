import * as fabric from 'fabric';
import {
  calendarIcon,
  checkbox,
  clockIcon,
  coordLabels,
  fieldLine,
  ornamentRule,
  pencilIcon,
  sparkle,
  sprig,
  starRow,
  text,
  writeLine,
} from './furniture';
import type { PuzzleSlot, SudokuTemplate, TemplateContext } from './templates';

/**
 * Journal-style Sudoku page designs, modelled on the owner's reference art.
 *
 * These are the "low-content book" layouts KDP buyers expect: a date field, a
 * difficulty rating, a start/finish timer, a motivational line and often a
 * notes area — all wrapped around a single generous grid.
 *
 * They live in their own file to keep `templates.ts` readable; the registry in
 * `templates.ts` imports and appends them.
 */

// ---------------------------------------------------------------- helpers

/** Content box, honouring the KDP gutter when asked. */
function areaOf(ctx: TemplateContext, kdp: (c: TemplateContext) => {
  left: number; top: number; width: number; height: number; isRecto: boolean;
}) {
  return kdp(ctx);
}

/**
 * One centred square grid inside a box, leaving room above and below.
 * Journal pages are always a single big grid, so this is simpler than the
 * multi-slot packer in `templates.ts`.
 */
function soloSlot(box: {
  left: number; top: number; width: number; height: number;
}, opts: {
  captionH?: number;
  /** space reserved outside the grid for coordinate labels */
  rail?: { top?: number; bottom?: number; left?: number; right?: number };
} = {}): PuzzleSlot[] {
  const captionH = opts.captionH ?? 0;
  const r = opts.rail ?? {};
  const rt = r.top ?? 0, rb = r.bottom ?? 0, rl = r.left ?? 0, rr = r.right ?? 0;

  // the grid must fit *inside* the box once its label rails are subtracted
  const w = box.width - rl - rr;
  const h = box.height - captionH - rt - rb;
  const size = Math.max(60, Math.min(w, h));

  // centre horizontally within the railed area, and anchor to the top of it so
  // the label rail above the grid never eats into the header
  const left = box.left + rl + (w - size) / 2;
  const top = box.top + captionH + rt + Math.max(0, (h - size) / 2);

  return [{
    left,
    top,
    size,
    captionTop: captionH > 0 ? box.top : undefined,
  }];
}

/** Points a coordinate rail needs for a grid of `size` with `cells` per side. */
function railFor(size: number, cells: number): number {
  const cell = size / cells;
  const fs = Math.max(6, Math.min(13, cell * 0.42));
  return cell * 0.42 + fs * 1.2;
}

const CREAM = '#fbfaf5';
const INK_SOFT = '#6b7280';
const RULE = '#c9d0d8';

/** difficulty word from the puzzle subtitle, e.g. "Puzzle 3 · Medium". */
function levelOf(ctx: TemplateContext): string | undefined {
  if (!ctx.subtitle) return undefined;
  const bits = ctx.subtitle.split('·').map((s) => s.trim());
  return bits.length > 1 ? bits[bits.length - 1] : undefined;
}

/** star count for a level name */
function starsFor(level?: string): number {
  switch ((level ?? '').toLowerCase()) {
    case 'easy': return 1;
    case 'medium': return 3;
    case 'hard': return 4;
    case 'expert': return 5;
    default: return 0;
  }
}

function puzzleNo(ctx: TemplateContext): string | undefined {
  if (!ctx.subtitle) return undefined;
  const m = ctx.subtitle.match(/Puzzle\s+(\d+)/i);
  return m ? m[1] : undefined;
}

// =====================================================  1. classic worksheet
// Reference: bordered page, DATE box, star difficulty, start/end timer,
// lettered rows + numbered columns, dotted notes, closing quote.

export function makeClassicWorksheet(area: (c: TemplateContext) => {
  left: number; top: number; width: number; height: number; isRecto: boolean;
}): SudokuTemplate {
  return {
    id: 'journal-worksheet',
    name: 'Worksheet — framed',
    audience: 'classic',
    accessLevel: 'free',
    bestFor: [4, 9, 16],
    supports: [1],
    description:
      'Framed page with a date box, star difficulty, start/end timer, A–I row and 1–9 column references, and dotted note lines.',
    preview: `<rect width="100" height="141" fill="#fff"/>
      <rect x="4" y="4" width="92" height="133" fill="none" stroke="#111" stroke-width="0.7"/>
      <text x="11" y="19" font-size="9" font-family="Georgia">SUDOKU</text>
      <rect x="11" y="23" width="44" height="9" rx="1.5" fill="none" stroke="#111" stroke-width="0.6"/>
      <text x="14" y="30" font-size="4" fill="#333">Date: ______</text>
      <text x="11" y="41" font-size="4" fill="#333">Difficulty:</text>
      ${[0, 1, 2, 3, 4].map((i) => `<path d="M${31 + i * 6} 36.2 l1.05 2.13 2.35.34-1.7 1.66.4 2.34-2.1-1.11-2.1 1.11.4-2.34-1.7-1.66 2.35-.34z" fill="${i === 0 ? '#111' : 'none'}" stroke="#111" stroke-width="0.35"/>`).join('')}
      <text x="11" y="50" font-size="4" fill="#333">Time: Start ___ End ___</text>
      <g font-size="3.2" fill="#333">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => `<text x="${20.5 + i * 7.4}" y="56" text-anchor="middle">${n}</text>`).join('')}</g>
      <g font-size="3.2" fill="#333">${'ABCDEFGHI'.split('').map((l, i) => `<text x="15" y="${64 + i * 7.4}" text-anchor="middle">${l}</text>`).join('')}</g>
      <rect x="17" y="58" width="66.6" height="66.6" fill="none" stroke="#111" stroke-width="1.5"/>
      ${[1, 2].map((i) => `<rect x="${17 + i * 22.2}" y="58" width="1" height="66.6" fill="#111"/><rect x="17" y="${58 + i * 22.2}" width="66.6" height="1" fill="#111"/>`).join('')}
      ${[1, 2, 4, 5, 7, 8].map((i) => `<rect x="${17 + i * 7.4}" y="58" width="0.35" height="66.6" fill="#111"/><rect x="17" y="${58 + i * 7.4}" width="66.6" height="0.35" fill="#111"/>`).join('')}
      <text x="11" y="130" font-size="3.6" fill="#333">Notes:</text>
      ${[0, 1].map((i) => `<path d="M11 ${132 + i * 3.4} h78" stroke="#bbb" stroke-width="0.4" stroke-dasharray="0.4,1.6"/>`).join('')}`,
    build: (ctx) => {
      const a = areaOf(ctx, area);
      const chrome: fabric.FabricObject[] = [];
      const font = ctx.font;
      const ink = ctx.ink;
      const W = ctx.page.width;

      // outer frame, just inside the safe area
      chrome.push(
        new fabric.Rect({
          left: a.left - 10, top: a.top - 10,
          width: a.width + 20, height: a.height + 20,
          fill: null, stroke: ink, strokeWidth: 1,
        }),
      );

      // title
      const titleSize = Math.round(W * 0.062);
      chrome.push(
        text(ctx.title.toUpperCase(), {
          left: a.left, top: a.top, width: a.width,
          fontSize: titleSize, fontFamily: font, fill: ink, charSpacing: 20,
        }),
      );

      // date box with a calendar icon
      let y = a.top + titleSize * 1.45;
      const boxH = 24;
      chrome.push(
        new fabric.Rect({
          left: a.left, top: y, width: a.width * 0.62, height: boxH,
          rx: 4, ry: 4, fill: null, stroke: ink, strokeWidth: 1,
        }),
        calendarIcon(a.left + 15, y + boxH / 2, 12, ink),
        text('Date:', {
          left: a.left + 26, top: y + 6, width: 42,
          fontSize: 11, fontFamily: font, fill: ink,
        }),
        writeLine({
          left: a.left + 60, top: y + boxH - 7,
          width: a.width * 0.62 - 70, color: ink,
        }),
      );

      // difficulty: label, five stars, then the words — measured so they
      // cannot collide at any trim size
      y += boxH + 14;
      const dLabelW = 60;
      const starSize = 12;
      const starGap = 4;
      const starsW = 5 * starSize + 4 * starGap;
      chrome.push(
        text('Difficulty:', {
          left: a.left, top: y, width: dLabelW,
          fontSize: 12, fontFamily: font, fill: ink,
        }),
        ...starRow({
          left: a.left + dLabelW + 4, top: y, size: starSize, gap: starGap,
          filled: starsFor(levelOf(ctx)), color: ink,
        }),
        text('Easy / Medium / Hard', {
          left: a.left + dLabelW + 12 + starsW,
          top: y,
          width: Math.max(60, a.width - dLabelW - 12 - starsW),
          fontSize: 12, fontFamily: font, fill: ink,
        }),
      );

      // timer row
      y += 24;
      chrome.push(
        text('Time: Start', {
          left: a.left, top: y, width: 72,
          fontSize: 12, fontFamily: font, fill: ink,
        }),
        clockIcon(a.left + 80, y + 7, 7, ink),
        writeLine({ left: a.left + 92, top: y + 14, width: 56, color: ink }),
        text('End', {
          left: a.left + 162, top: y, width: 32,
          fontSize: 12, fontFamily: font, fill: ink,
        }),
        clockIcon(a.left + 196, y + 7, 7, ink),
        writeLine({ left: a.left + 208, top: y + 14, width: 56, color: ink }),
      );

      // ---- grid, leaving room for coordinate labels and the notes block
      const notesH = 92;
      const bodyTop = y + 30;
      const bodyH = a.height - (bodyTop - a.top) - notesH;
      // Reserve a rail above and to the left for the 1–9 / A–I references, so
      // they sit in their own gutter instead of colliding with the timer row.
      const railGuess = railFor(Math.min(a.width, bodyH), ctx.gridSize);
      const slots = soloSlot(
        { left: a.left, top: bodyTop, width: a.width, height: bodyH },
        { rail: { top: railGuess, left: railGuess } },
      );

      const s = slots[0];
      chrome.push(
        ...coordLabels({
          slot: s, cells: ctx.gridSize, sides: ['top', 'left'],
          font, color: ink, rowsAsLetters: true,
        }),
      );

      // ---- notes
      const notesTop = a.top + a.height - notesH + 10;
      chrome.push(
        text('Notes:', {
          left: a.left, top: notesTop, width: 80,
          fontSize: 11, fontFamily: font, fill: ink,
        }),
      );
      for (let i = 0; i < 4; i++) {
        chrome.push(
          writeLine({
            left: a.left, top: notesTop + 22 + i * 15, width: a.width,
            style: 'dotted', color: '#9aa3ad', strokeWidth: 1,
          }),
        );
      }
      chrome.push(
        text('"Enjoy the challenge, embrace the process."', {
          left: a.left, top: a.top + a.height - 6, width: a.width,
          fontSize: 10.5, fontFamily: font, fill: ink,
          fontStyle: 'italic', textAlign: 'center',
        }),
      );

      return { chrome, slots };
    },
  };
}

// =======================================================  2. daily botanical
// Reference: "DAILY SUDOKU" with floral corners, date + day-of-week,
// a bordered difficulty card, and a timer block at the foot.

export function makeDailyBotanical(area: (c: TemplateContext) => {
  left: number; top: number; width: number; height: number; isRecto: boolean;
}): SudokuTemplate {
  return {
    id: 'journal-botanical',
    name: 'Daily — botanical',
    audience: 'classic',
    accessLevel: 'free',
    bestFor: [4, 9],
    supports: [1],
    description:
      'Soft botanical corners, date and day-of-week fields, a boxed difficulty card and a start/end/total timer.',
    preview: `<rect width="100" height="141" fill="#fdfcf7"/>
      <text x="50" y="14" font-size="7" text-anchor="middle" font-family="Verdana" fill="#555">DAILY SUDOKU</text>
      <path d="M78 4 C86 8 90 14 92 22" stroke="#b9c2b0" stroke-width="0.6" fill="none"/>
      <path d="M84 6 C88 10 89 15 89 20" stroke="#b9c2b0" stroke-width="0.5" fill="none"/>
      <text x="9" y="27" font-size="3.6" fill="#444">Date: __________</text>
      <text x="9" y="34" font-size="3.6" fill="#444">Day: [M T W T F S S]</text>
      <rect x="56" y="19" width="36" height="18" rx="2" fill="none" stroke="#666" stroke-width="0.5"/>
      <text x="74" y="25" font-size="4" text-anchor="middle" fill="#444">Difficulty</text>
      ${[0, 1, 2, 3, 4].map((i) => `<path d="M${60 + i * 6} 27.4 l1.05 2.13 2.35.34-1.7 1.66.4 2.34-2.1-1.11-2.1 1.11.4-2.34-1.7-1.66 2.35-.34z" fill="${i === 0 ? '#777' : 'none'}" stroke="#777" stroke-width="0.35"/>`).join('')}
      <rect x="13" y="43" width="74" height="74" fill="none" stroke="#222" stroke-width="1.5"/>
      ${[1, 2].map((i) => `<rect x="${13 + i * 24.7}" y="43" width="1" height="74" fill="#222"/><rect x="13" y="${43 + i * 24.7}" width="74" height="1" fill="#222"/>`).join('')}
      ${[1, 2, 4, 5, 7, 8].map((i) => `<rect x="${13 + i * 8.2}" y="43" width="0.35" height="74" fill="#222"/><rect x="13" y="${43 + i * 8.2}" width="74" height="0.35" fill="#222"/>`).join('')}
      <text x="60" y="126" font-size="4.5" fill="#444">Time:</text>
      <text x="52" y="132" font-size="3.4" fill="#444">Start __:__  End __:__</text>
      <text x="14" y="128" font-size="3.4" fill="#555" font-style="italic">"Just breathe,</text>
      <text x="14" y="133" font-size="3.4" fill="#555" font-style="italic">focus, and solve."</text>`,
    build: (ctx) => {
      const a = areaOf(ctx, area);
      const chrome: fabric.FabricObject[] = [];
      const font = ctx.font;
      const ink = ctx.ink;
      const W = ctx.page.width;
      const soft = '#8a9490';

      chrome.push(
        new fabric.Rect({
          left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
          fill: CREAM, selectable: true,
        }),
      );

      // title
      chrome.push(
        text(ctx.title.toUpperCase(), {
          left: a.left, top: a.top, width: a.width,
          fontSize: Math.round(W * 0.045), fontFamily: font,
          fill: INK_SOFT, textAlign: 'center', charSpacing: 90,
        }),
      );

      // Botanical corners. These sit in the page margin above and below the
      // content so they never collide with the header card or the grid.
      chrome.push(
        sprig({ left: a.left + a.width - 30, top: a.top + 22, size: 46, color: soft, angle: 118 }),
        sprig({ left: a.left + a.width - 8, top: a.top + 52, size: 30, color: soft, angle: 74, flip: true }),
        sprig({ left: a.left + 12, top: a.top + a.height - 26, size: 40, color: soft, angle: -58 }),
      );

      // date / day block
      let y = a.top + Math.round(W * 0.08);
      chrome.push(sparkle(a.left + 8, y - 4, 9, soft));
      chrome.push(
        ...fieldLine({
          label: 'Date:', left: a.left, top: y, width: a.width * 0.5,
          labelWidth: 34, font, fontSize: 11, color: ink,
        }),
      );
      y += 22;
      chrome.push(
        text('Day: [ M  T  W  T  F  S  S ]', {
          left: a.left, top: y, width: a.width * 0.55,
          fontSize: 11, fontFamily: font, fill: ink,
        }),
      );

      // difficulty card
      const cardX = a.left + a.width * 0.52;
      const cardW = a.width * 0.48;
      const cardY = a.top + Math.round(W * 0.06);
      const cardH = 62;
      chrome.push(
        new fabric.Rect({
          left: cardX, top: cardY, width: cardW, height: cardH,
          rx: 4, ry: 4, fill: null, stroke: soft, strokeWidth: 0.9,
        }),
        text('Difficulty', {
          left: cardX, top: cardY + 6, width: cardW,
          fontSize: 13, fontFamily: font, fill: ink, textAlign: 'center',
        }),
        ...starRow({
          left: cardX + cardW / 2 - (5 * 13 + 4 * 5) / 2, top: cardY + 24,
          size: 13, gap: 5, filled: starsFor(levelOf(ctx)), color: INK_SOFT,
        }),
        text(`No. ${puzzleNo(ctx) ?? '____'}`, {
          left: cardX + 8, top: cardY + 44, width: cardW * 0.45,
          fontSize: 9.5, fontFamily: font, fill: ink,
        }),
        text(`Level: ${levelOf(ctx) ?? '____'}`, {
          left: cardX + cardW * 0.5, top: cardY + 44, width: cardW * 0.45,
          fontSize: 9.5, fontFamily: font, fill: ink,
        }),
      );

      // grid
      const footH = 96;
      const bodyTop = Math.max(y + 26, cardY + cardH + 16);
      const slots = soloSlot({
        left: a.left, top: bodyTop,
        width: a.width, height: a.height - (bodyTop - a.top) - footH,
      });

      // footer: quote left, timer right
      const footTop = a.top + a.height - footH + 22;
      chrome.push(
        text('“Just breathe,\nfocus, and solve.”', {
          left: a.left + 4, top: footTop + 18, width: a.width * 0.42,
          fontSize: 11, fontFamily: font, fill: INK_SOFT,
          fontStyle: 'italic', textAlign: 'center', lineHeight: 1.35,
        }),
        text('Time:', {
          left: a.left + a.width * 0.45, top: footTop, width: a.width * 0.55,
          fontSize: 13, fontFamily: font, fill: ink, textAlign: 'center',
        }),
        clockIcon(a.left + a.width * 0.5, footTop + 28, 7, INK_SOFT),
        text('Start: __:__   End: __:__', {
          left: a.left + a.width * 0.53, top: footTop + 21, width: a.width * 0.45,
          fontSize: 10.5, fontFamily: font, fill: ink,
        }),
        clockIcon(a.left + a.width * 0.56, footTop + 50, 7, INK_SOFT),
        text('Total: ______ mins', {
          left: a.left + a.width * 0.59, top: footTop + 43, width: a.width * 0.4,
          fontSize: 10.5, fontFamily: font, fill: ink,
        }),
      );

      return { chrome, slots };
    },
  };
}

// ==========================================================  3. header band
// Reference: grey band across the top with DATE and TIME, big SUDOKU title
// with a difficulty scale, generous grid, sprig + quote footer.

export function makeHeaderBand(area: (c: TemplateContext) => {
  left: number; top: number; width: number; height: number; isRecto: boolean;
}): SudokuTemplate {
  return {
    id: 'journal-band',
    name: 'Header band',
    audience: 'minimal',
    accessLevel: 'free',
    bestFor: [4, 9, 16],
    supports: [1],
    description:
      'Tinted header strip with date and time fields, a three-level difficulty scale and a large uncluttered grid.',
    preview: `<rect width="100" height="141" fill="#faf9f6"/>
      <rect x="6" y="6" width="88" height="16" fill="#eceae4"/>
      <text x="12" y="16" font-size="3.8" fill="#444">DATE ___/___/___</text>
      <text x="56" y="16" font-size="3.8" fill="#444">TIME ________</text>
      <text x="11" y="34" font-size="8" font-family="Verdana" fill="#222">SUDOKU</text>
      <text x="55" y="30" font-size="3.8" fill="#444">DIFFICULTY ______</text>
      <text x="55" y="36" font-size="3" fill="#666">EASY ☆☆☆  MED ☆☆☆  HARD ☆☆☆</text>
      <rect x="11" y="42" width="78" height="78" fill="none" stroke="#111" stroke-width="1.7"/>
      ${[1, 2].map((i) => `<rect x="${11 + i * 26}" y="42" width="1.1" height="78" fill="#111"/><rect x="11" y="${42 + i * 26}" width="78" height="1.1" fill="#111"/>`).join('')}
      ${[1, 2, 4, 5, 7, 8].map((i) => `<rect x="${11 + i * 8.67}" y="42" width="0.4" height="78" fill="#111"/><rect x="11" y="${42 + i * 8.67}" width="78" height="0.4" fill="#111"/>`).join('')}
      <path d="M44 128 C48 124 52 124 56 127" stroke="#9aa89a" stroke-width="0.5" fill="none"/>
      <text x="50" y="136" font-size="3.6" text-anchor="middle" fill="#333" font-style="italic">Breathe. Focus.</text>`,
    build: (ctx) => {
      const a = areaOf(ctx, area);
      const chrome: fabric.FabricObject[] = [];
      const font = ctx.font;
      const ink = ctx.ink;
      const W = ctx.page.width;

      chrome.push(
        new fabric.Rect({
          left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
          fill: '#faf9f6', selectable: true,
        }),
      );

      // header band, bleeding to the page edges
      const bandH = 38;
      chrome.push(
        new fabric.Rect({
          left: 0, top: a.top - 8, width: ctx.page.width, height: bandH,
          fill: '#eceae4',
        }),
        sprig({ left: a.left + 8, top: a.top + bandH / 2 - 8, size: 20, color: '#8d9a86', angle: 18 }),
        text('DATE', {
          left: a.left + 22, top: a.top + 3, width: 40,
          fontSize: 11, fontFamily: font, fill: ink, charSpacing: 60,
        }),
        text('____ / ____ / ____', {
          left: a.left + 58, top: a.top + 3, width: 110,
          fontSize: 11, fontFamily: font, fill: ink,
        }),
        clockIcon(a.left + a.width * 0.56, a.top + 9, 7, ink),
        text('TIME', {
          left: a.left + a.width * 0.6, top: a.top + 3, width: 40,
          fontSize: 11, fontFamily: font, fill: ink, charSpacing: 60,
        }),
        writeLine({
          left: a.left + a.width * 0.6 + 38, top: a.top + 16,
          width: a.width * 0.4 - 38, color: ink,
        }),
      );

      // title + difficulty scale
      const ty = a.top + bandH + 12;
      chrome.push(
        text(ctx.title.toUpperCase(), {
          left: a.left, top: ty, width: a.width * 0.5,
          fontSize: Math.round(W * 0.058), fontFamily: font, fill: ink, charSpacing: 30,
        }),
        text('DIFFICULTY', {
          left: a.left + a.width * 0.5, top: ty + 2, width: a.width * 0.28,
          fontSize: 11, fontFamily: font, fill: ink, charSpacing: 40,
        }),
        writeLine({
          left: a.left + a.width * 0.5 + 78, top: ty + 14,
          width: a.width * 0.5 - 78, color: ink,
        }),
      );

      // EASY ☆☆☆  MED ☆☆☆  HARD ☆☆☆
      const scaleY = ty + 24;
      const level = (levelOf(ctx) ?? '').toLowerCase();
      const marks: [string, number][] = [['EASY', 1], ['MED', 3], ['HARD', 5]];
      // Lay the three EASY/MED/HARD marks out on a measured pitch so the star
      // triplets can never run into the next label.
      const starSz = 8;
      const starGp = 3.5;
      const tripletW = 3 * starSz + 2 * starGp;
      const labelW = 30;
      const groupW = labelW + 4 + tripletW;
      const scaleLeft = a.left + a.width * 0.5;
      const pitch = Math.max(groupW + 8, (a.width * 0.5) / marks.length);
      marks.forEach(([name, stars], gi) => {
        const on = level.startsWith(name.slice(0, 3).toLowerCase());
        const mx = scaleLeft + gi * pitch;
        chrome.push(
          text(name, {
            left: mx, top: scaleY, width: labelW,
            fontSize: 8.5, fontFamily: font, fill: on ? ink : INK_SOFT, charSpacing: 20,
          }),
          ...starRow({
            left: mx + labelW + 4, top: scaleY - 1,
            size: starSz, gap: starGp, count: 3,
            filled: on ? Math.min(3, stars) : 0, color: on ? ink : INK_SOFT,
          }),
        );
      });

      // grid
      const footH = 62;
      const bodyTop = scaleY + 22;
      const slots = soloSlot({
        left: a.left, top: bodyTop,
        width: a.width, height: a.height - (bodyTop - a.top) - footH,
      });

      // footer sprig + quote
      const fy = a.top + a.height - 34;
      chrome.push(
        sprig({ left: a.left + a.width / 2, top: fy - 4, size: 26, color: '#9aa89a', angle: -8 }),
        new fabric.Line([a.left + a.width * 0.06, fy + 22, a.left + a.width * 0.2, fy + 22], {
          stroke: ink, strokeWidth: 0.9,
        }),
        text('Breathe. Focus. One square at a time.', {
          left: a.left + a.width * 0.2, top: fy + 14, width: a.width * 0.6,
          fontSize: 12, fontFamily: font, fill: ink,
          fontStyle: 'italic', textAlign: 'center',
        }),
        new fabric.Line([a.left + a.width * 0.8, fy + 22, a.left + a.width * 0.94, fy + 22], {
          stroke: ink, strokeWidth: 0.9,
        }),
      );

      return { chrome, slots };
    },
  };
}

// =========================================================  4. typewriter
// Reference: bare left-aligned DATE / DIFF / NO fields, grid, then
// START/FINISH/TOTAL time lines and a serif quote.

export function makeTypewriter(area: (c: TemplateContext) => {
  left: number; top: number; width: number; height: number; isRecto: boolean;
}): SudokuTemplate {
  return {
    id: 'journal-typewriter',
    name: 'Typewriter',
    audience: 'minimal',
    accessLevel: 'free',
    bestFor: [4, 9, 16],
    supports: [1],
    description:
      'Stripped-back cream page — date, difficulty and number at the top, timer lines below. Maximum grid size.',
    preview: `<rect width="100" height="141" fill="#f7f5ee"/>
      <text x="10" y="14" font-size="4.4" fill="#333" font-family="Courier">DATE: ___/___/___</text>
      <text x="10" y="22" font-size="4" fill="#333" font-family="Courier">DIFF: ____</text>
      <text x="10" y="29" font-size="4" fill="#333" font-family="Courier">NO: ____</text>
      <rect x="10" y="34" width="80" height="80" fill="none" stroke="#222" stroke-width="1.5"/>
      ${[1, 2].map((i) => `<rect x="${10 + i * 26.7}" y="34" width="1" height="80" fill="#222"/><rect x="10" y="${34 + i * 26.7}" width="80" height="1" fill="#222"/>`).join('')}
      ${[1, 2, 4, 5, 7, 8].map((i) => `<rect x="${10 + i * 8.9}" y="34" width="0.35" height="80" fill="#222"/><rect x="10" y="${34 + i * 8.9}" width="80" height="0.35" fill="#222"/>`).join('')}
      <text x="10" y="122" font-size="3.6" fill="#333">START TIME: __:__</text>
      <text x="55" y="122" font-size="3.6" fill="#333">FINISH: __:__</text>
      <text x="45" y="129" font-size="3.6" fill="#333">TOTAL TIME: ______</text>
      <text x="50" y="137" font-size="3.4" text-anchor="middle" fill="#333" font-style="italic">Puzzles are the gym for the mind.</text>`,
    build: (ctx) => {
      const a = areaOf(ctx, area);
      const chrome: fabric.FabricObject[] = [];
      const font = ctx.font;
      const ink = ctx.ink;

      chrome.push(
        new fabric.Rect({
          left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
          fill: '#f7f5ee', selectable: true,
        }),
      );

      let y = a.top;
      chrome.push(
        text('DATE:  ____ / ____ / ____', {
          left: a.left, top: y, width: a.width,
          fontSize: 13, fontFamily: font, fill: ink, charSpacing: 30,
        }),
      );
      y += 30;
      chrome.push(
        text(`DIFF: ${levelOf(ctx) ? levelOf(ctx)!.toUpperCase() : '_____'}`, {
          left: a.left, top: y, width: a.width * 0.5,
          fontSize: 12, fontFamily: font, fill: ink, charSpacing: 30,
        }),
      );
      y += 18;
      chrome.push(
        text(`NO: ${puzzleNo(ctx) ?? '_____'}`, {
          left: a.left, top: y, width: a.width * 0.5,
          fontSize: 12, fontFamily: font, fill: ink, charSpacing: 30,
        }),
      );

      const footH = 78;
      const bodyTop = y + 26;
      const slots = soloSlot({
        left: a.left, top: bodyTop,
        width: a.width, height: a.height - (bodyTop - a.top) - footH,
      });

      const fy = a.top + a.height - footH + 14;
      chrome.push(
        text('START TIME: ___:___ ___', {
          left: a.left, top: fy, width: a.width * 0.5,
          fontSize: 11.5, fontFamily: font, fill: ink, charSpacing: 20,
        }),
        text('FINISH TIME: ___:___ ___', {
          left: a.left + a.width * 0.5, top: fy, width: a.width * 0.5,
          fontSize: 11.5, fontFamily: font, fill: ink, charSpacing: 20,
          textAlign: 'right',
        }),
        text('TOTAL TIME: ____________', {
          left: a.left, top: fy + 24, width: a.width,
          fontSize: 11.5, fontFamily: font, fill: ink, charSpacing: 20,
          textAlign: 'right',
        }),
        text('Puzzles are the gym for the mind. Keep it sharp.', {
          left: a.left, top: fy + 54, width: a.width,
          fontSize: 11, fontFamily: font, fill: ink,
          fontStyle: 'italic', textAlign: 'center',
        }),
      );

      return { chrome, slots };
    },
  };
}

// ======================================================  5. elegant daily
// Reference: leaf-flanked DAILY SUDOKU title, date with pencil, five stars,
// Easy/Medium/Hard tick boxes, hairline rule, ornament and folio.

export function makeElegantDaily(area: (c: TemplateContext) => {
  left: number; top: number; width: number; height: number; isRecto: boolean;
}): SudokuTemplate {
  return {
    id: 'journal-elegant',
    name: 'Daily — elegant',
    audience: 'classic',
    accessLevel: 'ad_unlock',
    bestFor: [4, 9],
    supports: [1],
    description:
      'Leaf-flanked title, pencil date field, star rating with Easy/Medium/Hard tick boxes and an ornament rule above the timer.',
    preview: `<rect width="100" height="141" fill="#fdfdfa"/>
      <text x="50" y="15" font-size="7.5" text-anchor="middle" font-family="Georgia">DAILY SUDOKU</text>
      <path d="M22 10 c3 -2 6 -1 7 2" stroke="#7f8f79" stroke-width="0.5" fill="none"/>
      <path d="M78 10 c-3 -2 -6 -1 -7 2" stroke="#7f8f79" stroke-width="0.5" fill="none"/>
      <text x="9" y="27" font-size="4" fill="#333">Date: ................</text>
      <text x="52" y="22" font-size="4" fill="#333">Difficulty:</text>
      ${[0, 1, 2, 3, 4].map((i) => `<path d="M${74 + i * 5} 18.4 l.9 1.8 2 .3-1.45 1.4.34 2-1.79-.94-1.79.94.34-2-1.45-1.4 2-.3z" fill="none" stroke="#333" stroke-width="0.3"/>`).join('')}
      <text x="52" y="30" font-size="3.8" fill="#333">☐ Easy / Medium ☐ Hard</text>
      <path d="M9 33 h82" stroke="#999" stroke-width="0.4"/>
      <rect x="9" y="37" width="82" height="82" fill="none" stroke="#333" stroke-width="1.4"/>
      ${[1, 2].map((i) => `<rect x="${9 + i * 27.3}" y="37" width="1" height="82" fill="#333"/><rect x="9" y="${37 + i * 27.3}" width="82" height="1" fill="#333"/>`).join('')}
      ${[1, 2, 4, 5, 7, 8].map((i) => `<rect x="${9 + i * 9.1}" y="37" width="0.35" height="82" fill="#555"/><rect x="9" y="${37 + i * 9.1}" width="82" height="0.35" fill="#555"/>`).join('')}
      <path d="M9 124 h35 M56 124 h35 M46 122 l2 2 l-2 2 l-2 -2 z" stroke="#333" stroke-width="0.4" fill="none"/>
      <text x="14" y="133" font-size="3.6" fill="#333">Time: .........</text>
      <text x="58" y="131" font-size="3.2" fill="#555" font-style="italic">Keep your mind sharp</text>
      <text x="50" y="139" font-size="3" text-anchor="middle" fill="#555">1</text>`,
    build: (ctx) => {
      const a = areaOf(ctx, area);
      const chrome: fabric.FabricObject[] = [];
      const font = ctx.font;
      const ink = ctx.ink;
      const W = ctx.page.width;
      const leaf = '#7f8f79';

      chrome.push(
        new fabric.Rect({
          left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
          fill: '#fdfdfa', selectable: true,
        }),
      );

      // title flanked by leaves
      const titleSize = Math.round(W * 0.052);
      chrome.push(
        text(ctx.title.toUpperCase(), {
          left: a.left, top: a.top, width: a.width,
          fontSize: titleSize, fontFamily: font, fill: ink,
          textAlign: 'center', charSpacing: 40,
        }),
        sprig({ left: a.left + a.width / 2 - titleSize * 4.4, top: a.top + titleSize * 0.55, size: 26, color: leaf, angle: -35 }),
        sprig({ left: a.left + a.width / 2 + titleSize * 4.4, top: a.top + titleSize * 0.55, size: 26, color: leaf, angle: 35, flip: true }),
      );

      // date with pencil
      let y = a.top + titleSize * 1.7;
      chrome.push(
        text('Date:', {
          left: a.left, top: y + 10, width: 38,
          fontSize: 12, fontFamily: font, fill: ink,
        }),
        writeLine({
          left: a.left + 36, top: y + 22, width: a.width * 0.42 - 36,
          style: 'dotted', color: ink, strokeWidth: 1.1,
        }),
        pencilIcon(a.left + a.width * 0.45, y + 15, 13, ink),
      );

      // difficulty stars + tick boxes
      chrome.push(
        text('Difficulty:', {
          left: a.left + a.width * 0.5, top: y, width: 74,
          fontSize: 12, fontFamily: font, fill: ink,
        }),
        ...starRow({
          left: a.left + a.width * 0.5 + 76, top: y - 1, size: 12, gap: 3,
          filled: starsFor(levelOf(ctx)), color: ink,
        }),
        checkbox(a.left + a.width * 0.5, y + 22, 10, ink),
        text('Easy / Medium', {
          left: a.left + a.width * 0.5 + 15, top: y + 21, width: 100,
          fontSize: 12, fontFamily: font, fill: ink,
        }),
        checkbox(a.left + a.width * 0.5 + 110, y + 22, 10, ink),
        text('Hard', {
          left: a.left + a.width * 0.5 + 125, top: y + 21, width: 50,
          fontSize: 12, fontFamily: font, fill: ink,
        }),
      );

      // hairline under the header
      y += 44;
      chrome.push(
        new fabric.Line([a.left, y, a.left + a.width, y], {
          stroke: '#b9bfc6', strokeWidth: 0.7,
        }),
      );

      // grid
      const footH = 92;
      const bodyTop = y + 14;
      const slots = soloSlot({
        left: a.left, top: bodyTop,
        width: a.width, height: a.height - (bodyTop - a.top) - footH,
      });

      // ornament, timer, quote, folio
      const fy = a.top + a.height - footH + 22;
      chrome.push(
        ...ornamentRule({ centerX: a.left + a.width / 2, top: fy, width: a.width, color: '#6b7280' }),
        clockIcon(a.left + 12, fy + 26, 8, ink),
        text('Time:', {
          left: a.left + 26, top: fy + 19, width: 60,
          fontSize: 12, fontFamily: font, fill: ink,
        }),
        writeLine({
          left: a.left + 26, top: fy + 40, width: a.width * 0.34,
          style: 'dotted', color: ink, strokeWidth: 1.1,
        }),
        text('Keep your mind sharp, one cell\nat a time. Enjoy the journey!', {
          left: a.left + a.width * 0.5, top: fy + 20, width: a.width * 0.5,
          fontSize: 10.5, fontFamily: font, fill: '#4b5563',
          fontStyle: 'italic', textAlign: 'right', lineHeight: 1.4,
        }),
        sprig({ left: a.left + a.width * 0.42, top: fy + 48, size: 18, color: leaf, angle: 20 }),
      );

      if (ctx.folio !== undefined) {
        chrome.push(
          text(String(ctx.folio), {
            left: a.left, top: a.top + a.height - 8, width: a.width,
            fontSize: 10, fontFamily: font, fill: INK_SOFT, textAlign: 'center',
          }),
        );
      }

      return { chrome, slots };
    },
  };
}

// =====================================================  6. numbered card
// Reference: DATE / NO. header, "Sudoku Puzzle" caption, coordinates on all
// four sides, then DIFFICULTY and a three-line TIME block, QUOTE at the foot.

export function makeNumberedCard(area: (c: TemplateContext) => {
  left: number; top: number; width: number; height: number; isRecto: boolean;
}): SudokuTemplate {
  return {
    id: 'journal-card',
    name: 'Numbered card',
    audience: 'classic',
    accessLevel: 'premium_only',
    bestFor: [4, 9, 16],
    supports: [1],
    description:
      'Reference numbers on all four sides of the grid, date and puzzle number, a three-line time log and a quote panel.',
    preview: `<rect width="100" height="141" fill="#fbfaf6"/>
      <text x="12" y="16" font-size="4" fill="#333">DATE _________</text>
      <text x="64" y="16" font-size="4" fill="#333">NO. _____</text>
      <path d="M8 10 c3 -2 6 -1 7 2" stroke="#8a9a84" stroke-width="0.5" fill="none"/>
      <text x="12" y="28" font-size="5.5" font-family="Georgia" fill="#222">Sudoku Puzzle</text>
      <g font-size="2.8" fill="#555">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => `<text x="${21 + i * 7.8}" y="33" text-anchor="middle">${n}</text>`).join('')}</g>
      <g font-size="2.8" fill="#555">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => `<text x="15" y="${41 + i * 7.8}" text-anchor="middle">${n}</text>`).join('')}<g>${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => `<text x="90" y="${41 + i * 7.8}" text-anchor="middle">${n}</text>`).join('')}</g></g>
      <rect x="17.5" y="35" width="70" height="70" fill="none" stroke="#222" stroke-width="1.4"/>
      ${[1, 2].map((i) => `<rect x="${17.5 + i * 23.3}" y="35" width="1" height="70" fill="#222"/><rect x="17.5" y="${35 + i * 23.3}" width="70" height="1" fill="#222"/>`).join('')}
      ${[1, 2, 4, 5, 7, 8].map((i) => `<rect x="${17.5 + i * 7.8}" y="35" width="0.3" height="70" fill="#666"/><rect x="17.5" y="${35 + i * 7.8}" width="70" height="0.3" fill="#666"/>`).join('')}
      <g font-size="2.8" fill="#555">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n, i) => `<text x="${21 + i * 7.8}" y="110" text-anchor="middle">${n}</text>`).join('')}</g>
      <text x="11" y="118" font-size="3.8" fill="#333">DIFFICULTY: ________</text>
      <text x="11" y="125" font-size="3.4" fill="#333">START ____  END ____</text>
      <text x="50" y="136" font-size="3.4" text-anchor="middle" fill="#444" font-style="italic">A quiet moment.</text>`,
    build: (ctx) => {
      const a = areaOf(ctx, area);
      const chrome: fabric.FabricObject[] = [];
      const font = ctx.font;
      const ink = ctx.ink;
      const W = ctx.page.width;

      chrome.push(
        new fabric.Rect({
          left: 0, top: 0, width: ctx.page.width, height: ctx.page.height,
          fill: '#fbfaf6', selectable: true,
        }),
      );

      // header
      chrome.push(
        sprig({ left: a.left + 7, top: a.top + 6, size: 20, color: '#8a9a84', angle: -20 }),
        text('DATE', {
          left: a.left + 20, top: a.top + 2, width: 44,
          fontSize: 11, fontFamily: font, fill: ink, charSpacing: 40,
        }),
        writeLine({ left: a.left + 56, top: a.top + 15, width: a.width * 0.33, color: ink }),
        text('NO.', {
          left: a.left + a.width * 0.66, top: a.top + 2, width: 30,
          fontSize: 11, fontFamily: font, fill: ink, charSpacing: 40,
        }),
        writeLine({
          left: a.left + a.width * 0.66 + 26, top: a.top + 15,
          width: a.width * 0.34 - 26, color: ink,
        }),
      );

      // caption
      const capY = a.top + 34;
      chrome.push(
        text('Sudoku Puzzle', {
          left: a.left, top: capY, width: a.width * 0.6,
          fontSize: Math.round(W * 0.038), fontFamily: font, fill: ink,
        }),
      );

      // grid, inset so all four label rails fit
      const footH = 186;
      const bodyTop = capY + 26;
      const bodyH = a.height - (bodyTop - a.top) - footH;
      // labels ring the grid on all four sides, so reserve a rail all round
      const rail = railFor(Math.min(a.width, bodyH), ctx.gridSize);
      const slots = soloSlot(
        { left: a.left, top: bodyTop, width: a.width, height: bodyH },
        { rail: { top: rail, bottom: rail, left: rail, right: rail } },
      );

      const s = slots[0];
      chrome.push(
        ...coordLabels({
          slot: s, cells: ctx.gridSize,
          sides: ['top', 'bottom', 'left', 'right'],
          font, color: INK_SOFT, rowsAsLetters: false,
        }),
      );

      // difficulty + time log
      const fy = a.top + a.height - footH + 34;
      chrome.push(
        text('DIFFICULTY:', {
          left: a.left, top: fy, width: 92,
          fontSize: 11.5, fontFamily: font, fill: ink, charSpacing: 30,
        }),
        writeLine({ left: a.left + 92, top: fy + 13, width: a.width * 0.42, color: ink }),
        text('TIME', {
          left: a.left, top: fy + 26, width: 60,
          fontSize: 11.5, fontFamily: font, fill: ink, charSpacing: 40,
        }),
      );
      const rows = ['START TIME:', 'END TIME:', 'TOTAL TIME:'];
      rows.forEach((label, i) => {
        const ry = fy + 44 + i * 18;
        chrome.push(
          text(label, {
            left: a.left, top: ry, width: 84,
            fontSize: 10.5, fontFamily: font, fill: ink, charSpacing: 20,
          }),
          writeLine({ left: a.left + 84, top: ry + 12, width: a.width * 0.38, color: ink }),
        );
      });

      // quote panel — sits below the last time row with clear air
      const qy = fy + 44 + rows.length * 18 + 16;
      chrome.push(
        new fabric.Line([a.left + a.width * 0.2, qy, a.left + a.width * 0.4, qy], {
          stroke: ink, strokeWidth: 0.8,
        }),
        text('QUOTE', {
          left: a.left + a.width * 0.4, top: qy - 7, width: a.width * 0.2,
          fontSize: 10, fontFamily: font, fill: ink, textAlign: 'center', charSpacing: 60,
        }),
        new fabric.Line([a.left + a.width * 0.6, qy, a.left + a.width * 0.8, qy], {
          stroke: ink, strokeWidth: 0.8,
        }),
        text('A quiet moment to sharpen the mind.', {
          left: a.left, top: qy + 8, width: a.width,
          fontSize: 12, fontFamily: font, fill: '#3f4650',
          fontStyle: 'italic', textAlign: 'center',
        }),
      );

      return { chrome, slots };
    },
  };
}

export const JOURNAL_TEMPLATE_FACTORIES = [
  makeClassicWorksheet,
  makeDailyBotanical,
  makeHeaderBand,
  makeTypewriter,
  makeElegantDaily,
  makeNumberedCard,
];

/** Ids owned by this file, used by the layout engine. */

export { RULE };
