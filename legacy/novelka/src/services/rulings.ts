import * as fabric from 'fabric';
import { IN } from '../types/canvas.types';
import { kdpMarginsFor, safeAreaFor } from './kdp';

/**
 * Page rulings — the line patterns that make up a notebook interior.
 *
 * These are the real, named rulings people expect (college, wide, Cornell,
 * handwriting practice with a dashed midline, music staves, isometric…),
 * not just "some lines". Spacing uses the actual published measurements.
 */

const MM = IN / 25.4;

export interface RulingContext {
  w: number;
  h: number;
  pageNumber: number;
  pageCount: number;
  /** line colour */
  color: string;
  /** multiplier on the ruling's natural spacing */
  spacingScale: number;
  /** stroke weight multiplier */
  weightScale: number;
  /** respect the KDP gutter, or run edge to edge inside a plain margin */
  kdpSafe: boolean;
  /** margin used when kdpSafe is false, in points */
  plainMargin: number;
}

export interface RulingDef {
  id: string;
  name: string;
  group: 'writing' | 'grid' | 'specialty';
  /** short spec shown under the name */
  spec: string;
  accessLevel: 'free' | 'ad_unlock' | 'premium_only';
  /** SVG preview markup, viewBox 0 0 100 100 */
  preview: string;
  build: (ctx: RulingContext) => fabric.FabricObject[];
}

function box(ctx: RulingContext) {
  if (ctx.kdpSafe) {
    const m = kdpMarginsFor(ctx.pageCount);
    return safeAreaFor(ctx.w, ctx.h, ctx.pageNumber, m);
  }
  const m = ctx.plainMargin;
  return {
    left: m,
    top: m,
    width: ctx.w - m * 2,
    height: ctx.h - m * 2,
    isRecto: ctx.pageNumber % 2 === 1,
  };
}

const hline = (
  x1: number,
  y: number,
  x2: number,
  color: string,
  width: number,
  dash?: number[],
) =>
  new fabric.Line([x1, y, x2, y], {
    stroke: color,
    strokeWidth: width,
    strokeDashArray: dash,
    selectable: true,
  });

const vline = (
  x: number,
  y1: number,
  y2: number,
  color: string,
  width: number,
  dash?: number[],
) =>
  new fabric.Line([x, y1, x, y2], {
    stroke: color,
    strokeWidth: width,
    strokeDashArray: dash,
    selectable: true,
  });

/** Evenly spaced horizontal rules. */
function ruled(ctx: RulingContext, spacingPt: number, weight = 0.8) {
  const a = box(ctx);
  const gap = spacingPt * ctx.spacingScale;
  const out: fabric.FabricObject[] = [];
  for (let y = a.top + gap; y <= a.top + a.height + 0.5; y += gap) {
    out.push(hline(a.left, y, a.left + a.width, ctx.color, weight * ctx.weightScale));
  }
  return out;
}

const previewLines = (n: number, y0 = 12, gap: number) =>
  Array.from(
    { length: n },
    (_, i) => `<rect x="10" y="${y0 + i * gap}" width="80" height="1" fill="currentColor"/>`,
  ).join('');

// ------------------------------------------------------------------ writing

const college: RulingDef = {
  id: 'college',
  name: 'College ruled',
  group: 'writing',
  spec: '7.1 mm — the standard notebook line',
  accessLevel: 'free',
  preview: previewLines(11, 10, 8),
  build: (ctx) => ruled(ctx, 7.1 * MM),
};

const wide: RulingDef = {
  id: 'wide',
  name: 'Wide ruled',
  group: 'writing',
  spec: '8.7 mm — roomier, good for kids',
  accessLevel: 'free',
  preview: previewLines(9, 12, 10),
  build: (ctx) => ruled(ctx, 8.7 * MM),
};

const narrow: RulingDef = {
  id: 'narrow',
  name: 'Narrow ruled',
  group: 'writing',
  spec: '6.35 mm — fits more per page',
  accessLevel: 'free',
  preview: previewLines(14, 8, 6.4),
  build: (ctx) => ruled(ctx, 6.35 * MM),
};

