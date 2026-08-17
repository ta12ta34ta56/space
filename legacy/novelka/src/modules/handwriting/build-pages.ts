import * as fabric from 'fabric';
import { nanoid } from 'nanoid';
import { objectsToPageData } from '../shared/puzzle-utils';
import type { Page } from '../../types/canvas.types';
import {
  generateWorksheets, placeGlyph, buildRow,
  type HandwritingOptions, type WorksheetPage,
} from './generator';
import { renderRow, renderGlyph, type HandwritingStyle } from './renderer';
import { getHwTemplate, WHOLE_ALPHABET_DESIGNS, type HwTemplateContext } from './templates';
import { wordFor, phraseFor } from './word-banks';

/**
 * Worksheets -> finished pages.
 *
 * The template decides where rows go; the generator fills those rectangles.
 * That split is what lets any design work at any trim size without each
 * template re-implementing layout maths.
 */

export interface HwLayoutOptions {
  templateId: string;
  kdpSafe: boolean;
  margin: number;
  title: string;
  showFolio: boolean;
  /** add a cover-ish heading page before the letters */
  includeTitlePage: boolean;
  /** index into the word bank, so a book can use Ant instead of Apple */
  wordVariant: number;
}

export const DEFAULT_HW_LAYOUT: HwLayoutOptions = {
  templateId: 'classic',
  kdpSafe: true,
  margin: 54,
  title: 'Handwriting Practice',
  showFolio: true,
  includeTitlePage: false,
  wordVariant: 0,
};

/** Marks pages this module owns, so they can be re-laid later. */
export const HW_PAGE = 'novelka:handwriting-page';

export interface HwPageMeta {
  kind: 'worksheet' | 'title';
  char: string;
  templateId: string;
  rows: number;
  charset: string;
  /** the traced copies per row, needed to rebuild identically */
  tracePerRow: number;
  style: TraceStyleName;
}

type TraceStyleName = HandwritingOptions['style'];

const HW_PAGE_LEGACY_MINIPDF = 'minipdf:handwriting-page';
const HW_PAGE_LEGACY_GRIDPRESS = 'gridpress:handwriting-page';

export function hwMetaOf(page: Page): HwPageMeta | null {
  const d = page.data as Record<string, unknown> | null;
  return (d?.[HW_PAGE] as HwPageMeta | undefined)
    ?? (d?.[HW_PAGE_LEGACY_MINIPDF] as HwPageMeta | undefined)
    ?? (d?.[HW_PAGE_LEGACY_GRIDPRESS] as HwPageMeta | undefined)
    ?? null;
}

export interface HwBuildResult {
  pages: Page[];
  charCount: number;
}

/**
 * Mixed letters for the "find and circle" hunt grid.
 *
 * Deterministic per character so regenerating the same book twice produces the
 * same worksheet — a parent who prints page 4 again must get page 4.
 */
function huntGrid(
  target: string,
  slot: { left: number; top: number; width: number; height: number },
  style: HandwritingStyle,
  id: string,
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  const cols = 8;
  const rows = 4;
  const cw = slot.width / cols;
  const rh = slot.height / rows;
  const fs = Math.min(cw, rh) * 0.55;

  // Simple deterministic PRNG seeded from the character.
  let seed = target.charCodeAt(0) * 9301 + 49297;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.replace(target.toUpperCase(), '');
  const total = cols * rows;
  // Roughly a quarter of the grid is the target, so it is findable but not
  // trivial. Too few and a child gives up; too many and there is no hunt.
  const targetCount = Math.max(4, Math.round(total * 0.25));
  const cells: string[] = [];
  for (let i = 0; i < total; i++) {
    cells.push(i < targetCount ? target : pool[Math.floor(rand() * pool.length)]);
  }
  // shuffle
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }

  cells.forEach((ch, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const t = new fabric.Textbox(ch, {
      left: slot.left + c * cw,
      top: slot.top + r * rh + (rh - fs) / 2,
      width: cw,
      fontSize: fs,
      fontFamily: style.fontFamily,
      fill: style.guideColor,
      textAlign: 'center',
      objectCaching: false,
    });
    (t as unknown as Record<string, unknown>).hwRole = 'hw-hunt-letter';
    (t as unknown as Record<string, unknown>).hwPuzzle = id;
    (t as unknown as Record<string, unknown>).moduleId = 'handwriting';
    out.push(t);
  });
  return out;
}

