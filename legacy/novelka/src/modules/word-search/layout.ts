import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';
import { wsMetaOf, WS_PAGE, type WsPageMeta } from './build-pages';
import { getWsTemplate } from './templates';
import type { WordSearchStyle } from './renderer';
import { applyPatcherToModulePages, forEachObjectDeep } from '../shared/live-style';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';

/**
 * Deterministic layout for word search pages.
 *
 * Same contract as the Sudoku module: layout is a pure function
 *
 *     (page, spec) -> exact position of every element
 *
 * rebuilt from the current objects each time, never from the previous output,
 * so repeated slider drags converge instead of drifting.
 *
 * Unlike the first Sudoku implementation this one is **template-aware**: if the
 * page records a templateId, the template's own slots are the authority and the
 * spec scales within them.
 */

export interface WsLayoutSpec {
  /** grid side length in points */
  boxSize: number;
  letterColor: string;
  gridLineColor: string;
  frameWidth: number;
  fontScale: number;
  letterSpacing: number;
  bankFontSize: number;
  bankColumns: number;
  bankColor: string;
  answerColor: string;
  kdpSafe: boolean;
  offsetX: number;
  offsetY: number;
  margin: number;
}

export const DEFAULT_WS_SPEC: Omit<WsLayoutSpec, 'boxSize'> = {
  letterColor: '#111827',
  gridLineColor: '#c7ced8',
  frameWidth: 1.6,
  fontScale: 0.56,
  letterSpacing: 0,
  bankFontSize: 11,
  bankColumns: 3,
  bankColor: '#111827',
  answerColor: '#d64550',
  kdpSafe: true,
  offsetX: 0,
  offsetY: 0,
  margin: 54,
};

export interface WsSlotGeom {
  left: number;
  top: number;
  size: number;
  bankTop?: number;
  bankWidth?: number;
}

/** Content box for a page, honouring the KDP gutter when asked. */
export function wsAreaFor(
  page: Page,
  pageNumber: number,
  pageCount: number,
  spec: WsLayoutSpec,
) {
  if (spec.kdpSafe) {
    const m = kdpMarginsFor(Math.max(pageCount, 24));
    return safeAreaFor(page.width, page.height, pageNumber, m);
  }
  const m = spec.margin;
  return {
    left: m,
    top: m,
    width: page.width - m * 2,
    height: page.height - m * 2,
    isRecto: pageNumber % 2 === 1,
  };
}

const HEADER = 26;
const GAP = 20;

/** Points the word bank needs below the grid. */
export function bankSpace(wordCount: number, spec: WsLayoutSpec): number {
  if (!wordCount) return 0;
  const rows = Math.ceil(wordCount / Math.max(1, spec.bankColumns));
  return rows * spec.bankFontSize * 1.55 + 12;
}

/**
 * The largest grid that fits on this page, given the bank underneath.
 * This is what caps the size slider.
 */
export function wsMaxBoxSize(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  wordCount: number,
  spec: WsLayoutSpec,
  templateId?: string,
) {
  // On a templated page the design's own slot is the real ceiling — using the
  // generic formula here makes the top half of the size slider do nothing.
  if (templateId) {
    const slot = templateSlots(page, pageNumber, pageCount, count, wordCount, spec, templateId);
    if (slot?.length) {
      return Math.max(60, Math.floor(Math.min(...slot.map((s) => s.size))));
    }
  }
  const area = wsAreaFor(page, pageNumber, pageCount, spec);
  const bank = bankSpace(wordCount, spec);
  const h = (area.height - GAP * (count - 1)) / count - HEADER - bank;
  return Math.max(60, Math.floor(Math.min(area.width, h)));
}

/** Ask a template where its puzzles go, for the current page and spec. */
function templateSlots(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  wordCount: number,
  spec: WsLayoutSpec,
  templateId: string,
) {
  try {
    const tpl = getWsTemplate(templateId);
    const { slots } = tpl.build({
      page,
      pageNumber,
      pageCount,
      count,
      gridSize: 12,
      wordCount,
      bankHeight: bankSpace(wordCount, spec),
      font: 'Inter',
      kdpSafe: spec.kdpSafe,
      title: '',
      ink: spec.letterColor,
      accent: '#2b7fb8',
    });
    return slots;
  } catch {
    return null;
  }
}

/**
 * Exact slots for every puzzle on a page.
 *
 * When `templateId` is given the template's own slots are used as the frame:
 * the grid is scaled/centred *inside* the template's slot rather than being
 * re-centred by a generic algorithm. That keeps a templated page's decoration
 * and its puzzle in agreement when the user resizes.
 */
