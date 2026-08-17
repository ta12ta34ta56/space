import * as fabric from 'fabric';

/**
 * Shared page furniture for Sudoku templates.
 *
 * These are the small printed extras a KDP puzzle journal needs — star
 * ratings, write-on rules, date/time fields, botanical sprigs, coordinate
 * labels around the grid. Everything returns plain fabric objects so the
 * author can still select, recolour or delete any single piece.
 */

export const text = (t: string, o: Partial<fabric.TextboxProps>) =>
  new fabric.Textbox(t, { fontFamily: 'Inter', ...o });

// ------------------------------------------------------------------ stars

/** Five-pointed star path, centred on the origin, outer radius 1. */
function starPath(points = 5, inner = 0.4): string {
  const seg: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? 1 : inner;
    const a = (Math.PI / points) * i - Math.PI / 2;
    seg.push(`${i === 0 ? 'M' : 'L'} ${(Math.cos(a) * r).toFixed(4)} ${(Math.sin(a) * r).toFixed(4)}`);
  }
  return `${seg.join(' ')} Z`;
}

const STAR = starPath();

/**
 * A row of rating stars — `filled` of them solid, the rest outlined.
 * `left`/`top` is the top-left of the row.
 */
export function starRow(opts: {
  left: number;
  top: number;
  size: number;
  count?: number;
  filled?: number;
  gap?: number;
  color?: string;
}): fabric.FabricObject[] {
  const { left, top, size } = opts;
  const count = opts.count ?? 5;
  const filled = opts.filled ?? 0;
  const gap = opts.gap ?? size * 0.4;
  const color = opts.color ?? '#111827';
  const r = size / 2;

  return Array.from({ length: count }, (_, i) => {
    const solid = i < filled;
    return new fabric.Path(STAR, {
      left: left + i * (size + gap) + r,
      top: top + r,
      originX: 'center',
      originY: 'center',
      scaleX: r,
      scaleY: r,
      fill: solid ? color : null,
      stroke: color,
      // Scale the outline with the star: a fixed 1.4pt rule on a 7pt star is
      // 20% of its width and makes a row of them read as one grey smudge.
      strokeWidth: solid ? 0 : Math.max(0.5, size * 0.09) / r,
      strokeUniform: false,
    });
  });
}

// ------------------------------------------------------------ write-on rules

export type RuleStyle = 'solid' | 'dotted' | 'dashed';

/** A blank line the reader writes on. */
export function writeLine(opts: {
  left: number;
  top: number;
  width: number;
  style?: RuleStyle;
  color?: string;
  strokeWidth?: number;
}): fabric.Line {
  const style = opts.style ?? 'solid';
  const w = opts.strokeWidth ?? 0.9;
  return new fabric.Line([opts.left, opts.top, opts.left + opts.width, opts.top], {
    stroke: opts.color ?? '#111827',
    strokeWidth: w,
    strokeDashArray:
      style === 'dotted' ? [0.6, 3.4] : style === 'dashed' ? [5, 3.5] : undefined,
    strokeLineCap: style === 'dotted' ? 'round' : 'butt',
  });
}

/** A caption followed by a rule to write on, e.g. `Date: ______`. */
export function fieldLine(opts: {
  label: string;
  left: number;
  top: number;
  width: number;
  labelWidth: number;
  font: string;
  fontSize: number;
  color?: string;
  style?: RuleStyle;
  /** how far below the text baseline the rule sits */
  drop?: number;
}): fabric.FabricObject[] {
  const color = opts.color ?? '#111827';
  const drop = opts.drop ?? opts.fontSize * 1.15;
  return [
    text(opts.label, {
      left: opts.left,
      top: opts.top,
      width: opts.labelWidth,
      fontSize: opts.fontSize,
      fontFamily: opts.font,
      fill: color,
    }),
    writeLine({
      left: opts.left + opts.labelWidth,
      top: opts.top + drop,
      width: Math.max(10, opts.width - opts.labelWidth),
      style: opts.style ?? 'solid',
      color,
      strokeWidth: 0.9,
    }),
  ];
}

// ------------------------------------------------------------------ icons

/** Simple outline clock. */
export function clockIcon(cx: number, cy: number, r: number, color = '#111827') {
  return new fabric.Group(
    [
      new fabric.Circle({
        radius: r, fill: null, stroke: color, strokeWidth: Math.max(0.6, r * 0.13),
        originX: 'center', originY: 'center',
      }),
      new fabric.Line([0, 0, 0, -r * 0.55], {
        stroke: color, strokeWidth: Math.max(0.6, r * 0.13), strokeLineCap: 'round',
        originX: 'center', originY: 'center',
      }),
      new fabric.Line([0, 0, r * 0.42, 0], {
        stroke: color, strokeWidth: Math.max(0.6, r * 0.13), strokeLineCap: 'round',
        originX: 'center', originY: 'center',
      }),
    ],
    { left: cx, top: cy, originX: 'center', originY: 'center' },
  );
}

