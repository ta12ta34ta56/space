import * as fabric from 'fabric';
import { nanoid } from 'nanoid';
import type { Page } from '../../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';
import { cwMetaOf, CW_PAGE, type CwPageMeta } from './build-pages';
import { getCwTemplate } from './templates';
import type { CrosswordStyle } from './renderer';
import { applyPatcherToModulePages, forEachObjectDeep } from '../shared/live-style';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';

/**
 * Deterministic, template-aware layout for crossword pages.
 *
 * Same contract as the other modules: layout is a pure function
 *
 *     (page, spec) -> exact position of every element
 *
 * rebuilt from the current objects each time rather than from the previous
 * output, so repeated slider drags converge instead of drifting.
 */

export interface CwLayoutSpec {
  /** grid side length in points */
  boxSize: number;
  letterColor: string;
  gridLineColor: string;
  gridLineWidth: number;
  frameWidth: number;
  numberScale: number;
  numberColor: string;
  fontScale: number;
  clueFontSize: number;
  clueColumns: number;
  clueColor: string;
  cellFill: string | null;
  kdpSafe: boolean;
  offsetX: number;
  offsetY: number;
  margin: number;
}

export const DEFAULT_CW_SPEC: Omit<CwLayoutSpec, 'boxSize'> = {
  letterColor: '#111827',
  gridLineColor: '#111827',
  gridLineWidth: 0.8,
  frameWidth: 0,
  numberScale: 0.3,
  numberColor: '#4b5563',
  fontScale: 0.6,
  clueFontSize: 9.5,
  clueColumns: 2,
  clueColor: '#111827',
  cellFill: null,
  kdpSafe: true,
  offsetX: 0,
  offsetY: 0,
  margin: 54,
};

export interface CwSlotGeom {
  left: number;
  top: number;
  size: number;
  clueTop?: number;
  clueLeft?: number;
  clueWidth?: number;
  /** page height, so the clue reflow can stay on the page */
  pageHeight?: number;
  bottomMargin?: number;
}

