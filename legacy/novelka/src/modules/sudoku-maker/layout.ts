import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from '../../services/kdp';
import { sudokuMetaOf, SUDOKU_PAGE, type SudokuPageMeta } from './build-pages';
import { parseCoordRole } from './furniture';
import { getTemplate } from './templates';
import type { GridSize } from './generator';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';

/**
 * Deterministic layout for Sudoku pages.
 *
 * The earlier "measure the canvas, then nudge things" approach drifted: every
 * resize re-measured its own output, so errors compounded and puzzles crept
 * away from centre. This module instead treats layout as a pure function
 *
 *     (page, spec) -> exact position of every puzzle
 *
 * and rebuilds from the stored puzzle data each time. Same spec always gives
 * the same result, no matter how many times you drag the slider.
 */

export interface LayoutSpec {
  /** grid side length in points */
  boxSize: number;
  numberColor: string;
  gridLineColor: string;
  thickLineWidth: number;
  fontScale: number;
  /** keep the block inside the KDP safe area */
  kdpSafe: boolean;
  /** nudges applied after centring, in points */
  offsetX: number;
  offsetY: number;
  margin: number;
}

export const DEFAULT_SPEC: Omit<LayoutSpec, 'boxSize'> = {
  numberColor: '#111827',
  gridLineColor: '#111827',
  thickLineWidth: 2.2,
  fontScale: 0.58,
  kdpSafe: true,
  offsetX: 0,
  offsetY: 0,
  margin: 54,
};

export interface Slot {
  left: number;
  /** top of the grid itself, in page points (NOT the caption) */
  top: number;
  size: number;
  /** where the caption line sits, when the design has one */
  captionTop?: number;
}

