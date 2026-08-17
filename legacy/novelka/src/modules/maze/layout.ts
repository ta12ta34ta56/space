import * as fabric from 'fabric';
import type { Page } from '../../types/canvas.types';
import { mzMetaOf, MZ_PAGE, type MzPageMeta } from './build-pages';
import { getMzTemplate } from './templates';
import { generateMaze, type MazeOptions } from './generator';
import { renderMaze, renderSolutionKey, type MazeStyle } from './renderer';
import { applyPatcherToModulePages, forEachObjectDeep } from '../shared/live-style';
import { flattenPuzzleGroups, groupPuzzleUnits } from '../shared/puzzle-groups';

/**
 * Live re-layout for maze pages.
 *
 * Template-aware from the start, like word search and crossword: the design's
 * own slots are the authority. Sudoku's original approach of re-centring with a
 * generic algorithm ignored the template and had to be rewritten.
 *
 * Mazes are **regenerated from their stored seed** rather than moved. A maze's
 * wall geometry is a pure function of (seed, shape, difficulty, size), so
 * rebuilding is exact, cheap, and cannot drift the way repeated nudging does.
 * It is also the only correct answer when the slot size changes, because the
 * wall thickness and marker sizes scale with it.
 */

export interface MzLayoutSpec {
  /** maze square size, in points */
  boxSize: number;
  wallColor: string;
  wallWidth: number;
  solutionColor: string;
  showSolution: boolean;
  roundCaps: boolean;
  kdpSafe: boolean;
  offsetX: number;
  offsetY: number;
}

type Any = Record<string, unknown>;
const roleOf = (o: fabric.FabricObject) => (o as unknown as Any).mzRole as string | undefined;
const puzzleOf = (o: fabric.FabricObject) => (o as unknown as Any).mzPuzzle as string | undefined;

/** Split a canvas into template chrome and re-buildable maze content. */
export function mzGroupsOf(objects: fabric.FabricObject[]) {
  const content: fabric.FabricObject[] = [];
  const chrome: fabric.FabricObject[] = [];
  for (const o of objects) {
    if (!puzzleOf(o)) continue;
    if (roleOf(o) === 'mz-chrome') chrome.push(o);
    else content.push(o);
  }
  return { content, chrome };
}

/** The template's maze slots for this page and spec. */
export function mzSlotsFor(
  page: Page,
  pageNumber: number,
  pageCount: number,
  meta: MzPageMeta,
  spec: MzLayoutSpec,
) {
  const tpl = getMzTemplate(meta.templateId);
  const { slots } = tpl.build({
    page,
    pageNumber,
    pageCount,
    count: meta.seeds.length,
    font: 'Inter',
    kdpSafe: spec.kdpSafe,
    title: '',
    ink: '#111827',
    accent: '#2b7fb8',
  });
  return slots;
}

/**
 * The largest maze this design can host.
 *
 * The template's own slot is the ceiling — using a generic formula here is what
 * made the top half of the size slider dead on decorated word search pages.
 */
export function mzMaxBoxSize(
  page: Page,
  pageNumber: number,
  pageCount: number,
  meta: MzPageMeta,
  spec: MzLayoutSpec,
): number {
  const slots = mzSlotsFor(page, pageNumber, pageCount, meta, spec);
  if (!slots.length) return 300;
  return Math.max(60, Math.floor(Math.min(...slots.map((s) => s.size))));
}

/** Rebuild every maze on a canvas from its stored seed. */
export function mzRelayoutCanvas(
  canvas: fabric.Canvas,
  page: Page,
  pageNumber: number,
  pageCount: number,
  meta: MzPageMeta,
  spec: MzLayoutSpec,
  style: MazeStyle,
  mazeOpts: Pick<MazeOptions, 'width' | 'height' | 'braid' | 'startsAt'>,
): number {
  flattenPuzzleGroups(canvas);
  const { content } = mzGroupsOf(canvas.getObjects());
  if (!content.length) {
    groupPuzzleUnits(canvas);
    return 0;
  }

  const puzzleId = puzzleOf(content[0])!;
  const slots = mzSlotsFor(page, pageNumber, pageCount, meta, spec);
  if (!slots.length) {
    groupPuzzleUnits(canvas);
    return 0;
  }

  for (const o of content) canvas.remove(o);

  const liveStyle: MazeStyle = {
    ...style,
    wallColor: spec.wallColor,
    wallWidth: spec.wallWidth,
    solutionColor: spec.solutionColor,
    roundCaps: spec.roundCaps,
  };

  let added = 0;
  meta.seeds.forEach((seed, i) => {
    const slot = slots[Math.min(i, slots.length - 1)];
    const size = Math.min(spec.boxSize, slot.size);
    // Keep the maze centred in its slot so shrinking does not strand it in the
    // corner of the design's frame.
    const placed = {
      left: slot.left + (slot.size - size) / 2 + spec.offsetX,
      top: slot.top + (slot.size - size) / 2 + spec.offsetY,
      size,
      captionTop: slot.captionTop,
    };

    const maze = generateMaze({
      shape: meta.shape,
      width: mazeOpts.width,
      height: mazeOpts.height,
      difficulty: meta.difficulty,
      seed,
      braid: mazeOpts.braid,
      startsAt: mazeOpts.startsAt,
    });

    const objs = meta.kind === 'solution'
      ? renderSolutionKey(maze, placed, liveStyle, puzzleId, `Maze ${meta.firstIndex + i}`)
      : renderMaze(maze, placed, liveStyle, puzzleId, {
          showSolution: spec.showSolution,
          label: `Maze ${meta.firstIndex + i}`,
        });

    for (const o of objs) {
      canvas.add(o);
      added++;
    }
  });

  groupPuzzleUnits(canvas);
  canvas.requestRenderAll();
  return added;
}