/** The giant outline letter for colour-in and dot-to-dot designs. */
function heroLetter(
  char: string,
  slot: { left: number; top: number; height: number },
  pageWidth: number,
  style: HandwritingStyle,
  id: string,
  mode: 'outline' | 'dots',
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  // Centre it: placeGlyph returns width from the letterform's own aspect, so
  // measure first, then shift.
  const probe = placeGlyph(char, 0, 0, slot.height, { style: 'outline' }, true);
  if (!probe) return out;
  const left = slot.left + (pageWidth - slot.left * 2 - probe.width) / 2;
  const g = placeGlyph(char, left, slot.top, slot.height, { style: 'outline' }, true);
  if (!g) return out;

  if (mode === 'outline') {
    out.push(...renderGlyph(g, { ...style, traceWidth: 2.6, traceColor: '#aab3c0' }, id));
    return out;
  }

  // dot-to-dot: numbered dots along each stroke, not a continuous line
  let n = 1;
  for (const path of g.paths) {
    // Sample ~9 dots per stroke, evenly by index. More becomes tracing; fewer
    // loses the letter's shape.
    const count = Math.max(4, Math.min(12, Math.round(path.length / 9)));
    for (let i = 0; i < count; i++) {
      const p = path[Math.round((i / (count - 1)) * (path.length - 1))];
      const dot = new fabric.Circle({
        left: p.x, top: p.y, radius: 2.6,
        fill: style.guideColor,
        originX: 'center', originY: 'center', objectCaching: false,
      });
      (dot as unknown as Record<string, unknown>).hwRole = 'hw-dot';
      (dot as unknown as Record<string, unknown>).hwPuzzle = id;
      out.push(dot);

      const label = new fabric.Textbox(String(n++), {
        left: p.x + 8, top: p.y - 6, width: 20,
        fontSize: 9, fontFamily: style.fontFamily, fill: style.arrowColor,
        objectCaching: false,
      });
      (label as unknown as Record<string, unknown>).hwRole = 'hw-dot-num';
      (label as unknown as Record<string, unknown>).hwPuzzle = id;
      out.push(label);
    }
  }
  return out;
}


/**
 * Write the letter into each row of an alphabet grid's shaded column.
 *
 * The grid design shows a RUN of letters on one page, not a single character,
 * so it starts from the current letter and continues down the alphabet.
 */
function gridLabels(
  col: { left: number; width: number; top: number; rowHeight: number; rows: number },
  chars: string[],
  startIndex: number,
  style: HandwritingStyle,
  id: string,
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  const fs = Math.min(col.width * 0.34, col.rowHeight * 0.52);
  for (let i = 0; i < col.rows; i++) {
    const ch = chars[(Math.max(0, startIndex) + i) % chars.length];
    const t = new fabric.Textbox(`${ch.toUpperCase()} ${ch.toLowerCase()}`, {
      left: col.left,
      top: col.top + i * col.rowHeight + (col.rowHeight - fs * 1.2) / 2,
      width: col.width,
      fontSize: fs,
      fontFamily: style.fontFamily,
      fill: '#1f2937',
      textAlign: 'center',
      fontWeight: '700',
      objectCaching: false,
    });
    (t as unknown as Record<string, unknown>).hwRole = 'hw-grid-label';
    (t as unknown as Record<string, unknown>).hwPuzzle = id;
    (t as unknown as Record<string, unknown>).moduleId = 'handwriting';
    out.push(t);
  }
  return out;
}

/**
 * Two boxed columns of letters to join with a pencil line.
 *
 * The right column is shuffled deterministically, so the same page always
 * prints the same puzzle — a parent reprinting page 3 must get page 3.
 */
