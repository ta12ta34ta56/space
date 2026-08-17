import * as fabric from 'fabric';
import type { Maze } from './generator';

/**
 * Maze -> canvas elements.
 *
 * Everything is a plain fabric object (CRITICAL RULE #4): walls are Lines,
 * the solution is a Polyline, markers are Circles/Textboxes. Once placed the
 * user can move, recolour or delete any single piece.
 *
 * Every object is tagged `mzRole` / `mzPuzzle` so the live-adjust engine can
 * find it later. Those keys MUST exist in BOTH `CanvasEngine.EXTRA_PROPS` and
 * `PUZZLE_EXTRA_PROPS` — the handwriting module lost 667/667 tags to having
 * only the first.
 */

export type MarkerStyle = 'dot' | 'arrow' | 'label' | 'none';

export interface MazeStyle {
  fontFamily: string;
  wallColor: string;
  wallWidth: number;
  /** rounded corners look friendlier for kids' books */
  roundCaps: boolean;
  backgroundColor: string | null;
  solutionColor: string;
  solutionWidth: number;
  startColor: string;
  endColor: string;
  markers: MarkerStyle;
  showTitle: boolean;
  titleColor: string;
}

export const DEFAULT_MAZE_STYLE: MazeStyle = {
  fontFamily: 'Inter',
  wallColor: '#111827',
  wallWidth: 1.6,
  roundCaps: false,
  backgroundColor: null,
  solutionColor: '#e11d48',
  solutionWidth: 2.0,
  startColor: '#16a34a',
  endColor: '#e11d48',
  markers: 'dot',
  showTitle: true,
  titleColor: '#111827',
};

export interface MazeSlot {
  left: number;
  top: number;
  /** the maze is always drawn square inside this box */
  size: number;
  /** caption line above the maze, when the design has one */
  captionTop?: number;
}

type Any = Record<string, unknown>;

function tag(o: fabric.FabricObject, role: string, id: string): fabric.FabricObject {
  const a = o as unknown as Any;
  a.mzRole = role;
  a.mzPuzzle = id;
  a.moduleId = 'maze';
  return o;
}

/**
 * Draw one maze into a square slot.
 *
 * The generator works in a 0..1 box, so placement is a single scale plus
 * offset. Keeping that conversion in one place means every shape lands
 * correctly without the renderer knowing which shape it is.
 */
export function renderMaze(
  maze: Maze,
  slot: MazeSlot,
  style: MazeStyle,
  id: string,
  opts: { showSolution?: boolean; label?: string } = {},
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  const X = (v: number) => slot.left + v * slot.size;
  const Y = (v: number) => slot.top + v * slot.size;

  if (style.backgroundColor) {
    out.push(tag(new fabric.Rect({
      left: slot.left, top: slot.top, width: slot.size, height: slot.size,
      fill: style.backgroundColor, stroke: null,
      selectable: true, objectCaching: false,
    }), 'mz-bg', id));
  }

  if (opts.label && style.showTitle && slot.captionTop !== undefined) {
    out.push(tag(new fabric.Textbox(opts.label, {
      left: slot.left, top: slot.captionTop, width: slot.size,
      fontSize: Math.max(8, Math.min(16, slot.size * 0.045)),
      fontFamily: style.fontFamily, fill: style.titleColor,
      textAlign: 'center', objectCaching: false,
    }), 'mz-label', id));
  }

  // Walls. One Line each so the user can delete a single wall if they want to
  // hand-tweak a puzzle — a single Path would be all-or-nothing.
  for (const w of maze.walls) {
    out.push(tag(new fabric.Line([X(w.x1), Y(w.y1), X(w.x2), Y(w.y2)], {
      stroke: style.wallColor,
      strokeWidth: style.wallWidth,
      strokeLineCap: style.roundCaps ? 'round' : 'square',
      selectable: true,
      objectCaching: false,
    }), 'mz-wall', id));
  }

  // Solution. Drawn as one Polyline so it can be selected and hidden in a
  // single click, which is what an author wants when checking a page.
  if (opts.showSolution && maze.solution.length > 1) {
    const pts = maze.solution.map((cid) => ({
      x: X(maze.cells[cid].cx), y: Y(maze.cells[cid].cy),
    }));
    out.push(tag(new fabric.Polyline(pts, {
      fill: null,
      stroke: style.solutionColor,
      strokeWidth: style.solutionWidth,
      strokeLineCap: 'round',
      strokeLineJoin: 'round',
      opacity: 0.85,
      objectCaching: false,
    }), 'mz-solution', id));
  }

  // Entrance / exit markers.
  if (style.markers !== 'none') {
    const s = maze.cells[maze.start];
    const e = maze.cells[maze.end];
    const r = Math.max(2, slot.size * 0.012);

    if (style.markers === 'dot') {
      out.push(tag(new fabric.Circle({
        left: X(s.cx), top: Y(s.cy), radius: r, fill: style.startColor,
        originX: 'center', originY: 'center', objectCaching: false,
      }), 'mz-start', id));
      out.push(tag(new fabric.Circle({
        left: X(e.cx), top: Y(e.cy), radius: r, fill: style.endColor,
        originX: 'center', originY: 'center', objectCaching: false,
      }), 'mz-end', id));
    } else if (style.markers === 'label') {
      const fs = Math.max(7, slot.size * 0.038);
      out.push(tag(new fabric.Textbox('START', {
        left: X(s.cx) - fs * 2, top: Y(s.cy) - fs / 2, width: fs * 4,
        fontSize: fs, fontFamily: style.fontFamily, fill: style.startColor,
        textAlign: 'center', objectCaching: false,
      }), 'mz-start', id));
      out.push(tag(new fabric.Textbox('END', {
        left: X(e.cx) - fs * 1.5, top: Y(e.cy) - fs / 2, width: fs * 3,
        fontSize: fs, fontFamily: style.fontFamily, fill: style.endColor,
        textAlign: 'center', objectCaching: false,
      }), 'mz-end', id));
    } else {
      // arrows pointing into the entrance and out of the exit
      const a = Math.max(4, slot.size * 0.022);
      out.push(tag(new fabric.Triangle({
        left: X(s.cx), top: Y(s.cy), width: a, height: a * 1.3,
        fill: style.startColor, angle: 180,
        originX: 'center', originY: 'center', objectCaching: false,
      }), 'mz-start', id));
      out.push(tag(new fabric.Triangle({
        left: X(e.cx), top: Y(e.cy), width: a, height: a * 1.3,
        fill: style.endColor,
        originX: 'center', originY: 'center', objectCaching: false,
      }), 'mz-end', id));
    }
  }

  return out;
}

/** A small solution thumbnail, for answer-key pages. */
export function renderSolutionKey(
  maze: Maze,
  slot: MazeSlot,
  style: MazeStyle,
  id: string,
  label: string,
): fabric.FabricObject[] {
  return renderMaze(
    maze, slot,
    { ...style, wallWidth: Math.max(0.5, style.wallWidth * 0.55), markers: 'dot' },
    id,
    { showSolution: true, label },
  );
}