const EXTRA = ['id', 'elementType', 'name', 'locked', 'moduleId', 'mzRole', 'mzPuzzle'];

/** Apply a spec to every maze page of the same design, off-screen. */
export async function mzApplySpecToPages(
  pages: Page[],
  spec: MzLayoutSpec,
  style: MazeStyle,
  templateId: string,
  mazeOpts: Pick<MazeOptions, 'width' | 'height' | 'braid' | 'startsAt'>,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  const out: Page[] = [];
  let changed = 0;

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const meta = mzMetaOf(page);
    if (!meta || meta.templateId !== templateId || page.id === skipPageId) {
      out.push(page);
      continue;
    }

    const el = document.createElement('canvas');
    const c = new fabric.StaticCanvas(el, { width: page.width, height: page.height });
    if (page.data) await c.loadFromJSON(page.data);

    const n = mzRelayoutCanvas(
      c as unknown as fabric.Canvas, page, i + 1, pages.length, meta, spec, style, mazeOpts,
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
        [MZ_PAGE]: meta,
      },
    });
    changed++;
  }

  return { pages: out, changed };
}

/** Measure the current maze size, so the slider opens where the art is. */
export function measureMazeSize(objects: fabric.FabricObject[]): number | null {
  const walls = objects.filter((o) => roleOf(o) === 'mz-wall');
  if (walls.length < 4) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const w of walls) {
    const b = w.getBoundingRect();
    minX = Math.min(minX, b.left);
    maxX = Math.max(maxX, b.left + b.width);
    minY = Math.min(minY, b.top);
    maxY = Math.max(maxY, b.top + b.height);
  }
  return Math.round(Math.max(maxX - minX, maxY - minY));
}

// ------------------------------------------------------- post-generation style
// Phase 8E: surgical live restyling (deep search through groups, set() only).

/**
 * Restyle one maze object from a style patch. Returns true when the object
 * belongs to this module and was touched.
 */
export function patchMzObject(
  o: fabric.FabricObject,
  style: MazeStyle,
): boolean {
  const a = o as unknown as Any;
  if (a.moduleId !== 'maze') return false;
  const role = roleOf(o);

  switch (role) {
    case 'mz-wall':
      o.set({
        stroke: style.wallColor,
        strokeWidth: style.wallWidth,
        strokeLineCap: style.roundCaps ? 'round' : 'square',
      });
      break;
    case 'mz-solution':
      o.set({ stroke: style.solutionColor, strokeWidth: style.solutionWidth });
      break;
    case 'mz-start':
      o.set({ fill: style.startColor });
      break;
    case 'mz-end':
      o.set({ fill: style.endColor });
      break;
    case 'mz-label':
      o.set({ fill: style.titleColor, fontFamily: style.fontFamily });
      break;
    case 'mz-bg':
      o.set({ fill: style.backgroundColor });
      break;
    default:
      return false;
  }

  o.dirty = true;
  o.setCoords();
  return true;
}

/** Restyle every maze object on the live canvas (deep search). */
export function patchMzStyleOnCanvas(
  canvas: fabric.Canvas,
  style: MazeStyle,
): number {
  let patched = 0;
  forEachObjectDeep(canvas.getObjects(), (o) => {
    if (patchMzObject(o, style)) patched++;
  });
  canvas.requestRenderAll();
  return patched;
}

/** Replay a style patch onto every maze page in the document. */
export async function applyMzStyleToPages(
  pages: Page[],
  style: MazeStyle,
  skipPageId?: string,
): Promise<{ pages: Page[]; changed: number }> {
  return applyPatcherToModulePages(
    pages,
    (o) => (o as unknown as Any).moduleId === 'maze',
    (o) => {
      patchMzObject(o, style);
    },
    skipPageId,
    undefined,
    'maze',
  );
}