/** Content box for a page, honouring the KDP gutter when asked. */
export function areaFor(page: Page, pageNumber: number, pageCount: number, spec: LayoutSpec) {
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

/** Column count that reads best for a given number of puzzles on a page. */
function columnsFor(count: number) {
  if (count <= 2) return 1;
  if (count <= 6) return 2;
  return 3;
}

/**
 * Ask a template where its puzzles go, for the current page.
 *
 * The template is the authority on a templated page: its design was drawn
 * around those exact rectangles, so re-centring with a generic algorithm
 * puts the grid somewhere the decoration was never expecting.
 */
function templateSlots(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  spec: LayoutSpec,
  templateId: string,
  gridSize: GridSize,
): Slot[] | null {
  try {
    const tpl = getTemplate(templateId);
    const { slots } = tpl.build({
      page,
      pageNumber,
      pageCount,
      count,
      gridSize,
      font: 'Inter',
      kdpSafe: spec.kdpSafe,
      title: '',
      ink: spec.numberColor,
      accent: '#2b7fb8',
    });
    if (!slots?.length) return null;
    return slots.map((s) => ({
      left: s.left,
      top: s.top,
      size: s.size,
      captionTop: s.captionTop,
    }));
  } catch {
    return null;
  }
}

/**
 * The largest grid that fits `count` puzzles in the page's content area.
 * This is what caps the size slider.
 *
 * On a templated page the design's own slot is the real ceiling — using the
 * generic formula here is what made the top half of the size slider dead.
 */
export function maxBoxSize(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  spec: LayoutSpec,
  templateId?: string,
  gridSize: GridSize = 9,
) {
  if (templateId) {
    const slots = templateSlots(page, pageNumber, pageCount, count, spec, templateId, gridSize);
    if (slots?.length) {
      return Math.max(60, Math.floor(Math.min(...slots.map((s) => s.size))));
    }
  }
  const area = areaFor(page, pageNumber, pageCount, spec);
  const cols = columnsFor(count);
  const rows = Math.ceil(count / cols);
  const w = (area.width - GAP * (cols - 1)) / cols;
  const h = (area.height - GAP * (rows - 1)) / rows - HEADER;
  return Math.max(60, Math.floor(Math.min(w, h)));
}

/**
 * Exact slots for every puzzle on a page.
 *
 * When `templateId` is given the template's own slots are the frame: the grid
 * is scaled and centred *inside* the template's rectangle rather than being
 * re-centred by a generic algorithm, so the decoration and the puzzle stay in
 * agreement when the user resizes.
 *
 * Without a template the block is centred as before, so shrinking keeps the
 * group in the middle instead of stranding it top-left.
 */
export function slotsFor(
  page: Page,
  pageNumber: number,
  pageCount: number,
  count: number,
  spec: LayoutSpec,
  templateId?: string,
  gridSize: GridSize = 9,
): Slot[] {
  const maxSize = maxBoxSize(page, pageNumber, pageCount, count, spec, templateId, gridSize);
  const size = Math.min(spec.boxSize || maxSize, maxSize);

  if (templateId) {
    const slots = templateSlots(page, pageNumber, pageCount, count, spec, templateId, gridSize);
    if (slots?.length) {
      return Array.from({ length: count }, (_, i) => {
        const s = slots[Math.min(i, slots.length - 1)];
        const scaled = Math.min(size, s.size);
        // keep the slot's centre line so shrinking stays inside the design
        const dx = (s.size - scaled) / 2;
        const dy = (s.size - scaled) / 2;
        const safe = areaFor(page, pageNumber, pageCount, spec);
        const minX = safe.left - (s.left + dx);
        const maxX = safe.left + safe.width - (s.left + dx + scaled);
        const minY = safe.top - (s.top + dy);
        const maxY = safe.top + safe.height - (s.top + dy + scaled);
        const ox = Math.max(Math.min(spec.offsetX, Math.max(minX, maxX)), Math.min(minX, maxX));
        const oy = Math.max(Math.min(spec.offsetY, Math.max(minY, maxY)), Math.min(minY, maxY));
        return {
          left: s.left + dx + ox,
          top: s.top + dy + oy,
          size: scaled,
          captionTop:
            s.captionTop !== undefined ? s.captionTop + dy + oy : undefined,
        };
      });
    }
  }

  // ---- generic fallback: block-centred grid of squares ---------------------
  const area = areaFor(page, pageNumber, pageCount, spec);
  const cols = columnsFor(count);
  const rows = Math.ceil(count / cols);
  const cellH = size + HEADER;
  const blockH = rows * cellH + GAP * (rows - 1);

  let startY = area.top + (area.height - blockH) / 2 + spec.offsetY;

  // never let the nudge push content out of the safe area
  startY = Math.max(area.top, Math.min(startY, area.top + area.height - blockH));

  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    // centre a short final row
    const inRow = Math.min(cols, count - r * cols);
    const rowW = inRow * size + GAP * (inRow - 1);
    let rowX = area.left + (area.width - rowW) / 2 + spec.offsetX;
    rowX = Math.max(area.left, Math.min(rowX, area.left + area.width - rowW));
    const blockTop = startY + r * (cellH + GAP);
    return {
      left: rowX + c * (size + GAP),
      top: blockTop + HEADER,
      size,
      captionTop: blockTop,
    };
  });
}

type Any = Record<string, unknown>;
const roleOf = (o: fabric.FabricObject) => (o as unknown as Any).sudokuRole as string | undefined;
const puzzleOf = (o: fabric.FabricObject) => (o as unknown as Any).sudokuPuzzle as string | undefined;

/** Group a canvas's objects by the puzzle they belong to, in reading order. */
export function groupsOf(objects: fabric.FabricObject[]) {
  const map = new Map<string, fabric.FabricObject[]>();
  for (const o of objects) {
    const id = puzzleOf(o);
    if (!id) continue;
    (map.get(id) ?? map.set(id, []).get(id)!).push(o);
  }
  return [...map.entries()];
}

/** Current bounding geometry of one puzzle's grid (rules only). */
export function measure(objs: fabric.FabricObject[]) {
  const rules = objs.filter((o) => roleOf(o)?.startsWith('sudoku-rule'));
  if (rules.length < 4) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of rules) {
    const b = r.getBoundingRect();
    minX = Math.min(minX, b.left);
    maxX = Math.max(maxX, b.left + b.width);
    minY = Math.min(minY, b.top);
    maxY = Math.max(maxY, b.top + b.height);
  }
  return { left: minX, top: minY, size: Math.max(maxX - minX, maxY - minY) };
}