/** Simple outline calendar. */
export function calendarIcon(cx: number, cy: number, size: number, color = '#111827') {
  const s = size;
  const sw = Math.max(0.6, s * 0.08);
  return new fabric.Group(
    [
      new fabric.Rect({
        width: s, height: s * 0.86, rx: s * 0.1, ry: s * 0.1,
        fill: null, stroke: color, strokeWidth: sw,
        originX: 'center', originY: 'center',
      }),
      new fabric.Line([-s / 2, -s * 0.2, s / 2, -s * 0.2], {
        stroke: color, strokeWidth: sw, originX: 'center', originY: 'center',
      }),
      new fabric.Line([-s * 0.24, -s * 0.43, -s * 0.24, -s * 0.58], {
        stroke: color, strokeWidth: sw, strokeLineCap: 'round',
        originX: 'center', originY: 'center',
      }),
      new fabric.Line([s * 0.24, -s * 0.43, s * 0.24, -s * 0.58], {
        stroke: color, strokeWidth: sw, strokeLineCap: 'round',
        originX: 'center', originY: 'center',
      }),
    ],
    { left: cx, top: cy, originX: 'center', originY: 'center' },
  );
}

/** Small pencil, angled as if resting on the line. */
export function pencilIcon(cx: number, cy: number, size: number, color = '#111827') {
  const p = 'M 2 22 L 5 15 L 18 2 L 22 6 L 9 19 Z M 5 15 L 9 19';
  return new fabric.Path(p, {
    left: cx, top: cy, originX: 'center', originY: 'center',
    fill: null, stroke: color, strokeWidth: 1.6,
    scaleX: size / 24, scaleY: size / 24,
  });
}

/** An empty tick box. */
export function checkbox(x: number, y: number, size: number, color = '#111827') {
  return new fabric.Rect({
    left: x, top: y, width: size, height: size,
    fill: null, stroke: color, strokeWidth: 1,
    originX: 'left', originY: 'top',
  });
}

// -------------------------------------------------------------- botanicals

/**
 * A leafy sprig: a curved stem with teardrop leaves alternating along it.
 *
 * Drawn in a 0..40 box with the stem running bottom-left to top-right, then
 * scaled and rotated by the caller. Leaves are built programmatically so they
 * always sit *on* the stem rather than floating beside it.
 */
export function sprig(opts: {
  left: number;
  top: number;
  size: number;
  color?: string;
  angle?: number;
  flip?: boolean;
  /** how many leaf pairs */
  leaves?: number;
}) {
  const color = opts.color ?? '#7d8a96';
  const n = opts.leaves ?? 5;

  // stem: a quadratic curve from (4,38) to (36,4)
  const p0 = { x: 4, y: 38 };
  const pc = { x: 10, y: 14 };
  const p1 = { x: 36, y: 4 };
  const at = (t: number) => ({
    x: (1 - t) ** 2 * p0.x + 2 * (1 - t) * t * pc.x + t ** 2 * p1.x,
    y: (1 - t) ** 2 * p0.y + 2 * (1 - t) * t * pc.y + t ** 2 * p1.y,
  });
  const tangent = (t: number) => ({
    x: 2 * (1 - t) * (pc.x - p0.x) + 2 * t * (p1.x - pc.x),
    y: 2 * (1 - t) * (pc.y - p0.y) + 2 * t * (p1.y - pc.y),
  });

  const objs: fabric.FabricObject[] = [
    new fabric.Path(`M ${p0.x} ${p0.y} Q ${pc.x} ${pc.y} ${p1.x} ${p1.y}`, {
      fill: null, stroke: color, strokeWidth: 1.1, strokeLineCap: 'round',
    }),
  ];

  // a teardrop leaf, pointing along +x, unit length
  const LEAF = 'M 0 0 C 3 -3.4 8 -3.6 11 0 C 8 3.6 3 3.4 0 0 Z';

  for (let i = 0; i < n; i++) {
    const t = 0.16 + (i / Math.max(1, n - 1)) * 0.74;
    const pt = at(t);
    const tg = tangent(t);
    const stemAngle = (Math.atan2(tg.y, tg.x) * 180) / Math.PI;
    // alternate the leaves either side of the stem
    const side = i % 2 === 0 ? -1 : 1;
    const scale = 0.62 + 0.3 * (1 - Math.abs(t - 0.5) * 2);
    objs.push(
      new fabric.Path(LEAF, {
        left: pt.x,
        top: pt.y,
        originX: 'left',
        originY: 'center',
        angle: stemAngle + side * 42,
        scaleX: scale,
        scaleY: scale,
        fill: null,
        stroke: color,
        strokeWidth: 1 / scale,
      }),
    );
  }

  const g = new fabric.Group(objs, {
    left: opts.left,
    top: opts.top,
    originX: 'center',
    originY: 'center',
    angle: opts.angle ?? 0,
  });
  const sc = opts.size / 40;
  g.set({ scaleX: opts.flip ? -sc : sc, scaleY: sc });
  return g;
}