export function cwAreaFor(
  page: Page,
  pageNumber: number,
  pageCount: number,
  spec: CwLayoutSpec,
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

/** Ask a template where its grid and clues go for the current page. */
function templateSlots(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  clueHeight: number,
  spec: CwLayoutSpec,
  templateId: string,
) {
  try {
    const tpl = getCwTemplate(templateId);
    const { slots } = tpl.build({
      page,
      pageNumber,
      pageCount,
      count,
      gridSize: 15,
      clueHeight,
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
 * Largest grid that fits. On a templated page the template's own slot is the
 * authority — using a generic formula makes the top of the slider do nothing.
 */
export function cwMaxBoxSize(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  clueHeight: number,
  spec: CwLayoutSpec,
  templateId?: string,
) {
  if (templateId) {
    const slots = templateSlots(
      page, pageNumber, pageCount, count, clueHeight, spec, templateId,
    );
    if (slots?.length) {
      return Math.max(60, Math.floor(Math.min(...slots.map((s) => s.size))));
    }
  }
  const area = cwAreaFor(page, pageNumber, pageCount, spec);
  const h = area.height - HEADER - clueHeight;
  return Math.max(60, Math.floor(Math.min(area.width, h)));
}

/** Exact slots for the page, scaled inside the template's frame. */
export function cwSlotsFor(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  clueHeight: number,
  spec: CwLayoutSpec,
  templateId?: string,
): CwSlotGeom[] {
  const maxSize = cwMaxBoxSize(
    page, pageNumber, pageCount, count, clueHeight, spec, templateId,
  );
  const size = Math.min(spec.boxSize || maxSize, maxSize);

  if (templateId) {
    const slots = templateSlots(
      page, pageNumber, pageCount, count, clueHeight, spec, templateId,
    );
    if (slots?.length) {
      const bounds = cwAreaFor(page, pageNumber, pageCount, spec);
      return Array.from({ length: count }, (_, i) => {
        const s = slots[Math.min(i, slots.length - 1)];
        const scaled = Math.min(size, s.size);
        const dx = (s.size - scaled) / 2;
        // when the grid shrinks, the clue block follows it up
        const shrink = scaled - s.size;
        const sideBySide = s.clueLeft !== undefined && s.clueLeft > s.left + 1;

        // Clamp the nudges so the whole block — grid *and* clues — stays inside
        // the safe area. Moving the grid up used to drag nothing else, leaving
        // the clue list hanging off the bottom of the page.
        const blockTop = s.top;
        const blockBottom = sideBySide
          ? Math.max(s.top + scaled, (s.clueTop ?? s.top) + clueHeight)
          : (s.clueTop ?? s.top + s.size) + shrink + clueHeight;

        const minDY = bounds.top - blockTop;
        const maxDY = bounds.top + bounds.height - blockBottom;
        const dy = Math.max(Math.min(spec.offsetY, Math.max(minDY, maxDY)), Math.min(minDY, maxDY));

        const blockLeft = Math.min(s.left + dx, s.clueLeft ?? Infinity);
        const blockRight = Math.max(
          s.left + dx + scaled,
          sideBySide ? (s.clueLeft ?? 0) + (s.clueWidth ?? 0) : 0,
        );
        const minDX = bounds.left - blockLeft;
        const maxDX = bounds.left + bounds.width - blockRight;
        const dxOff = Math.max(Math.min(spec.offsetX, Math.max(minDX, maxDX)), Math.min(minDX, maxDX));

        return {
          left: s.left + dx + dxOff,
          top: s.top + dy,
          size: scaled,
          clueTop: s.clueTop !== undefined
            ? s.clueTop + (sideBySide ? 0 : shrink) + dy
            : undefined,
          clueLeft: s.clueLeft !== undefined ? s.clueLeft + dxOff : undefined,
          clueWidth: s.clueWidth,
          pageHeight: page.height,
          bottomMargin: page.height - (bounds.top + bounds.height),
        };
      });
    }
  }

  const area = cwAreaFor(page, pageNumber, pageCount, spec);
  const left = area.left + (area.width - size) / 2 + spec.offsetX;
  const top = area.top + HEADER + spec.offsetY;
  return [{
    left, top, size,
    clueTop: top + size + 16,
    clueLeft: area.left,
    clueWidth: area.width,
    pageHeight: page.height,
    bottomMargin: area.top,
  }];
}

type Any = Record<string, unknown>;
const roleOf = (o: fabric.FabricObject) => (o as unknown as Any).cwRole as string | undefined;
const puzzleOf = (o: fabric.FabricObject) => (o as unknown as Any).cwPuzzle as string | undefined;

export function cwGroupsOf(objects: fabric.FabricObject[]) {
  const map = new Map<string, fabric.FabricObject[]>();
  for (const o of objects) {
    const id = puzzleOf(o);
    if (!id) continue;
    (map.get(id) ?? map.set(id, []).get(id)!).push(o);
  }
  return [...map.entries()];
}

/**
 * Current geometry of one puzzle's grid.
 *
 * Derived from the cell rects, whose pitch gives the cell size directly. The
 * grid is not a full square (freeform), so the extent comes from the cells that
 * actually exist plus the known cell pitch.
 */
export function cwMeasure(objs: fabric.FabricObject[]) {
  const cells = objs.filter((o) => roleOf(o) === 'cw-cell');
  if (!cells.length) return null;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const lefts: number[] = [];
  const tops: number[] = [];
  for (const o of cells) {
    const b = o.getBoundingRect();
    minX = Math.min(minX, b.left); maxX = Math.max(maxX, b.left + b.width);
    minY = Math.min(minY, b.top); maxY = Math.max(maxY, b.top + b.height);
    lefts.push(b.left);
    tops.push(b.top);
  }

  // The cell *pitch* is the distance between neighbouring cells, which is NOT
  // the bounding-box width: getBoundingRect() includes the stroke, so a 24pt
  // cell with a 0.8pt rule measures 24.8. Using that as the lattice step made
  // columns mis-round and two cells land on the same grid position.
  //
  // Derive the pitch from the smallest positive gap between distinct edges.
  const smallestGap = (vals: number[]) => {
    const uniq = [...new Set(vals.map((v) => Math.round(v * 100) / 100))].sort((a, b) => a - b);
    let g = Infinity;
    for (let i = 1; i < uniq.length; i++) {
      const d = uniq[i] - uniq[i - 1];
      if (d > 0.5) g = Math.min(g, d);
    }
    return g;
  };
  let pitch = Math.min(smallestGap(lefts), smallestGap(tops));

  // single row or column of cells: fall back to the drawn size minus its stroke
  if (!isFinite(pitch) || pitch <= 0) {
    const b = cells[0].getBoundingRect();
    const sw = (cells[0].strokeWidth ?? 0) * (cells[0].scaleX ?? 1);
    pitch = Math.max(1, Math.min(b.width, b.height) - sw);
  }

  // The drawn extent overshoots by one stroke width; take it off before
  // working out how many cells span the grid.
  const sw = (cells[0].strokeWidth ?? 0) * (cells[0].scaleX ?? 1);
  const extent = Math.max(maxX - minX, maxY - minY) - sw;
  const n = Math.max(1, Math.round(extent / pitch));

  // Anchor on the true top-left cell corner, inside its stroke.
  const left = minX + sw / 2;
  const top = minY + sw / 2;

  // A freeform crossword rarely fills its square: the drawn shape may be, say,
  // 11 columns wide inside a 16-cell slot. Report the inked extent separately
  // so the caller can centre the *art* rather than the notional square.
  const inkW = (maxX - minX) - sw;
  const inkH = (maxY - minY) - sw;

  return { left, top, size: pitch * n, pitch, n, cells: cells.length, inkW, inkH };
}

/** Place one puzzle's objects into a slot at an exact size. */
export function cwPlacePuzzle(
  objs: fabric.FabricObject[],
  slot: CwSlotGeom,
  spec: CwLayoutSpec,
) {
  const geo = cwMeasure(objs);
  if (!geo || geo.size <= 0) return;

  const scale = slot.size / geo.size;
  const cell = geo.pitch * scale;
  const clues: fabric.FabricObject[] = [];

  // Centre the drawn shape inside the slot. Without this the grid hugs the
  // slot's left edge and drifts further off-centre the more it is resized,
  // because the freeform shape is narrower than the square it is laid out in.
  const padX = (slot.size - geo.inkW * scale) / 2;
  const padY = (slot.size - geo.inkH * scale) / 2;
  const originX = slot.left + padX;
  const originY = slot.top + padY;


  // Absolute page coordinates throughout. Fabric Lines store x1/y1/x2/y2
  // relative to their own centre, so never mix those with page positions —
  // read via getBoundingRect(), write via left/top.
  for (const o of objs) {
    const role = roleOf(o);
    const b = o.getBoundingRect();

    if (role === 'cw-clue' || role === 'cw-clue-head') {
      clues.push(o);
      continue;
    }

    if (role === 'cw-label') {
      o.set({
        left: slot.left, top: slot.top - HEADER,
        width: slot.size,
        fontSize: Math.max(7, Math.min(16, slot.size * 0.045)),
        fill: spec.letterColor, textAlign: 'center',
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    // grid column / row of this object, from its old position
    const col = Math.round((b.left - geo.left) / geo.pitch);
    const row = Math.round((b.top - geo.top) / geo.pitch);
    const nx = originX + col * cell;
    const ny = originY + row * cell;

    if (role === 'cw-cell' || role === 'cw-block') {
      const sw = role === 'cw-cell' ? spec.gridLineWidth : (o.strokeWidth ?? 0);
      o.set({
        // fabric positions a Rect by its outer edge; inset by half the stroke
        // so adjacent cells share an edge instead of overlapping by one rule
        left: nx - sw / 2, top: ny - sw / 2,
        width: cell, height: cell,
        stroke: role === 'cw-cell' ? spec.gridLineColor : (o.stroke ?? spec.gridLineColor),
        strokeWidth: sw,
        ...(role === 'cw-cell' ? { fill: spec.cellFill } : {}),
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    if (role === 'cw-frame') {
      o.set({
        left: originX + col * cell, top: originY + row * cell,
        width: b.width * scale, height: b.height * scale,
        stroke: spec.gridLineColor, strokeWidth: spec.frameWidth,
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    if (role === 'cw-number' && o instanceof fabric.Textbox) {
      o.set({
        left: nx + cell * 0.08, top: ny + cell * 0.04,
        width: cell * 0.62,
        fontSize: Math.max(4, cell * spec.numberScale),
        fill: spec.numberColor, textAlign: 'left',
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    if (role === 'cw-answer' && o instanceof fabric.Textbox) {
      // answers are centred in their cell
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      const ac = Math.floor((cx - geo.left) / geo.pitch);
      const ar = Math.floor((cy - geo.top) / geo.pitch);
      o.set({
        left: originX + (ac + 0.5) * cell,
        top: originY + (ar + 0.5) * cell,
        width: cell,
        fontSize: cell * spec.fontScale,
        fill: spec.letterColor, textAlign: 'center',
        originX: 'center', originY: 'center', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
    }
  }

  // ---- re-flow the clue lists ---------------------------------------------
  if (clues.length) {
    const cTop = slot.clueTop ?? slot.top + slot.size + 16;
    const cLeft = slot.clueLeft ?? slot.left;
    const cWidth = slot.clueWidth ?? slot.size;
    const cols = Math.max(1, spec.clueColumns);
    const colW = cWidth / cols;

    // keep the author's reading order: current column, then row
    const ordered = clues.slice().sort((a, b) => {
      const ba = a.getBoundingRect();
      const bb = b.getBoundingRect();
      const colA = Math.round(ba.left / Math.max(1, colW));
      const colB = Math.round(bb.left / Math.max(1, colW));
      return colA - colB || ba.top - bb.top;
    });

    const pageBottom = (slot.pageHeight ?? Infinity) - (slot.bottomMargin ?? 0);
    const room = isFinite(pageBottom) ? pageBottom - cTop : Infinity;

    /** Total height of the tallest column at a given font size. */
    const measure = (fs: number) => {
      const lh = fs * 1.45;
      const headFs = fs * 1.15;
      // Ask fabric for the real wrapped height rather than estimating from a
      // character count — long clues in a narrow column wrap, and guessing
      // makes them overlap.
      const cache = new Map<string, number>();
      const h = (o: fabric.FabricObject) => {
        if (roleOf(o) === 'cw-clue-head') return headFs * 1.9;
        const t = ((o as fabric.Textbox).text ?? '') as string;
        const key = `${t}|${Math.round(colW)}|${fs}`;
        const hit = cache.get(key);
        if (hit !== undefined) return hit;
        const probe = new fabric.Textbox(t, {
          width: colW - 8,
          fontSize: fs,
          fontFamily: (o as fabric.Textbox).fontFamily,
          lineHeight: 1.28,
        });
        const hh = probe.height + lh * 0.18;
        cache.set(key, hh);
        return hh;
      };
      const total = ordered.reduce((s2, o) => s2 + h(o), 0);
      // simulate the pour so the real tallest column is measured
      const target = total / cols;
      let col = 0;
      let y = 0;
      let tallest = 0;
      for (let i = 0; i < ordered.length; i++) {
        const hh = h(ordered[i]);
        const isHead = roleOf(ordered[i]) === 'cw-clue-head';
        const nxt = ordered[i + 1];
        const needed = isHead && nxt ? hh + h(nxt) : hh;
        if (y + needed > target && col < cols - 1) { col++; y = 0; }
        y += hh;
        tallest = Math.max(tallest, y);
      }
      return { tallest, h, target };
    };

    // Fitting 14 clue lines into a single column can simply be taller than the
    // page. Rather than let the list run off the bottom, step the type down
    // until it fits — the author's chosen size is honoured whenever possible.
    let fs = spec.clueFontSize;
    let m = measure(fs);
    while (m.tallest > room && fs > 5.5) {
      fs = Math.round((fs - 0.5) * 2) / 2;
      m = measure(fs);
    }

    const headFs = fs * 1.15;

    // Which group each line belongs to: everything from the first heading up
    // to the second is ACROSS, the rest DOWN.
    const headIdx = ordered
      .map((o, i) => (roleOf(o) === 'cw-clue-head' ? i : -1))
      .filter((i) => i >= 0);
    const groupOf = (i: number) => (headIdx.length > 1 && i >= headIdx[1] ? 1 : 0);

    const groupH = [0, 0];
    ordered.forEach((o, i) => { groupH[groupOf(i)] += m.h(o); });
    const splitByGroup =
      cols === 2 && headIdx.length > 1 &&
      Math.max(groupH[0], groupH[1]) <= Math.max(m.target, 1) * 1.35 &&
      Math.max(groupH[0], groupH[1]) <= room;

    const put = (o: fabric.FabricObject, c: number, yy: number) => {
      const head = roleOf(o) === 'cw-clue-head';
      o.set({
        left: cLeft + c * colW,
        top: yy,
        width: colW - 8,
        fontSize: head ? headFs : fs,
        fill: head ? spec.letterColor : spec.clueColor,
        lineHeight: 1.28,
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
    };

    if (splitByGroup) {
      // conventional print layout: ACROSS left, DOWN right
      const ys = [cTop, cTop];
      ordered.forEach((o, i) => {
        const g = groupOf(i);
        put(o, g, ys[g]);
        ys[g] += m.h(o);
      });
    } else {
      let col = 0;
      let y = cTop;
      for (let i = 0; i < ordered.length; i++) {
        const o = ordered[i];
        const hh = m.h(o);
        const head = roleOf(o) === 'cw-clue-head';
        // a heading must never be stranded at the foot of a column
        const nxt = ordered[i + 1];
        const needed = head && nxt ? hh + m.h(nxt) : hh;
        if (y - cTop + needed > m.target && col < cols - 1) {
          col++;
          y = cTop;
        }
        put(o, col, y);
        y += hh;
      }
    }
  }
}

/** Re-lay the page currently open in the editor. */
export function cwRelayoutCanvas(
  canvas: fabric.Canvas,
  page: Page,
  pageNumber: number,
  pageCount: number,
  spec: CwLayoutSpec,
  clueHeight: number,
  templateId?: string,
) {
  flattenPuzzleGroups(canvas);
  const groups = cwGroupsOf(canvas.getObjects());
  if (!groups.length) {
    groupPuzzleUnits(canvas);
    return 0;
  }

  const slots = cwSlotsFor(
    page, pageNumber, pageCount, groups.length, clueHeight, spec, templateId,
  );

  const ordered = groups
    .map(([id, objs]) => ({ id, objs, geo: cwMeasure(objs) }))
    .filter((g) => g.geo)
    .sort((a, b) => a.geo!.top - b.geo!.top || a.geo!.left - b.geo!.left);

  ordered.forEach((g, i) =>
    cwPlacePuzzle(g.objs, slots[Math.min(i, slots.length - 1)], spec),
  );
  groupPuzzleUnits(canvas);
  canvas.requestRenderAll();
  return ordered.length;
}

const EXTRA = [
  'id', 'elementType', 'name', 'locked', 'moduleId', 'cwRole', 'cwPuzzle',
];

/** Apply a spec to every crossword page of the same kind, off-screen. */
export async function cwApplySpecToPages(
  pages: Page[],
  spec: CwLayoutSpec,
  kind: CwPageMeta['kind'],
  perPage: number,
  clueHeight: number,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  const out: Page[] = [];
  let changed = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const meta = cwMetaOf(page);
    if (!meta || meta.kind !== kind || meta.perPage !== perPage || page.id === skipPageId) {
      out.push(page);
      continue;
    }

    const el = document.createElement('canvas');
    const c = new fabric.StaticCanvas(el, { width: page.width, height: page.height });
    if (page.data) await c.loadFromJSON(page.data);
    flattenPuzzleGroups(c);

    const groups = cwGroupsOf(c.getObjects());
    if (!groups.length) {
      c.dispose();
      out.push(page);
      continue;
    }

    const slots = cwSlotsFor(
      page, i + 1, pages.length, groups.length, clueHeight, spec, meta.templateId,
    );
    const ordered = groups
      .map(([, objs]) => ({ objs, geo: cwMeasure(objs) }))
      .filter((g) => g.geo)
      .sort((a, b) => a.geo!.top - b.geo!.top || a.geo!.left - b.geo!.left);

    ordered.forEach((g, n) =>
      cwPlacePuzzle(g.objs, slots[Math.min(n, slots.length - 1)], spec),
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
        [CW_PAGE]: meta,
      },
    });
    changed++;
  }

  return { pages: out, changed };
}

// ------------------------------------------------------- post-generation style
// Phase 8G: surgical live restyling with ABSOLUTE math. Every property is
// recomputed from the object's own geometry + the current style (fontSize =
// cell * fontScale, derived from the text box width), so the update never
// depends on "what the previous state was" — drag the slider, the canvas
// objects change. Deep search through groups, set() only.

/**
 * Restyle one crossword object from a style patch. Returns true when the
 * object belongs to this module and was touched.
 */
export function patchCwObject(
  o: fabric.FabricObject,
  style: CrosswordStyle,
): boolean {
  const a = o as unknown as Any;
  if (a.moduleId !== 'crossword') return false;
  const role = roleOf(o);

  switch (role) {
    case 'cw-cell':
      o.set({
        stroke: style.gridLineColor,
        strokeWidth: style.gridLineWidth,
        fill: style.cellFill,
      });
      break;
    case 'cw-block':
      // Block squares are reconciled page-wide by syncCwBlocks (they may not
      // exist yet when the page was generated with blocks off); keep the
      // visibility/style in step here for blocks that already exist.
      if (style.blockStyle === 'solid') {
        o.set({ visible: true, fill: style.blockColor, stroke: null, strokeWidth: 0, opacity: 1 });
      } else if (style.blockStyle === 'hollow') {
        o.set({
          visible: true,
          fill: null,
          stroke: style.gridLineColor,
          strokeWidth: style.gridLineWidth * 0.5,
          opacity: 0.35,
        });
      } else {
        o.set({ visible: false });
      }
      break;
    case 'cw-frame':
      o.set({ stroke: style.gridLineColor, strokeWidth: style.frameWidth });
      break;
    case 'cw-number':
      // The number box is sized to cell * 0.62, so the cell is width / 0.62.
      o.set({
        fontSize: Math.max(
          4,
          ((o as fabric.Textbox).width || 20) / 0.62 * style.numberScale,
        ),
        fill: style.numberColor,
        fontFamily: style.fontFamily,
      });
      break;
    case 'cw-answer':
      // Answer letters fill the cell: width === cell.
      o.set({
        fontSize: Math.max(
          4,
          ((o as fabric.Textbox).width || 20) * style.fontScale,
        ),
        fill: style.letterColor,
        fontFamily: style.fontFamily,
      });
      break;
    case 'cw-label':
      o.set({ fill: style.letterColor, fontFamily: style.fontFamily });
      break;
    case 'cw-clue-head':
      o.set({
        fontSize: style.clueFontSize * 1.15,
        fill: style.letterColor,
        fontFamily: style.fontFamily,
      });
      break;
    case 'cw-clue':
      o.set({
        fontSize: style.clueFontSize,
        fill: style.clueColor,
        fontFamily: style.fontFamily,
      });
      break;
    default:
      return false;
  }

  o.dirty = true;
  o.setCoords();
  return true;
}

/**
 * Reconcile block squares for every crossword puzzle on the page.
 *
 * The unused cells of a crossword can be reconstructed from the live-cell
 * lattice (the cw-cell rects), so toggling Block Style after generation
 * visibly adds/removes blocks even when the page was generated with blocks
 * off. Missing blocks are created (tagged like generated ones); existing ones
 * are reused — repeated toggles never duplicate objects.
 */
export function syncCwBlocks(
  objects: fabric.FabricObject[],
  canvas: fabric.Canvas | fabric.StaticCanvas,
  style: CrosswordStyle,
): number {
  let touched = 0;
  const groups = cwGroupsOf(objects);
  for (const [, objs] of groups) {
    const cells = objs.filter((o) => roleOf(o) === 'cw-cell');
    if (!cells.length) continue;
    const geo = cwMeasure(objs);
    if (!geo || geo.pitch <= 0 || geo.n < 2) continue;
    const { left, top, pitch, n } = geo;

    const live = new Set<string>();
    for (const cell of cells) {
      const b = cell.getBoundingRect();
      const c = Math.round((b.left - left) / pitch);
      const r = Math.round((b.top - top) / pitch);
      if (c >= 0 && c < n && r >= 0 && r < n) live.add(`${r},${c}`);
    }

    const puzzleId = puzzleOf(cells[0]) ?? '';
    const existing = new Map<string, fabric.FabricObject>();
    for (const o of objs) {
      if (roleOf(o) !== 'cw-block') continue;
      const b = o.getBoundingRect();
      const c = Math.round((b.left - left) / pitch);
      const r = Math.round((b.top - top) / pitch);
      if (c >= 0 && c < n && r >= 0 && r < n) existing.set(`${r},${c}`, o);
      else o.set({ visible: false });
    }

    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (live.has(`${r},${c}`)) {
          const o = existing.get(`${r},${c}`);
          if (o) {
            o.set({ visible: false });
            touched++;
          }
          continue;
        }
        let block = existing.get(`${r},${c}`);
        if (!block) {
          block = new fabric.Rect({
            left: left + c * pitch,
            top: top + r * pitch,
            width: pitch,
            height: pitch,
            originX: 'left',
            originY: 'top',
          });
          const a = block as unknown as Any;
          a.moduleId = 'crossword';
          a.cwRole = 'cw-block';
          a.cwPuzzle = puzzleId;
          a.name = 'cw-block';
          (block as unknown as { id?: string }).id = nanoid(8);
          canvas.add(block);
          existing.set(`${r},${c}`, block);
        }
        if (style.blockStyle === 'solid') {
          block.set({ visible: true, fill: style.blockColor, stroke: null, strokeWidth: 0, opacity: 1 });
        } else if (style.blockStyle === 'hollow') {
          block.set({
            visible: true,
            fill: null,
            stroke: style.gridLineColor,
            strokeWidth: style.gridLineWidth * 0.5,
            opacity: 0.35,
          });
        } else {
          block.set({ visible: false });
        }
        touched++;
      }
    }
  }
  return touched;
}

/** Restyle every crossword object on the live canvas (deep search + block sync). */
export function patchCwStyleOnCanvas(
  canvas: fabric.Canvas,
  style: CrosswordStyle,
): number {
  let patched = 0;
  forEachObjectDeep(canvas.getObjects(), (o) => {
    if (patchCwObject(o, style)) patched++;
  });
  syncCwBlocks(canvas.getObjects(), canvas, style);
  canvas.requestRenderAll();
  return patched;
}

/** Replay a style patch onto every crossword page in the document. */
export async function applyCwStyleToPages(
  pages: Page[],
  style: CrosswordStyle,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  return applyPatcherToModulePages(
    pages,
    (o) => (o as unknown as Any).moduleId === 'crossword',
    (o) => {
      patchCwObject(o, style);
    },
    skipPageId,
    (c) => {
      syncCwBlocks(c.getObjects(), c, style);
    },
    'crossword',
  );
}