export function wsSlotsFor(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  wordCount: number,
  spec: WsLayoutSpec,
  templateId?: string,
): WsSlotGeom[] {
  const maxSize = wsMaxBoxSize(
    page, pageNumber, pageCount, count, wordCount, spec, templateId,
  );
  const size = Math.min(spec.boxSize || maxSize, maxSize);

  if (templateId) {
    const slots = templateSlots(
      page, pageNumber, pageCount, count, wordCount, spec, templateId,
    );
    if (slots?.length) {
      const bank = bankSpace(wordCount, spec);
      // Scale inside each template slot, keeping the slot's centre line.
      return Array.from({ length: count }, (_, i) => {
        const s = slots[Math.min(i, slots.length - 1)];
        const scaled = Math.min(size, s.size);
        const dx = (s.size - scaled) / 2;
        const origBankTop = s.bankTop ?? s.top + s.size + 8;

        // Centre the whole grid+bank block on the space the design set aside
        // for it. Anchoring the block to the slot's top instead left a dead
        // void under the word list every time the user shrank the grid.
        const origH = origBankTop - s.top + bank;
        const newH = origH + (scaled - s.size);
        const dy = (origH - newH) / 2;

        const safe = wsAreaFor(page, pageNumber, pageCount, spec);
        const baseLeft = s.left + dx;
        const baseTop = s.top + dy;
        const baseBankTop = origBankTop + (scaled - s.size) + dy;
        const bankW = s.bankWidth ?? s.size;
        const blockRight = Math.max(baseLeft + scaled, baseLeft + bankW);
        const blockBottom = baseBankTop + bank;
        const minX = safe.left - baseLeft;
        const maxX = safe.left + safe.width - blockRight;
        const minY = safe.top - baseTop;
        const maxY = safe.top + safe.height - blockBottom;
        const ox = Math.max(Math.min(spec.offsetX, Math.max(minX, maxX)), Math.min(minX, maxX));
        const oy = Math.max(Math.min(spec.offsetY, Math.max(minY, maxY)), Math.min(minY, maxY));
        return {
          left: baseLeft + ox,
          top: baseTop + oy,
          size: scaled,
          bankTop: baseBankTop + oy,
          bankWidth: bankW,
        };
      });
    }
  }

  // ---- generic fallback: single column, block-centred ----------------------
  const area = wsAreaFor(page, pageNumber, pageCount, spec);
  const bank = bankSpace(wordCount, spec);
  const unitH = HEADER + size + bank;
  const blockH = count * unitH + GAP * (count - 1);

  let startY = area.top + (area.height - blockH) / 2 + spec.offsetY;
  startY = Math.max(area.top, Math.min(startY, area.top + area.height - blockH));
  let left = area.left + (area.width - size) / 2 + spec.offsetX;
  left = Math.max(area.left, Math.min(left, area.left + area.width - size));

  return Array.from({ length: count }, (_, i) => {
    const top = startY + i * (unitH + GAP);
    return {
      left,
      top: top + HEADER,
      size,
      bankTop: top + HEADER + size + 8,
      bankWidth: area.width,
    };
  });
}

type Any = Record<string, unknown>;
const roleOf = (o: fabric.FabricObject) => (o as unknown as Any).wsRole as string | undefined;
const puzzleOf = (o: fabric.FabricObject) => (o as unknown as Any).wsPuzzle as string | undefined;

/** Group a canvas's objects by the puzzle they belong to. */
export function wsGroupsOf(objects: fabric.FabricObject[]) {
  const map = new Map<string, fabric.FabricObject[]>();
  for (const o of objects) {
    const id = puzzleOf(o);
    if (!id) continue;
    (map.get(id) ?? map.set(id, []).get(id)!).push(o);
  }
  return [...map.entries()];
}

/**
 * Current geometry of one puzzle's letter grid.
 *
 * A word search's grid has no reliable outline in 'plain' style, so the extent
 * is derived from the letters themselves and then snapped to a square using the
 * known cell count.
 */