/** A small four-point sparkle. */
export function sparkle(cx: number, cy: number, size: number, color = '#111827') {
  const d = 'M 12 0 C 13 8 16 11 24 12 C 16 13 13 16 12 24 C 11 16 8 13 0 12 C 8 11 11 8 12 0 Z';
  return new fabric.Path(d, {
    left: cx, top: cy, originX: 'center', originY: 'center',
    fill: color, stroke: null,
    scaleX: size / 24, scaleY: size / 24,
  });
}

/** A centred rule with a diamond in the middle — a classic book divider. */
export function ornamentRule(opts: {
  centerX: number;
  top: number;
  width: number;
  color?: string;
}): fabric.FabricObject[] {
  const { centerX, top, width } = opts;
  const color = opts.color ?? '#111827';
  const arm = width / 2 - 9;
  return [
    new fabric.Line([centerX - width / 2, top, centerX - width / 2 + arm, top], {
      stroke: color, strokeWidth: 0.8,
    }),
    new fabric.Path('M 0 -4 L 4 0 L 0 4 L -4 0 Z', {
      left: centerX, top, originX: 'center', originY: 'center',
      fill: null, stroke: color, strokeWidth: 0.8,
    }),
    new fabric.Line([centerX + width / 2 - arm, top, centerX + width / 2, top], {
      stroke: color, strokeWidth: 0.8,
    }),
  ];
}

// ------------------------------------------------------- coordinate labels

export type CoordSide = 'top' | 'bottom' | 'left' | 'right';

/** Column heading for index `i`: numbers across, letters down (A, B, C…). */
export const colLabel = (i: number) => String(i + 1);
export const rowLabel = (i: number) => String.fromCharCode(65 + i);

/**
 * Row / column reference labels around a grid, as seen in printed puzzle
 * books. Tagged with the puzzle id and a parseable role so the live-adjust
 * layout engine repositions them when the grid is resized.
 *
 * Role format: `sudoku-coord:<side>:<index>`
 */
export function coordLabels(opts: {
  slot: { left: number; top: number; size: number };
  cells: number;
  sides: CoordSide[];
  font: string;
  color?: string;
  puzzleId?: string;
  /** 'number' on both axes, or letters down the side */
  rowsAsLetters?: boolean;
  fontSize?: number;
  /** distance from the grid edge to the label */
  offset?: number;
}): fabric.FabricObject[] {
  const { slot, cells, sides, font } = opts;
  const color = opts.color ?? '#111827';
  const cell = slot.size / cells;
  const fs = opts.fontSize ?? Math.max(6, Math.min(13, cell * 0.42));
  const off = opts.offset ?? cell * 0.42;
  const letters = opts.rowsAsLetters ?? true;
  const out: fabric.FabricObject[] = [];

  const make = (label: string, cx: number, cy: number, side: CoordSide, i: number) => {
    const t = new fabric.Textbox(label, {
      left: cx,
      top: cy,
      width: cell,
      fontSize: fs,
      fontFamily: font,
      fill: color,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      splitByGrapheme: false,
    });
    // Always tag the role — the layout engine finds these by role, and the
    // puzzle id is stamped on later by build-pages when it knows it. Tagging
    // only when an id was supplied made the labels invisible to relayout.
    const a = t as unknown as Record<string, unknown>;
    a.moduleId = 'sudoku';
    a.sudokuRole = `sudoku-coord:${side}:${i}`;
    a.name = 'grid reference';
    if (opts.puzzleId) a.sudokuPuzzle = opts.puzzleId;
    out.push(t);
  };

  for (const side of sides) {
    for (let i = 0; i < cells; i++) {
      if (side === 'top' || side === 'bottom') {
        const cx = slot.left + (i + 0.5) * cell;
        const cy = side === 'top'
          ? slot.top - off - fs * 0.5
          : slot.top + slot.size + off + fs * 0.5;
        make(colLabel(i), cx, cy, side, i);
      } else {
        const cy = slot.top + (i + 0.5) * cell;
        const cx = side === 'left'
          ? slot.left - off - fs * 0.5
          : slot.left + slot.size + off + fs * 0.5;
        make(letters ? rowLabel(i) : colLabel(i), cx, cy, side, i);
      }
    }
  }
  return out;
}

/** Parse a coordinate role back into its side and index. */
export function parseCoordRole(role: string): { side: CoordSide; index: number } | null {
  if (!role.startsWith('sudoku-coord:')) return null;
  const [, side, idx] = role.split(':');
  const i = Number(idx);
  if (!side || Number.isNaN(i)) return null;
  return { side: side as CoordSide, index: i };
}