function matchExercise(
  box: { left: number; top: number; width: number; height: number },
  style: HandwritingStyle,
  id: string,
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  const letters = 'ABCDEFGHIJKLM'.split('');
  const n = letters.length;
  const rowH = box.height / n;
  const boxW = Math.min(38, box.width * 0.13);
  const boxH = Math.min(rowH * 0.72, 26);
  const fs = boxH * 0.62;

  let seed = 12345;
  const rand = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const right = letters.map((c) => c.toLowerCase());
  for (let i = right.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [right[i], right[j]] = [right[j], right[i]];
  }

  const cell = (ch: string, x: number, y: number) => {
    const r = new fabric.Rect({
      left: x, top: y, width: boxW, height: boxH,
      fill: null, stroke: '#1f2937', strokeWidth: 1.1, rx: 3, ry: 3,
      objectCaching: false,
    });
    const t = new fabric.Textbox(ch, {
      left: x, top: y + (boxH - fs * 1.15) / 2, width: boxW,
      fontSize: fs, fontFamily: style.fontFamily, fill: '#1f2937',
      textAlign: 'center', objectCaching: false,
    });
    for (const o of [r, t]) {
      (o as unknown as Record<string, unknown>).hwRole = 'hw-match-cell';
      (o as unknown as Record<string, unknown>).hwPuzzle = id;
      (o as unknown as Record<string, unknown>).moduleId = 'handwriting';
    }
    return [r, t];
  };

  const leftX = box.left + box.width * 0.16;
  const rightX = box.left + box.width * 0.66;
  for (let i = 0; i < n; i++) {
    const y = box.top + i * rowH + (rowH - boxH) / 2;
    out.push(...cell(letters[i], leftX, y));
    out.push(...cell(right[i], rightX, y));
  }
  return out;
}

/** Build every worksheet page. */
export function buildHandwritingPages(
  opts: HandwritingOptions,
  layout: HwLayoutOptions,
  style: HandwritingStyle,
  size: { width: number; height: number },
  startPageNumber = 1,
): HwBuildResult {
  const { width, height } = size;
  const tpl = getHwTemplate(layout.templateId);
  const pages: Page[] = [];

  // A first pass tells us how many pages there will be, which the KDP gutter
  // calculation needs. Without it, page 1 of a 62-page book gets the margin of
  // a 24-page book and the inner edge is too tight to bind.
  const charCount = generateWorksheets(
    opts,
    { left: 0, top: 0, width, height },
    60, 20,
  ).pages.length;
  const estTotal = charCount + (layout.includeTitlePage ? 1 : 0);

  let pageNo = startPageNumber;

  if (layout.includeTitlePage) {
    const page: Page = {
      id: nanoid(8), name: 'Title', width, height, background: '#ffffff', data: null,
    };
    const objs: fabric.FabricObject[] = [
      new fabric.Textbox(layout.title, {
        left: width * 0.12, top: height * 0.38, width: width * 0.76,
        fontSize: Math.min(44, width * 0.09),
        fontFamily: style.fontFamily, fill: '#111827',
        textAlign: 'center', fontWeight: '700', objectCaching: false,
      }),
      new fabric.Textbox('This book belongs to', {
        left: width * 0.12, top: height * 0.52, width: width * 0.76,
        fontSize: 12, fontFamily: style.fontFamily, fill: '#8a93a3',
        textAlign: 'center', objectCaching: false,
      }),
      new fabric.Line(
        [width * 0.22, height * 0.60, width * 0.78, height * 0.60],
        { stroke: '#c3cad6', strokeWidth: 1, objectCaching: false },
      ),
    ];
    pages.push({
      ...page,
      role: 'interior',
      kind: 'handwriting' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [HW_PAGE]: {
          kind: 'title', char: '', templateId: layout.templateId,
          rows: 0, charset: opts.charset, tracePerRow: 0, style: opts.style,
        } satisfies HwPageMeta,
      },
    });
    pageNo++;
  }

  // Second pass: build each worksheet inside its template's own slots.
  const chars = generateWorksheets(
    opts, { left: 0, top: 0, width, height }, 60, 20,
  ).pages.map((p: WorksheetPage) => p.char);

  // Grid and matching designs cover the whole alphabet on a single sheet, so
  // building one page per letter would emit 26 near-identical pages.
  const wholeAlphabet = WHOLE_ALPHABET_DESIGNS.includes(layout.templateId);
  const pageChars = wholeAlphabet ? chars.slice(0, 1) : chars;

  for (const char of pageChars) {
    const page: Page = {
      id: nanoid(8), name: `Letter ${char}`, width, height,
      background: '#ffffff', data: null,
    };
    const puzzleId = nanoid(8);
    const word = wordFor(char, layout.wordVariant);

    const tctx: HwTemplateContext = {
      page,
      pageNumber: pageNo,
      pageCount: estTotal,
      title: opts.charset === 'both' ? `${char} ${char.toLowerCase()}` : char,
      char,
      rows: opts.rows,
      font: style.fontFamily,
      kdpSafe: layout.kdpSafe,
      folio: layout.showFolio ? pageNo : undefined,
      ink: '#111827',
      accent: '#2b7fb8',
      word,
      phrase: word ? phraseFor(char, word) : undefined,
    };

    const built = tpl.build(tctx);
    const objs: fabric.FabricObject[] = [...built.chrome];

    // Tag the chrome so a later re-layout can tell it apart from the puzzle.
    for (const o of built.chrome) {
      const any = o as unknown as Record<string, unknown>;
      any.moduleId = 'handwriting';
      if (!any.hwRole) any.hwRole = 'hw-chrome';
      any.hwPuzzle = puzzleId;
    }

    // Design-specific extras.
    if (built.labelColumn) {
      objs.push(...gridLabels(built.labelColumn, chars, chars.indexOf(char), style, puzzleId));
    }
    if (built.matchColumns) {
      objs.push(...matchExercise(built.matchColumns, style, puzzleId));
    }
    if (built.heroLetter) {
      objs.push(...heroLetter(
        char, built.heroLetter, width, style, puzzleId,
        layout.templateId === 'dot-to-dot' ? 'dots' : 'outline',
      ));
    }
    if (layout.templateId === 'find-letter' && built.imageSlots[0]) {
      objs.push(...huntGrid(char, built.imageSlots[0], style, puzzleId));
    }

    // Practice rows. 'both' alternates capital / lowercase down the page;
    // word-practice traces the whole example word instead of one letter.
    //
    // On a whole-alphabet grid each ROW is a different letter, matching the
    // label column beside it. Repeating the page's character down every row
    // would print "A A A A" thirteen times.
    const startIdx = Math.max(0, chars.indexOf(char));
    built.rows.forEach((slot, i) => {
      const rowChar = wholeAlphabet
        ? chars[(startIdx + i) % chars.length]
        : (opts.charset === 'both' && i % 2 === 1 ? char.toLowerCase() : char);

      if (layout.templateId === 'word-practice' && word) {
        objs.push(...renderWordRow(word, slot, style, opts, puzzleId));
        return;
      }

      const row = buildRow(rowChar, slot, opts);
      objs.push(...renderRow(
        row, slot.left, slot.width, style, puzzleId,
        opts.strokeArrows && i === 0,
      ));
    });

    pages.push({
      ...page,
      role: 'interior',
      kind: 'handwriting' as const,
      data: {
        ...objectsToPageData(objs, width, height, '#ffffff'),
        [HW_PAGE]: {
          kind: 'worksheet',
          char,
          templateId: layout.templateId,
          rows: opts.rows,
          charset: opts.charset,
          tracePerRow: opts.tracePerRow,
          style: opts.style,
        } satisfies HwPageMeta,
      },
    });
    pageNo++;
  }

  return { pages, charCount: chars.length };
}