export function wsMeasure(objs: fabric.FabricObject[]) {
  const frame = objs.find((o) => roleOf(o) === 'ws-frame');
  const letters = objs.filter((o) => roleOf(o) === 'ws-letter');
  if (!letters.length) return null;

  // cells per side: the letter count is always a perfect square
  const n = Math.round(Math.sqrt(letters.length));
  if (n < 2) return null;

  if (frame) {
    const b = frame.getBoundingRect();
    return { left: b.left, top: b.top, size: Math.max(b.width, b.height), n };
  }

  // letters are centred in their cells, so their bounding box is one cell
  // short of the true grid; recover the cell pitch from the centre spacing.
  let minCx = Infinity, maxCx = -Infinity, minCy = Infinity, maxCy = -Infinity;
  for (const o of letters) {
    const b = o.getBoundingRect();
    const cx = b.left + b.width / 2;
    const cy = b.top + b.height / 2;
    minCx = Math.min(minCx, cx); maxCx = Math.max(maxCx, cx);
    minCy = Math.min(minCy, cy); maxCy = Math.max(maxCy, cy);
  }
  const pitch = n > 1 ? Math.max((maxCx - minCx) / (n - 1), (maxCy - minCy) / (n - 1)) : 0;
  return {
    left: minCx - pitch / 2,
    top: minCy - pitch / 2,
    size: pitch * n,
    n,
  };
}