const handwriting: RulingDef = {
  id: 'handwriting',
  name: 'Handwriting practice',
  group: 'writing',
  spec: 'Solid baseline, dashed midline',
  accessLevel: 'free',
  preview: [0, 1, 2, 3]
    .map((i) => {
      const y = 12 + i * 22;
      return (
        `<rect x="10" y="${y}" width="80" height="0.8" fill="currentColor" opacity=".55"/>` +
        `<rect x="10" y="${y + 8}" width="80" height="0.8" fill="currentColor" opacity=".35" stroke-dasharray="2"/>` +
        `<rect x="10" y="${y + 16}" width="80" height="1.4" fill="currentColor"/>`
      );
    })
    .join(''),
  build: (ctx) => {
    const a = box(ctx);
    const unit = 8 * MM * ctx.spacingScale; // height of one writing band
    const out: fabric.FabricObject[] = [];
    for (let y = a.top; y + unit <= a.top + a.height + 0.5; y += unit * 1.5) {
      const w = ctx.weightScale;
      out.push(hline(a.left, y, a.left + a.width, ctx.color, 0.7 * w)); // top
      out.push(
        hline(a.left, y + unit / 2, a.left + a.width, ctx.color, 0.6 * w, [4, 4]),
      ); // dashed mid
      out.push(hline(a.left, y + unit, a.left + a.width, ctx.color, 1.3 * w)); // baseline
    }
    return out;
  },
};

const cornell: RulingDef = {
  id: 'cornell',
  name: 'Cornell notes',
  group: 'writing',
  spec: 'Cue column, notes area, summary',
  accessLevel: 'free',
  preview:
    `<rect x="10" y="8" width="80" height="70" fill="none" stroke="currentColor" stroke-width="1"/>` +
    `<rect x="32" y="8" width="1" height="70" fill="currentColor"/>` +
    `<rect x="10" y="78" width="80" height="1" fill="currentColor"/>` +
    previewLines(6, 22, 9).replace(/x="10"/g, 'x="36"').replace(/width="80"/g, 'width="52"'),
  build: (ctx) => {
    const a = box(ctx);
    const w = ctx.weightScale;
    const cueW = a.width * 0.3;
    const summaryH = a.height * 0.18;
    const notesBottom = a.top + a.height - summaryH;
    const out: fabric.FabricObject[] = [
      // outer frame
      new fabric.Rect({
        left: a.left,
        top: a.top,
        width: a.width,
        height: a.height,
        fill: null,
        stroke: ctx.color,
        strokeWidth: 1.1 * w,
      }),
      vline(a.left + cueW, a.top, notesBottom, ctx.color, 1.1 * w),
      hline(a.left, notesBottom, a.left + a.width, ctx.color, 1.1 * w),
    ];
    const gap = 7.1 * MM * ctx.spacingScale;
    for (let y = a.top + gap; y < notesBottom - 2; y += gap) {
      out.push(hline(a.left + cueW, y, a.left + a.width, ctx.color, 0.6 * w));
    }
    return out;
  },
};

const doubleLine: RulingDef = {
  id: 'double',
  name: 'Two column ruled',
  group: 'writing',
  spec: 'Split page, lines both sides',
  accessLevel: 'free',
  preview:
    `<rect x="50" y="8" width="1" height="84" fill="currentColor"/>` +
    previewLines(9, 12, 9).replace(/width="80"/g, 'width="36"') +
    previewLines(9, 12, 9).replace(/x="10"/g, 'x="54"').replace(/width="80"/g, 'width="36"'),
  build: (ctx) => {
    const a = box(ctx);
    const w = ctx.weightScale;
    const gap = 7.1 * MM * ctx.spacingScale;
    const mid = a.left + a.width / 2;
    const colW = a.width / 2 - 10;
    const out: fabric.FabricObject[] = [vline(mid, a.top, a.top + a.height, ctx.color, 0.9 * w)];
    for (let y = a.top + gap; y <= a.top + a.height + 0.5; y += gap) {
      out.push(hline(a.left, y, a.left + colW, ctx.color, 0.8 * w));
      out.push(hline(mid + 10, y, a.left + a.width, ctx.color, 0.8 * w));
    }
    return out;
  },
};

// --------------------------------------------------------------------- grid

const dotGrid: RulingDef = {
  id: 'dot',
  name: 'Dot grid',
  group: 'grid',
  spec: '5 mm — bullet journal standard',
  accessLevel: 'free',
  preview: Array.from({ length: 9 }, (_, r) =>
    Array.from(
      { length: 9 },
      (_, c) => `<circle cx="${12 + c * 9.5}" cy="${12 + r * 9.5}" r="1.1" fill="currentColor"/>`,
    ).join(''),
  ).join(''),
  build: (ctx) => {
    const a = box(ctx);
    const step = 5 * MM * ctx.spacingScale;
    const out: fabric.FabricObject[] = [];
    for (let y = a.top; y <= a.top + a.height + 0.5; y += step) {
      for (let x = a.left; x <= a.left + a.width + 0.5; x += step) {
        out.push(
          new fabric.Circle({
            left: x,
            top: y,
            radius: 0.85 * ctx.weightScale,
            fill: ctx.color,
            originX: 'center',
            originY: 'center',
          }),
        );
      }
    }
    return out;
  },
};