/**
 * A row that traces a whole word rather than a repeated letter.
 *
 * Letters advance by their own widths, so `Apple` spaces correctly instead of
 * sitting in a monospace grid.
 */
function renderWordRow(
  word: string,
  slot: { left: number; top: number; width: number; height: number },
  style: HandwritingStyle,
  opts: HandwritingOptions,
  id: string,
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  const probeRow = buildRow(word[0] ?? 'A', slot, { ...opts, tracePerRow: 0 });
  out.push(...renderRowGuidesOnly(probeRow, slot, style, id));

  const letterGap = slot.height * 0.05;
  const wordGap = slot.height * 0.22;

  let x = slot.left;
  let copy = 0;
  for (;;) {
    // Measure this copy of the word before committing to it, so a half word
    // never runs off the edge.
    let w = 0;
    for (const ch of word) {
      const g = placeGlyph(ch, 0, 0, slot.height, opts, false);
      if (g) w += g.width + letterGap;
    }
    if (x + w > slot.left + slot.width) break;

    for (const ch of word) {
      const g = placeGlyph(ch, x, slot.top, slot.height, opts, copy < 1);
      if (!g) continue;
      out.push(...renderGlyph(g, style, id, copy));
      x += g.width + letterGap;
    }
    x += wordGap;
    copy++;
    if (copy > 12) break;
  }
  return out;
}

function renderRowGuidesOnly(
  row: ReturnType<typeof buildRow>,
  slot: { left: number; width: number },
  style: HandwritingStyle,
  id: string,
): fabric.FabricObject[] {
  return renderRow({ ...row, glyphs: [] }, slot.left, slot.width, style, id, false);
}