/** Place one puzzle's objects into a slot at an exact size. */
export function wsPlacePuzzle(
  objs: fabric.FabricObject[],
  slot: WsSlotGeom,
  spec: WsLayoutSpec,
) {
  const geo = wsMeasure(objs);
  if (!geo || geo.size <= 0) return;

  const n = geo.n;
  const cell = slot.size / n;
  const gridTop = slot.top;
  const scale = slot.size / geo.size;

  // Work purely in absolute page coordinates. A fabric Line stores x1/y1/x2/y2
  // relative to its own centre, so those values must never be mixed with page
  // positions — read geometry from getBoundingRect(), write it via left/top.
  const bankItems: fabric.FabricObject[] = [];

  for (const o of objs) {
    const role = roleOf(o);
    const b = o.getBoundingRect();
    const fx = (b.left - geo.left) / geo.size;
    const fy = (b.top - geo.top) / geo.size;

    if (role === 'ws-bank' || role === 'ws-bank-frame') {
      bankItems.push(o);
      continue;
    }

    if (role === 'ws-label') {
      o.set({
        left: slot.left,
        top: gridTop - HEADER,
        width: slot.size,
        fontSize: Math.max(7, Math.min(16, slot.size * 0.045)),
        fill: spec.letterColor,
        textAlign: 'center',
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    if (role === 'ws-bg' || role === 'ws-frame') {
      o.set({
        left: slot.left, top: gridTop,
        width: slot.size, height: slot.size,
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
        ...(role === 'ws-frame'
          ? { stroke: spec.gridLineColor, strokeWidth: spec.frameWidth }
          : {}),
      });
      o.setCoords();
      continue;
    }

    if (role === 'ws-shade') {
      const col = Math.round(fx * n);
      const row = Math.round(fy * n);
      o.set({
        left: slot.left + col * cell, top: gridTop + row * cell,
        width: cell, height: cell,
        fill: spec.gridLineColor,
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    if (role === 'ws-rule' && o instanceof fabric.Line) {
      const horizontal = b.height <= b.width;
      const idx = Math.round((horizontal ? fy : fx) * n);
      const pos = (horizontal ? gridTop : slot.left) + idx * cell;
      if (horizontal) {
        o.set({
          x1: -slot.size / 2, y1: 0, x2: slot.size / 2, y2: 0,
          left: slot.left, top: pos,
          originX: 'left', originY: 'center',
          stroke: spec.gridLineColor,
          scaleX: 1, scaleY: 1, angle: 0,
        });
      } else {
        o.set({
          x1: 0, y1: -slot.size / 2, x2: 0, y2: slot.size / 2,
          left: pos, top: gridTop,
          originX: 'center', originY: 'top',
          stroke: spec.gridLineColor,
          scaleX: 1, scaleY: 1, angle: 0,
        });
      }
      o.setCoords();
      continue;
    }

    if (role === 'ws-answer') {
      // answer marks scale with the grid about the grid's own origin
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const nx = slot.left + ((cx - geo.left) / geo.size) * slot.size;
      const ny = gridTop + ((cy - geo.top) / geo.size) * slot.size;

      if (o instanceof fabric.Line) {
        const halfW = ((b.width * scale) / 2) * Math.sign(o.x2 - o.x1 || 1);
        const halfH = ((b.height * scale) / 2) * Math.sign(o.y2 - o.y1 || 1);
        o.set({
          x1: -halfW, y1: -halfH, x2: halfW, y2: halfH,
          left: nx, top: ny,
          originX: 'center', originY: 'center',
          stroke: spec.answerColor,
          strokeWidth: Math.max(1, cell * 0.09),
          scaleX: 1, scaleY: 1,
        });
      } else if (o instanceof fabric.Ellipse) {
        o.set({
          left: nx, top: ny,
          rx: o.rx * scale, ry: o.ry * scale,
          originX: 'center', originY: 'center',
          scaleX: 1, scaleY: 1,
          ...(o.fill ? { fill: spec.answerColor } : { stroke: spec.answerColor }),
        });
      }
      o.setCoords();
      continue;
    }

    // ws-letter — snap to its cell centre
    if (role === 'ws-letter' && o instanceof fabric.Textbox) {
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      let col = Math.floor(((cx - geo.left) / geo.size) * n);
      let row = Math.floor(((cy - geo.top) / geo.size) * n);
      col = Math.max(0, Math.min(n - 1, col));
      row = Math.max(0, Math.min(n - 1, row));
      o.set({
        originX: 'center', originY: 'center',
        left: slot.left + (col + 0.5) * cell,
        top: gridTop + (row + 0.5) * cell,
        width: cell,
        fontSize: cell * spec.fontScale,
        charSpacing: spec.letterSpacing,
        fill: spec.letterColor,
        textAlign: 'center',
        scaleX: 1, scaleY: 1,
      });
      o.setCoords();
    }
  }

  // ---- re-flow the word bank ----------------------------------------------
  if (bankItems.length) {
    const words = bankItems.filter((o) => roleOf(o) === 'ws-bank');
    const frame = bankItems.find((o) => roleOf(o) === 'ws-bank-frame');
    const bankTop = slot.bankTop ?? gridTop + slot.size + 8;
    const bankW = slot.bankWidth ?? slot.size;
    const bankLeft = slot.left + slot.size / 2 - bankW / 2;

    // an inline bank is a single wide textbox — leave its flow to fabric
    if (words.length === 1) {
      words[0].set({
        left: bankLeft, top: bankTop, width: bankW,
        fontSize: spec.bankFontSize, fill: spec.bankColor,
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      words[0].setCoords();
    } else {
      const cols = Math.max(1, spec.bankColumns);
      const rows = Math.ceil(words.length / cols);
      const colW = bankW / cols;
      const lh = spec.bankFontSize * 1.55;
      // keep the author's original reading order
      words
        .slice()
        .sort((a, b) => {
          const ba = a.getBoundingRect();
          const bb = b.getBoundingRect();
          return ba.left - bb.left || ba.top - bb.top;
        })
        .forEach((o, i) => {
          const c = Math.floor(i / rows);
          const r = i % rows;
          o.set({
            left: bankLeft + c * colW,
            top: bankTop + r * lh,
            width: colW,
            fontSize: spec.bankFontSize,
            fill: spec.bankColor,
            textAlign: cols === 1 ? 'center' : 'left',
            originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
          });
          o.setCoords();
        });
    }

    if (frame) {
      const rows = Math.ceil(words.length / Math.max(1, spec.bankColumns));
      frame.set({
        left: bankLeft, top: bankTop - 6,
        width: bankW, height: rows * spec.bankFontSize * 1.55 + 14,
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
        stroke: spec.gridLineColor,
      });
      frame.setCoords();
    }
  }
}

/** Re-lay the page currently open in the editor. */
export function wsRelayoutCanvas(
  canvas: fabric.Canvas,
  page: Page,
  pageNumber: number,
  pageCount: number,
  spec: WsLayoutSpec,
  templateId?: string,
) {
  flattenPuzzleGroups(canvas);
  const groups = wsGroupsOf(canvas.getObjects());
  if (!groups.length) {
    groupPuzzleUnits(canvas);
    return 0;
  }

  const wordCount = Math.max(
    ...groups.map(([, objs]) => objs.filter((o) => roleOf(o) === 'ws-bank').length),
    0,
  );

  const slots = wsSlotsFor(
    page, pageNumber, pageCount, groups.length, wordCount, spec, templateId,
  );

  const ordered = groups
    .map(([id, objs]) => ({ id, objs, geo: wsMeasure(objs) }))
    .filter((g) => g.geo)
    .sort((a, b) => a.geo!.top - b.geo!.top || a.geo!.left - b.geo!.left);

  ordered.forEach((g, i) =>
    wsPlacePuzzle(g.objs, slots[Math.min(i, slots.length - 1)], spec),
  );
  groupPuzzleUnits(canvas);
  canvas.requestRenderAll();
  return ordered.length;
}

const EXTRA = [
  'id', 'elementType', 'name', 'locked', 'moduleId', 'wsRole', 'wsPuzzle',
];

/**
 * Apply a spec to every word search page of the same kind, off-screen.
 * Each page keeps its own puzzle — only geometry and style are replayed.
 */
export async function wsApplySpecToPages(
  pages: Page[],
  spec: WsLayoutSpec,
  kind: WsPageMeta['kind'],
  perPage: number,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  const out: Page[] = [];
  let changed = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const meta = wsMetaOf(page);
    if (!meta || meta.kind !== kind || meta.perPage !== perPage || page.id === skipPageId) {
      out.push(page);
      continue;
    }

    const el = document.createElement('canvas');
    const c = new fabric.StaticCanvas(el, { width: page.width, height: page.height });
    if (page.data) await c.loadFromJSON(page.data);
    flattenPuzzleGroups(c);

    const groups = wsGroupsOf(c.getObjects());
    if (!groups.length) {
      c.dispose();
      out.push(page);
      continue;
    }

    const wordCount = Math.max(
      ...groups.map(([, objs]) => objs.filter((o) => roleOf(o) === 'ws-bank').length),
      0,
    );
    const slots = wsSlotsFor(
      page, i + 1, pages.length, groups.length, wordCount, spec, meta.templateId,
    );
    const ordered = groups
      .map(([, objs]) => ({ objs, geo: wsMeasure(objs) }))
      .filter((g) => g.geo)
      .sort((a, b) => a.geo!.top - b.geo!.top || a.geo!.left - b.geo!.left);

    ordered.forEach((g, nIdx) =>
      wsPlacePuzzle(g.objs, slots[Math.min(nIdx, slots.length - 1)], spec),
    );
    groupPuzzleUnits(c);

    const json = c.toObject(EXTRA) as { objects: unknown[] };
    c.dispose();

    out.push({
      ...page,
      data: {
        version: '6.0.0',
        background: page.background ?? '#ffffff',
        objects: json.objects,
        [WS_PAGE]: meta,
      },
    });
    changed++;
  }

  return { pages: out, changed };
}

// ------------------------------------------------------- post-generation style
// Phase 8G: surgical live restyling with ABSOLUTE math. Every property is
// recomputed from the object's own geometry + the current style (a letter's
// box width is the cell, so fontSize = cell * fontScale), so the update never
// depends on "what the previous state was". Deep search through groups.

/**
 * Restyle one word-search object from a style patch. Returns true when the
 * object belongs to this module and was touched.
 */
export function patchWsObject(
  o: fabric.FabricObject,
  style: WordSearchStyle,
): boolean {
  const a = o as unknown as Any;
  if (a.moduleId !== 'wordsearch') return false;
  const role = roleOf(o);

  switch (role) {
    case 'ws-letter':
      // Letter boxes are sized to the cell, so width === cell and the size
      // follows the slider 1:1.
      o.set({
        fontSize: Math.max(6, ((o as fabric.Textbox).width || 20) * style.fontScale),
        fill: style.letterColor,
        fontFamily: style.fontFamily,
        charSpacing: style.letterSpacing,
      });
      break;
    case 'ws-label':
      o.set({ fill: style.letterColor, fontFamily: style.fontFamily });
      break;
    case 'ws-rule':
      o.set({ stroke: style.gridLineColor, strokeWidth: style.gridLineWidth });
      break;
    case 'ws-frame':
      o.set({ stroke: style.gridLineColor, strokeWidth: style.frameWidth });
      break;
    case 'ws-shade':
      o.set({ fill: style.gridLineColor });
      break;
    case 'ws-bank':
      o.set({
        fontSize: style.bankFontSize,
        fill: style.bankColor,
        fontFamily: style.fontFamily,
      });
      break;
    case 'ws-bank-frame':
      o.set({ stroke: style.gridLineColor });
      break;
    case 'ws-answer':
      o.set((o as fabric.FabricObject).fill ? { fill: style.answerColor } : { stroke: style.answerColor });
      break;
    case 'ws-bg':
      o.set({ fill: style.backgroundColor });
      break;
    default:
      return false;
  }

  o.dirty = true;
  o.setCoords();
  return true;
}

/** Restyle every word-search object on the live canvas (deep search). */
export function patchWsStyleOnCanvas(
  canvas: fabric.Canvas,
  style: WordSearchStyle,
): number {
  let patched = 0;
  forEachObjectDeep(canvas.getObjects(), (o) => {
    if (patchWsObject(o, style)) patched++;
  });
  canvas.requestRenderAll();
  return patched;
}

/** Replay a style patch onto every word-search page in the document. */
export async function applyWsStyleToPages(
  pages: Page[],
  style: WordSearchStyle,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  return applyPatcherToModulePages(
    pages,
    (o) => (o as unknown as Any).moduleId === 'wordsearch',
    (o) => {
      patchWsObject(o, style);
    },
    skipPageId,
    undefined,
    'wordsearch',
  );
}