const graphGrid: RulingDef = {
  id: 'graph',
  name: 'Graph paper',
  group: 'grid',
  spec: '5 mm squares',
  accessLevel: 'free',
  preview:
    Array.from({ length: 10 }, (_, i) => `<rect x="8" y="${10 + i * 8.5}" width="84" height="0.6" fill="currentColor"/>`).join('') +
    Array.from({ length: 10 }, (_, i) => `<rect x="${10 + i * 8.5}" y="8" width="0.6" height="84" fill="currentColor"/>`).join(''),
  build: (ctx) => {
    const a = box(ctx);
    const step = 5 * MM * ctx.spacingScale;
    const w = 0.55 * ctx.weightScale;
    const out: fabric.FabricObject[] = [];
    for (let y = a.top; y <= a.top + a.height + 0.5; y += step)
      out.push(hline(a.left, y, a.left + a.width, ctx.color, w));
    for (let x = a.left; x <= a.left + a.width + 0.5; x += step)
      out.push(vline(x, a.top, a.top + a.height, ctx.color, w));
    return out;
  },
};

const quadGrid: RulingDef = {
  id: 'quad',
  name: 'Quad with major lines',
  group: 'grid',
  spec: '5 mm, bold every 5th',
  accessLevel: 'free',
  preview:
    Array.from({ length: 10 }, (_, i) => `<rect x="8" y="${10 + i * 8.5}" width="84" height="${i % 5 === 0 ? 1.3 : 0.5}" fill="currentColor" opacity="${i % 5 === 0 ? 1 : .5}"/>`).join('') +
    Array.from({ length: 10 }, (_, i) => `<rect x="${10 + i * 8.5}" y="8" width="${i % 5 === 0 ? 1.3 : 0.5}" height="84" fill="currentColor" opacity="${i % 5 === 0 ? 1 : .5}"/>`).join(''),
  build: (ctx) => {
    const a = box(ctx);
    const step = 5 * MM * ctx.spacingScale;
    const out: fabric.FabricObject[] = [];
    let i = 0;
    for (let y = a.top; y <= a.top + a.height + 0.5; y += step, i++) {
      const major = i % 5 === 0;
      out.push(hline(a.left, y, a.left + a.width, ctx.color, (major ? 1.1 : 0.45) * ctx.weightScale));
    }
    i = 0;
    for (let x = a.left; x <= a.left + a.width + 0.5; x += step, i++) {
      const major = i % 5 === 0;
      out.push(vline(x, a.top, a.top + a.height, ctx.color, (major ? 1.1 : 0.45) * ctx.weightScale));
    }
    return out;
  },
};

const isometric: RulingDef = {
  id: 'isometric',
  name: 'Isometric',
  group: 'grid',
  spec: '30° triangles for 3D sketching',
  accessLevel: 'ad_unlock',
  preview: (() => {
    let s = '';
    for (let i = -6; i < 14; i++) {
      s += `<line x1="${i * 10}" y1="0" x2="${i * 10 + 58}" y2="100" stroke="currentColor" stroke-width="0.6"/>`;
      s += `<line x1="${i * 10}" y1="100" x2="${i * 10 + 58}" y2="0" stroke="currentColor" stroke-width="0.6"/>`;
    }
    return `<g opacity=".7">${s}</g>`;
  })(),
  build: (ctx) => {
    const a = box(ctx);
    const step = 6 * MM * ctx.spacingScale;
    const w = 0.5 * ctx.weightScale;
    const out: fabric.FabricObject[] = [];
    const dx = a.height / Math.tan((60 * Math.PI) / 180);
    for (let x = a.left - dx; x <= a.left + a.width + dx; x += step) {
      out.push(
        new fabric.Line([x, a.top + a.height, x + dx, a.top], {
          stroke: ctx.color,
          strokeWidth: w,
          clipPath: new fabric.Rect({
            left: a.left,
            top: a.top,
            width: a.width,
            height: a.height,
            absolutePositioned: true,
          }),
        }),
      );
      out.push(
        new fabric.Line([x, a.top, x + dx, a.top + a.height], {
          stroke: ctx.color,
          strokeWidth: w,
          clipPath: new fabric.Rect({
            left: a.left,
            top: a.top,
            width: a.width,
            height: a.height,
            absolutePositioned: true,
          }),
        }),
      );
    }
    return out;
  },
};

// --------------------------------------------------------------- specialty

