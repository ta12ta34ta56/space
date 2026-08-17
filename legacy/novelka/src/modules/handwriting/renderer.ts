import * as fabric from 'fabric';
import type { GlyphPlacement, PracticeRow } from './generator';

/**
 * Worksheet geometry -> canvas elements.
 *
 * Everything is a plain fabric object (CRITICAL RULE #4): guides are Lines,
 * dots are tiny Circles or Lines, letters are Paths or Textboxes. Once placed
 * the user can move, recolour, resize or delete any single piece.
 *
 * Every object is tagged `hwRole` / `hwPuzzle` so the live-adjust engine can
 * find it later. Those keys MUST exist in `CanvasEngine.EXTRA_PROPS` or they
 * are silently dropped on the first page save — that omission has broken every
 * previous module at least once.
 */

export type GuideStyle = 'four-line' | 'three-line' | 'baseline-only' | 'boxes' | 'none';

export interface HandwritingStyle {
  fontFamily: string;
  /** the dotted / outlined letter to trace */
  traceColor: string;
  /** ruled guide lines */
  guideColor: string;
  /** the midline is usually dashed and lighter than the rest */
  midlineColor: string;
  guideWidth: number;
  traceWidth: number;
  guideStyle: GuideStyle;
  /** green start dot, red stop — the convention children are taught */
  startDotColor: string;
  arrowColor: string;
  showStrokeNumbers: boolean;
  backgroundColor: string | null;
}

export const DEFAULT_STYLE: HandwritingStyle = {
  fontFamily: 'Inter',
  traceColor: '#b8bfcc',
  guideColor: '#9aa4b5',
  midlineColor: '#c3cad6',
  guideWidth: 0.8,
  traceWidth: 2.4,
  guideStyle: 'four-line',
  startDotColor: '#2fa96b',
  arrowColor: '#6b7280',
  showStrokeNumbers: true,
  backgroundColor: null,
};

type Any = Record<string, unknown>;

/** Tag an object so the layout engine can find it again. */
function tag(o: fabric.FabricObject, role: string, id: string): fabric.FabricObject {
  const a = o as unknown as Any;
  a.hwRole = role;
  a.hwPuzzle = id;
  a.moduleId = 'handwriting';
  return o;
}

const line = (
  x1: number, y1: number, x2: number, y2: number,
  stroke: string, width: number, dash?: number[],
) =>
  new fabric.Line([x1, y1, x2, y2], {
    stroke,
    strokeWidth: width,
    strokeDashArray: dash,
    strokeLineCap: 'round',
    selectable: true,
    objectCaching: false,
  });

/**
 * Ruled guide lines for one practice row.
 *
 * The midline is dashed on purpose: it marks x-height, which is a *reference*
 * rather than a line letters sit on. Solid midlines get traced by mistake.
 */
export function renderGuides(
  row: PracticeRow,
  left: number,
  width: number,
  style: HandwritingStyle,
  id: string,
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  const { guideColor, midlineColor, guideWidth } = style;

  if (style.guideStyle === 'none') return out;

  if (style.guideStyle === 'boxes') {
    // A single box per row, for very young children who need a container
    // rather than a set of lines.
    out.push(tag(new fabric.Rect({
      left, top: row.ascender,
      width, height: row.descender - row.ascender,
      fill: null, stroke: guideColor, strokeWidth: guideWidth,
      rx: 3, ry: 3, objectCaching: false,
    }), 'hw-guide-box', id));
    out.push(tag(line(left, row.baseline, left + width, row.baseline,
      guideColor, guideWidth * 1.4), 'hw-guide-baseline', id));
    return out;
  }

  // baseline is always solid and always present — it is the line letters sit on
  out.push(tag(line(left, row.baseline, left + width, row.baseline,
    guideColor, guideWidth * 1.5), 'hw-guide-baseline', id));

  if (style.guideStyle === 'baseline-only') return out;

  out.push(tag(line(left, row.ascender, left + width, row.ascender,
    guideColor, guideWidth), 'hw-guide-ascender', id));
  out.push(tag(line(left, row.midline, left + width, row.midline,
    midlineColor, guideWidth, [4, 4]), 'hw-guide-midline', id));

  if (style.guideStyle === 'four-line') {
    out.push(tag(line(left, row.descender, left + width, row.descender,
      guideColor, guideWidth), 'hw-guide-descender', id));
  }
  return out;
}

