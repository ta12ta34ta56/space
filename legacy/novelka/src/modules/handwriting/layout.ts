import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { hwMetaOf, HW_PAGE, type HwPageMeta } from './build-pages';
import { getHwTemplate, WHOLE_ALPHABET_DESIGNS } from './templates';
import { UPPERCASE, LOWERCASE, NUMERALS } from './letterforms';
import { buildRow, placeGlyph, type HandwritingOptions } from './generator';
import { renderRow, type HandwritingStyle } from './renderer';
import { applyPatcherToModulePages, forEachObjectDeep } from '../shared/live-style';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';

/**
 * Live re-layout for handwriting pages.
 *
 * Template-aware from the start: the design's own row slots are the authority,
 * exactly as in word search and crossword. The earlier Sudoku approach of
 * re-centring with a generic algorithm ignored the template and walked content
 * out from under the decoration, and had to be rewritten.
 *
 * Rebuilding is cheap here — a row is regenerated from the character rather
 * than measured and nudged — so repeated slider drags converge instead of
 * drifting.
 */

export interface HwLayoutSpec {
  /** ascender→descender height of each row, in points */
  rowHeight: number;
  rows: number;
  tracePerRow: number;
  traceColor: string;
  guideColor: string;
  traceWidth: number;
  guideWidth: number;
  guideStyle: HandwritingStyle['guideStyle'];
  showStrokeNumbers: boolean;
  strokeArrows: boolean;
  startDots: boolean;
  style: HandwritingOptions['style'];
  kdpSafe: boolean;
  offsetY: number;
}

type Any = Record<string, unknown>;
const roleOf = (o: fabric.FabricObject) => (o as unknown as Any).hwRole as string | undefined;
const puzzleOf = (o: fabric.FabricObject) => (o as unknown as Any).hwPuzzle as string | undefined;

/** Objects this module owns, split into chrome and re-buildable content. */
export function hwGroupsOf(objects: fabric.FabricObject[]) {
  const content: fabric.FabricObject[] = [];
  const chrome: fabric.FabricObject[] = [];
  for (const o of objects) {
    if (!puzzleOf(o)) continue;
    const role = roleOf(o) ?? '';
    // Chrome is the template frame: titles, rules, placeholders, hunt grids.
    // Everything else is generated content we can safely discard and rebuild.
    if (role === 'hw-chrome' || role.startsWith('hw-hunt') || role.startsWith('hw-dot')) {
      chrome.push(o);
    } else {
      content.push(o);
    }
  }
  return { content, chrome };
}

/** The template's row slots for the current page and spec. */
export function hwRowSlots(
  page: Page,
  pageNumber: number,
  pageCount: number,
  meta: HwPageMeta,
  spec: HwLayoutSpec,
) {
  const tpl = getHwTemplate(meta.templateId);
  const { rows } = tpl.build({
    page,
    pageNumber,
    pageCount,
    title: meta.char,
    char: meta.char,
    rows: spec.rows,
    font: 'Inter',
    kdpSafe: spec.kdpSafe,
    ink: '#111827',
    accent: '#2b7fb8',
  });
  return rows;
}

/**
 * The largest row height this design can host.
 *
 * The template's own slot is the ceiling. Using a generic formula here is what
 * made the top half of the size slider dead on decorated pages in word search.
 */
export function hwMaxRowHeight(
  page: Page,
  pageNumber: number,
  pageCount: number,
  meta: HwPageMeta,
  spec: HwLayoutSpec,
): number {
  const slots = hwRowSlots(page, pageNumber, pageCount, meta, spec);
  if (!slots.length) return 120;
  return Math.max(40, Math.floor(Math.min(...slots.map((s) => s.height))));
}

/** Rebuild every practice row on a canvas from the stored character. */
export function hwRelayoutCanvas(
  canvas: fabric.Canvas,
  page: Page,
  pageNumber: number,
  pageCount: number,
  meta: HwPageMeta,
  spec: HwLayoutSpec,
  style: HandwritingStyle,
): number {
  flattenPuzzleGroups(canvas);
  const { content } = hwGroupsOf(canvas.getObjects());
  if (!content.length) {
    groupPuzzleUnits(canvas);
    return 0;
  }

  const puzzleId = puzzleOf(content[0])!;
  const slots = hwRowSlots(page, pageNumber, pageCount, meta, spec);
  if (!slots.length) {
    groupPuzzleUnits(canvas);
    return 0;
  }

  // Regenerating is simpler and more reliable than moving existing objects:
  // the row content depends on the height (a taller row fits fewer letters),
  // so nudging cannot produce the right answer.
  for (const o of content) canvas.remove(o);

  const opts: HandwritingOptions = {
    charset: meta.charset as HandwritingOptions['charset'],
    rows: spec.rows,
    tracePerRow: spec.tracePerRow,
    strokeArrows: spec.strokeArrows,
    startDots: spec.startDots,
    style: spec.style,
  };

  const liveStyle: HandwritingStyle = {
    ...style,
    traceColor: spec.traceColor,
    guideColor: spec.guideColor,
    traceWidth: spec.traceWidth,
    guideWidth: spec.guideWidth,
    guideStyle: spec.guideStyle,
    showStrokeNumbers: spec.showStrokeNumbers,
  };

  let added = 0;
  slots.forEach((slot, i) => {
    const height = Math.min(spec.rowHeight, slot.height);
    // Keep the row centred in the slot it was given, so shrinking does not
    // strand it against the top rule.
    const top = slot.top + (slot.height - height) / 2 + spec.offsetY;
    // A whole-alphabet grid puts a different letter on every row; re-laying it
    // with the page's single character would collapse it to "A A A A" repeated.
    const alphabet = meta.charset === 'numbers' ? NUMERALS
      : meta.charset === 'lower' ? LOWERCASE : UPPERCASE;
    const startIdx = Math.max(0, alphabet.indexOf(meta.char));
    const rowChar = WHOLE_ALPHABET_DESIGNS.includes(meta.templateId)
      ? alphabet[(startIdx + i) % alphabet.length]
      : (meta.charset === 'both' && i % 2 === 1 ? meta.char.toLowerCase() : meta.char);

    const row = buildRow(rowChar, { left: slot.left, width: slot.width, top, height }, opts);
    const objs = renderRow(
      row, slot.left, slot.width, liveStyle, puzzleId,
      spec.strokeArrows && i === 0,
    );
    for (const o of objs) {
      canvas.add(o);
      added++;
    }
  });

  groupPuzzleUnits(canvas);
  canvas.requestRenderAll();
  return added;
}