/**
 * Place one puzzle's objects into a slot at an exact size.
 *
 * Works from the *current* measured geometry, but because the target is always
 * computed fresh from the spec (never from the previous output), repeated calls
 * converge instead of drifting.
 */
export function placePuzzle(
  objs: fabric.FabricObject[],
  slot: Slot,
  spec: LayoutSpec,
  cellsPerSide: number,
) {
  const geo = measure(objs);
  if (!geo || geo.size <= 0) return;

  // slot.top is the top of the grid itself; the caption (if the design has
  // one) sits on its own line above it.
  const gridTop = slot.top;
  const captionTop = slot.captionTop ?? slot.top - HEADER;
  const cell = slot.size / cellsPerSide;

  // Work purely in absolute page coordinates. A fabric Line stores x1/y1/x2/y2
  // relative to its own centre, so those values must never be mixed with page
  // positions — read geometry from getBoundingRect(), write it via left/top.
  for (const o of objs) {
    const role = roleOf(o);
    const b = o.getBoundingRect();

    // where this object sits inside the old grid, as a 0..1 fraction
    const fx = (b.left - geo.left) / geo.size;
    const fy = (b.top - geo.top) / geo.size;

    if (o instanceof fabric.Line) {
      const horizontal = b.height <= b.width;
      const major = role === 'sudoku-rule-major';
      const stroke = major ? spec.thickLineWidth : Math.max(0.3, spec.thickLineWidth * 0.36);

      // Snap each rule back onto its exact grid index — this is what stops the
      // lines from creeping out of alignment with the numbers.
      const idx = Math.round((horizontal ? fy : fx) * cellsPerSide);
      const pos = (horizontal ? gridTop : slot.left) + idx * cell;

      if (horizontal) {
        o.set({
          x1: -slot.size / 2, y1: 0, x2: slot.size / 2, y2: 0,
          left: slot.left, top: pos,
          originX: 'left', originY: 'center',
          stroke: spec.gridLineColor, strokeWidth: stroke,
          scaleX: 1, scaleY: 1, angle: 0,
        });
      } else {
        o.set({
          x1: 0, y1: -slot.size / 2, x2: 0, y2: slot.size / 2,
          left: pos, top: gridTop,
          originX: 'center', originY: 'top',
          stroke: spec.gridLineColor, strokeWidth: stroke,
          scaleX: 1, scaleY: 1, angle: 0,
        });
      }
      o.setCoords();
      continue;
    }

    if (role === 'sudoku-label') {
      o.set({
        left: slot.left,
        top: captionTop,
        width: slot.size,
        fontSize: Math.max(7, Math.min(15, slot.size * 0.045)),
        fill: spec.numberColor,
        textAlign: 'center',
        originX: 'left',
        originY: 'top',
        scaleX: 1,
        scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    if (role === 'sudoku-bg') {
      o.set({
        left: slot.left, top: gridTop,
        width: slot.size, height: slot.size,
        originX: 'left', originY: 'top', scaleX: 1, scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    // grid reference labels sit just outside the grid, on their own rail
    const coord = role ? parseCoordRole(role) : null;
    if (coord && o instanceof fabric.Textbox) {
      const fs = Math.max(6, Math.min(13, cell * 0.42));
      const off = cell * 0.42 + fs * 0.5;
      const along = (coord.index + 0.5) * cell;
      const pos =
        coord.side === 'top'
          ? { left: slot.left + along, top: gridTop - off }
          : coord.side === 'bottom'
            ? { left: slot.left + along, top: gridTop + slot.size + off }
            : coord.side === 'left'
              ? { left: slot.left - off, top: gridTop + along }
              : { left: slot.left + slot.size + off, top: gridTop + along };
      o.set({
        ...pos,
        width: cell,
        fontSize: fs,
        fill: spec.numberColor,
        textAlign: 'center',
        originX: 'center',
        originY: 'center',
        scaleX: 1,
        scaleY: 1,
      });
      o.setCoords();
      continue;
    }

    // clue / answer text — snap to its cell centre
    if (o instanceof fabric.Textbox) {
      const cx = b.left + b.width / 2;
      const cy = b.top + b.height / 2;
      let col = Math.floor(((cx - geo.left) / geo.size) * cellsPerSide);
      let row = Math.floor(((cy - geo.top) / geo.size) * cellsPerSide);
      col = Math.max(0, Math.min(cellsPerSide - 1, col));
      row = Math.max(0, Math.min(cellsPerSide - 1, row));

      o.set({
        originX: 'center',
        originY: 'center',
        left: slot.left + (col + 0.5) * cell,
        top: gridTop + (row + 0.5) * cell,
        width: cell,
        fontSize: cell * spec.fontScale,
        fill: spec.numberColor,
        textAlign: 'center',
        scaleX: 1,
        scaleY: 1,
      });
      o.setCoords();
    }
  }
}

/** Re-lay the page currently open in the editor. */
export function relayoutCanvas(
  canvas: fabric.Canvas,
  page: Page,
  pageNumber: number,
  pageCount: number,
  spec: LayoutSpec,
  cellsPerSide: number,
  templateId?: string,
) {
  // Generated puzzles are real groups; flatten them so the layout engine can
  // reposition the loose members, then re-group afterwards.
  flattenPuzzleGroups(canvas);
  const groups = groupsOf(canvas.getObjects());
  if (!groups.length) {
    groupPuzzleUnits(canvas);
    return 0;
  }
  const slots = slotsFor(
    page, pageNumber, pageCount, groups.length, spec, templateId, cellsPerSide as GridSize,
  );

  // keep reading order stable so puzzles don't swap places between drags
  const ordered = groups
    .map(([id, objs]) => ({ id, objs, geo: measure(objs) }))
    .filter((g) => g.geo)
    .sort((a, b) => a.geo!.top - b.geo!.top || a.geo!.left - b.geo!.left);

  ordered.forEach((g, i) => placePuzzle(g.objs, slots[Math.min(i, slots.length - 1)], spec, cellsPerSide));
  groupPuzzleUnits(canvas);
  canvas.requestRenderAll();
  return ordered.length;
}

const EXTRA = ['id', 'elementType', 'name', 'locked', 'moduleId', 'sudokuRole', 'sudokuPuzzle'];

/**
 * Apply a spec to every Sudoku page of the same kind, off-screen.
 * Each page keeps its own puzzles — only geometry and style are replayed.
 */
export async function applySpecToPages(
  pages: Page[],
  spec: LayoutSpec,
  cellsPerSide: number,
  kind: SudokuPageMeta['kind'],
  perPage: number,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  const out: Page[] = [];
  let changed = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const meta = sudokuMetaOf(page);
    if (!meta || meta.kind !== kind || meta.perPage !== perPage || page.id === skipPageId) {
      out.push(page);
      continue;
    }

    const el = document.createElement('canvas');
    const c = new fabric.StaticCanvas(el, { width: page.width, height: page.height });
    if (page.data) await c.loadFromJSON(page.data);
    flattenPuzzleGroups(c);

    const groups = groupsOf(c.getObjects());
    if (!groups.length) {
      c.dispose();
      out.push(page);
      continue;
    }

    const slots = slotsFor(
      page, i + 1, pages.length, groups.length, spec, meta.templateId,
      cellsPerSide as GridSize,
    );
    const ordered = groups
      .map(([, objs]) => ({ objs, geo: measure(objs) }))
      .filter((g) => g.geo)
      .sort((a, b) => a.geo!.top - b.geo!.top || a.geo!.left - b.geo!.left);

    ordered.forEach((g, n) =>
      placePuzzle(g.objs, slots[Math.min(n, slots.length - 1)], spec, cellsPerSide),
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
        [SUDOKU_PAGE]: meta,
      },
    });
    changed++;
  }

  return { pages: out, changed };
}