/**
 * A traced letter.
 *
 * Dotted and dashed styles emit one Line per dash. That is more objects than a
 * single Path with `strokeDashArray`, but it is deliberate: the user can delete
 * or recolour individual dots, and — more importantly — a dash array is
 * resolution-dependent when the object is scaled, so dots would stretch into
 * stripes the moment someone resized the letter.
 */
export function renderGlyph(
  g: GlyphPlacement,
  style: HandwritingStyle,
  id: string,
  strokeIndexBase = 0,
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  if (!g.traced) return out;

  if (g.dashes.length) {
    for (const d of g.dashes) {
      out.push(tag(line(d.x1, d.y1, d.x2, d.y2, style.traceColor, style.traceWidth),
        'hw-trace-dash', id));
    }
  } else {
    // outline / solid-grey: one Path per stroke, so stroke order survives
    for (const pts of g.paths) {
      if (pts.length < 2) continue;
      const d = pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
      out.push(tag(new fabric.Path(d, {
        fill: null,
        stroke: style.traceColor,
        strokeWidth: style.traceWidth,
        strokeLineCap: 'round',
        strokeLineJoin: 'round',
        objectCaching: false,
      }), 'hw-trace-path', id));
    }
  }

  // Start dots and numbers go on the FIRST traced copy only. Repeating them on
  // every letter turns the row into visual noise.
  if (strokeIndexBase === 0) {
    g.starts.forEach((p, i) => {
      out.push(tag(new fabric.Circle({
        left: p.x, top: p.y,
        radius: Math.max(1.8, g.height * 0.022),
        fill: style.startDotColor,
        originX: 'center', originY: 'center',
        objectCaching: false,
      }), `hw-start-${i}`, id));

      if (style.showStrokeNumbers && g.starts.length > 1) {
        const fs = Math.max(6, g.height * 0.10);
        // Offset opposite the direction of travel, so the number sits behind
        // the pen rather than on top of the line it is about to draw.
        const h = g.headings[i] ?? 0;
        const off = fs * 0.95;
        out.push(tag(new fabric.Textbox(String(i + 1), {
          left: p.x - Math.cos(h) * off,
          top: p.y - Math.sin(h) * off,
          width: fs * 2,
          fontSize: fs,
          fontFamily: style.fontFamily,
          fill: style.arrowColor,
          textAlign: 'center',
          originX: 'center', originY: 'center',
          objectCaching: false,
        }), `hw-stroke-num-${i}`, id));
      }
    });
  }

  return out;
}

/** Arrowhead showing the direction each stroke travels. */
export function renderArrows(
  g: GlyphPlacement,
  style: HandwritingStyle,
  id: string,
): fabric.FabricObject[] {
  const out: fabric.FabricObject[] = [];
  const size = Math.max(3, g.height * 0.045);

  g.starts.forEach((p, i) => {
    const h = g.headings[i] ?? 0;
    // Place the head a little way along the stroke, not exactly on the start
    // dot, or the two overlap into a blob.
    const cx = p.x + Math.cos(h) * size * 1.6;
    const cy = p.y + Math.sin(h) * size * 1.6;
    const tri = new fabric.Triangle({
      left: cx, top: cy,
      width: size, height: size * 1.3,
      fill: style.arrowColor,
      originX: 'center', originY: 'center',
      // fabric Triangle points up; rotate so it points along the heading
      angle: (h * 180) / Math.PI + 90,
      objectCaching: false,
    });
    out.push(tag(tri, `hw-arrow-${i}`, id));
  });

  return out;
}

/** One complete practice row: guides, letters, marks. */
export function renderRow(
  row: PracticeRow,
  left: number,
  width: number,
  style: HandwritingStyle,
  id: string,
  showArrows: boolean,
): fabric.FabricObject[] {
  const out = renderGuides(row, left, width, style, id);
  row.glyphs.forEach((g, i) => {
    out.push(...renderGlyph(g, style, id, i));
    if (showArrows && i === 0) out.push(...renderArrows(g, style, id));
  });
  return out;
}