const EXTRA = [
  'id', 'elementType', 'name', 'locked', 'moduleId', 'hwRole', 'hwPuzzle',
];

/**
 * Apply a spec to every handwriting page of the same design, off-screen.
 * Each page keeps its own character; only geometry and style are replayed.
 */
export async function hwApplySpecToPages(
  pages: Page[],
  spec: HwLayoutSpec,
  style: HandwritingStyle,
  templateId: string,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  const out: Page[] = [];
  let changed = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const meta = hwMetaOf(page);
    if (!meta || meta.kind !== 'worksheet' || meta.templateId !== templateId
        || page.id === skipPageId) {
      out.push(page);
      continue;
    }

    const el = document.createElement('canvas');
    const c = new fabric.StaticCanvas(el, { width: page.width, height: page.height });
    if (page.data) await c.loadFromJSON(page.data);

    const n = hwRelayoutCanvas(
      c as unknown as fabric.Canvas, page, i + 1, pages.length, meta, spec, style,
    );
    if (!n) {
      c.dispose();
      out.push(page);
      continue;
    }

    const json = c.toObject(EXTRA) as { objects: unknown[] };
    c.dispose();

    out.push({
      ...page,
      data: {
        version: '6.0.0',
        background: page.background ?? '#ffffff',
        objects: json.objects,
        [HW_PAGE]: { ...meta, rows: spec.rows, tracePerRow: spec.tracePerRow, style: spec.style },
      },
    });
    changed++;
  }

  return { pages: out, changed };
}

/** Measure the current row height on a page, so the slider opens in the right place. */
export function measureRowHeight(objects: fabric.FabricObject[]): number | null {
  const guides = objects.filter((o) => {
    const r = roleOf(o) ?? '';
    return r === 'hw-guide-ascender' || r === 'hw-guide-descender';
  });
  if (guides.length < 2) return null;
  const tops = guides.map((g) => g.getBoundingRect().top).sort((a, b) => a - b);
  return Math.round(tops[1] - tops[0]);
}

export { placeGlyph };

// ------------------------------------------------------- post-generation style
// Phase 8E: surgical live restyling (deep search through groups, set() only).

/**
 * Restyle one handwriting object from a style patch. Returns true when the
 * object belongs to this module and was touched.
 */
export function patchHwObject(
  o: fabric.FabricObject,
  style: HandwritingStyle,
): boolean {
  const a = o as unknown as Any;
  if (a.moduleId !== 'handwriting') return false;
  const role = roleOf(o) ?? '';

  switch (true) {
    case role === 'hw-trace-dash' || role === 'hw-trace-path':
      o.set({ stroke: style.traceColor, strokeWidth: style.traceWidth });
      break;
    case role === 'hw-guide-baseline':
      o.set({ stroke: style.guideColor, strokeWidth: style.guideWidth * 1.5 });
      break;
    case role === 'hw-guide-ascender' || role === 'hw-guide-descender':
      o.set({ stroke: style.guideColor, strokeWidth: style.guideWidth });
      break;
    case role === 'hw-guide-midline':
      o.set({ stroke: style.midlineColor, strokeWidth: style.guideWidth });
      break;
    case role === 'hw-guide-box':
      o.set({ stroke: style.guideColor, strokeWidth: style.guideWidth });
      break;
    case role.startsWith('hw-start-'):
      o.set({ fill: style.startDotColor });
      break;
    case role.startsWith('hw-arrow-'):
      o.set({ fill: style.arrowColor });
      break;
    case role.startsWith('hw-stroke-num-'):
      o.set({ fill: style.arrowColor, fontFamily: style.fontFamily });
      break;
    default:
      return false;
  }

  o.dirty = true;
  o.setCoords();
  return true;
}

/** Restyle every handwriting object on the live canvas (deep search). */
export function patchHwStyleOnCanvas(
  canvas: fabric.Canvas,
  style: HandwritingStyle,
): number {
  let patched = 0;
  forEachObjectDeep(canvas.getObjects(), (o) => {
    if (patchHwObject(o, style)) patched++;
  });
  canvas.requestRenderAll();
  return patched;
}

/** Replay a style patch onto every handwriting page in the document. */
export async function applyHwStyleToPages(
  pages: Page[],
  style: HandwritingStyle,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  return applyPatcherToModulePages(
    pages,
    (o) => (o as unknown as Any).moduleId === 'handwriting',
    (o) => {
      patchHwObject(o, style);
    },
    skipPageId,
    undefined,
    'handwriting',
  );
}