const musicStaff: RulingDef = {
  id: 'music',
  name: 'Music staves',
  group: 'specialty',
  spec: '5-line staves for manuscript',
  accessLevel: 'free',
  preview: [0, 1, 2, 3]
    .map((s) =>
      [0, 1, 2, 3, 4]
        .map((l) => `<rect x="10" y="${10 + s * 23 + l * 3.4}" width="80" height="0.8" fill="currentColor"/>`)
        .join(''),
    )
    .join(''),
  build: (ctx) => {
    const a = box(ctx);
    const lineGap = 2.2 * MM * ctx.spacingScale;
    const staffH = lineGap * 4;
    const staffGap = staffH * 1.9;
    const out: fabric.FabricObject[] = [];
    for (let y = a.top; y + staffH <= a.top + a.height; y += staffH + staffGap) {
      for (let l = 0; l < 5; l++) {
        out.push(
          hline(a.left, y + l * lineGap, a.left + a.width, ctx.color, 0.7 * ctx.weightScale),
        );
      }
    }
    return out;
  },
};

const storyboard: RulingDef = {
  id: 'storyboard',
  name: 'Storyboard',
  group: 'specialty',
  spec: 'Frames with caption lines',
  accessLevel: 'ad_unlock',
  preview: [0, 1, 2]
    .map(
      (i) =>
        `<rect x="10" y="${8 + i * 30}" width="46" height="26" fill="none" stroke="currentColor" stroke-width="1"/>` +
        `<rect x="60" y="${14 + i * 30}" width="30" height="0.8" fill="currentColor"/>` +
        `<rect x="60" y="${22 + i * 30}" width="30" height="0.8" fill="currentColor"/>`,
    )
    .join(''),
  build: (ctx) => {
    const a = box(ctx);
    const rows = 4;
    const rowH = a.height / rows;
    const frameW = a.width * 0.55;
    const out: fabric.FabricObject[] = [];
    for (let r = 0; r < rows; r++) {
      const y = a.top + r * rowH;
      out.push(
        new fabric.Rect({
          left: a.left,
          top: y + 6,
          width: frameW,
          height: rowH - 18,
          fill: null,
          stroke: ctx.color,
          strokeWidth: 1.1 * ctx.weightScale,
          rx: 3,
          ry: 3,
        }),
      );
      const lines = 4;
      const lg = (rowH - 18) / lines;
      for (let l = 1; l <= lines; l++) {
        out.push(
          hline(
            a.left + frameW + 14,
            y + 6 + l * lg,
            a.left + a.width,
            ctx.color,
            0.7 * ctx.weightScale,
          ),
        );
      }
    }
    return out;
  },
};

const recipeCard: RulingDef = {
  id: 'recipe',
  name: 'Recipe layout',
  group: 'specialty',
  spec: 'Ingredients column + method lines',
  accessLevel: 'ad_unlock',
  preview:
    `<rect x="10" y="8" width="30" height="84" fill="none" stroke="currentColor" stroke-width="1"/>` +
    previewLines(9, 14, 9).replace(/x="10"/g, 'x="46"').replace(/width="80"/g, 'width="44"'),
  build: (ctx) => {
    const a = box(ctx);
    const colW = a.width * 0.34;
    const out: fabric.FabricObject[] = [
      new fabric.Rect({
        left: a.left,
        top: a.top,
        width: colW,
        height: a.height,
        fill: null,
        stroke: ctx.color,
        strokeWidth: 1 * ctx.weightScale,
        rx: 4,
        ry: 4,
      }),
    ];
    const gap = 7.1 * MM * ctx.spacingScale;
    for (let y = a.top + gap; y <= a.top + a.height; y += gap) {
      out.push(hline(a.left + colW + 14, y, a.left + a.width, ctx.color, 0.7 * ctx.weightScale));
      out.push(hline(a.left + 8, y, a.left + colW - 8, ctx.color, 0.5 * ctx.weightScale, [3, 3]));
    }
    return out;
  },
};

const blank: RulingDef = {
  id: 'blank',
  name: 'Blank',
  group: 'writing',
  spec: 'No lines — clears the page',
  accessLevel: 'free',
  preview: `<rect x="10" y="10" width="80" height="80" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="4 4"/>`,
  build: () => [],
};

export const RULINGS: RulingDef[] = [
  college,
  wide,
  narrow,
  handwriting,
  cornell,
  doubleLine,
  dotGrid,
  graphGrid,
  quadGrid,
  isometric,
  musicStaff,
  storyboard,
  recipeCard,
  blank,
];

export const RULING_GROUPS = [
  { key: 'writing', label: 'Writing lines' },
  { key: 'grid', label: 'Grids' },
  { key: 'specialty', label: 'Specialty' },
] as const;

export const DEFAULT_RULING_CTX: Omit<RulingContext, 'w' | 'h' | 'pageNumber' | 'pageCount'> = {
  color: '#c9d1dc',
  spacingScale: 1,
  weightScale: 1,
  kdpSafe: true,
  plainMargin: 0.5 * IN,
};
