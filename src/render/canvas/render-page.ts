/**
 * Page renderer — draws a Document Page onto a Fabric canvas (spec 05 §2).
 *
 * Rules:
 *  - Reads page.elements in z order and draws them. That is all it does.
 *  - Converts inches -> px exactly once at the boundary using model/units.
 *  - Writes nothing back. No toJSON(), no toObject(), no reading geometry off Fabric.
 *  - Fabric objects carry { elementId } for hit-testing and nothing else.
 *  - A puzzle element renders as ONE Fabric object (D3) — a placeholder frame.
 *  - kind is read from the element, never inferred (invariant 8).
 */

import {
  Canvas,
  Circle,
  Ellipse,
  FabricObject,
  FabricText,
  Group,
  Line,
  Polygon,
  Rect,
  StaticCanvas,
  Textbox,
  Triangle,
} from 'fabric';
import type { BookSettings, Element, Page } from '../../model/types';
import { inToPx, ptToIn, PT_PER_IN } from '../../model/units';

export type CanvasElementObject = FabricObject & {
  elementId?: string;
};

function createStarPoints(w: number, h: number): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  const cx = w / 2;
  const cy = h / 2;
  const outerR = Math.min(w, h) / 2;
  const innerR = outerR * 0.4;
  const numPoints = 5;
  for (let i = 0; i < numPoints * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / numPoints - Math.PI / 2;
    points.push({
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    });
  }
  return points;
}

function renderElement(element: Element, scale: number): FabricObject | null {
  if (element.hidden) {
    return null;
  }

  const left = inToPx(element.frame.xIn, scale);
  const top = inToPx(element.frame.yIn, scale);
  const width = inToPx(element.frame.wIn, scale);
  const height = inToPx(element.frame.hIn, scale);

  switch (element.type) {
    case 'text': {
      const fontSize = inToPx(ptToIn(element.style.fontSizePt), scale);
      const textObj = new Textbox(element.text, {
        left,
        top,
        width,
        fontFamily: element.style.fontFamily,
        fontSize,
        fontWeight: element.style.bold ? 'bold' : 'normal',
        fontStyle: element.style.italic ? 'italic' : 'normal',
        underline: element.style.underline,
        textAlign: element.style.align,
        fill: element.style.colorHex,
        originX: 'left',
        originY: 'top',
        selectable: !element.locked,
        evented: !element.locked,
      });
      (textObj as unknown as CanvasElementObject).elementId = element.id;
      return textObj;
    }

    case 'shape': {
      const fill = element.shape.fillHex ?? null;
      const stroke = element.shape.strokeHex ?? null;
      const strokeWidth =
        element.shape.strokeWidthPt > 0
          ? inToPx(ptToIn(element.shape.strokeWidthPt), scale)
          : 0;

      const baseOptions = {
        left,
        top,
        fill,
        stroke,
        strokeWidth,
        originX: 'left' as const,
        originY: 'top' as const,
        selectable: !element.locked,
        evented: !element.locked,
      };

      let shapeObj: FabricObject;
      switch (element.shape.shape) {
        case 'rect':
          shapeObj = new Rect({ ...baseOptions, width, height });
          break;
        case 'rounded-rect': {
          const rx = Math.min(width, height) * 0.1;
          shapeObj = new Rect({ ...baseOptions, width, height, rx, ry: rx });
          break;
        }
        case 'circle': {
          const radius = Math.min(width, height) / 2;
          shapeObj = new Circle({ ...baseOptions, radius });
          break;
        }
        case 'ellipse': {
          shapeObj = new Ellipse({ ...baseOptions, rx: width / 2, ry: height / 2 });
          break;
        }
        case 'triangle': {
          shapeObj = new Triangle({ ...baseOptions, width, height });
          break;
        }
        case 'line': {
          shapeObj = new Line([left, top + height / 2, left + width, top + height / 2], {
            ...baseOptions,
            strokeWidth: Math.max(1, strokeWidth),
          });
          break;
        }
        case 'polygon': {
          const points = [
            { x: width * 0.5, y: 0 },
            { x: width, y: height * 0.25 },
            { x: width, y: height * 0.75 },
            { x: width * 0.5, y: height },
            { x: 0, y: height * 0.75 },
            { x: 0, y: height * 0.25 },
          ];
          shapeObj = new Polygon(points, { ...baseOptions, width, height });
          break;
        }
        case 'star': {
          const points = createStarPoints(width, height);
          shapeObj = new Polygon(points, { ...baseOptions, width, height });
          break;
        }
        case 'arrow': {
          const points = [
            { x: 0, y: height * 0.3 },
            { x: width * 0.6, y: height * 0.3 },
            { x: width * 0.6, y: 0 },
            { x: width, y: height * 0.5 },
            { x: width * 0.6, y: height },
            { x: width * 0.6, y: height * 0.7 },
            { x: 0, y: height * 0.7 },
          ];
          shapeObj = new Polygon(points, { ...baseOptions, width, height });
          break;
        }
      }
      (shapeObj as unknown as CanvasElementObject).elementId = element.id;
      return shapeObj;
    }

    case 'image': {
      const bg = new Rect({
        left: 0,
        top: 0,
        width,
        height,
        fill: '#f0f0f0',
        stroke: '#cccccc',
        strokeWidth: 1,
        originX: 'left',
        originY: 'top',
      });
      const label = new FabricText(`[Image: ${element.assetId}]`, {
        left: width / 2,
        top: height / 2,
        fontSize: Math.max(10, Math.min(14, width / 10)),
        fontFamily: 'sans-serif',
        fill: '#666666',
        originX: 'center',
        originY: 'center',
      });
      const imageGroup = new Group([bg, label], {
        left,
        top,
        width,
        height,
        originX: 'left',
        originY: 'top',
        selectable: !element.locked,
        evented: !element.locked,
      });
      (imageGroup as unknown as CanvasElementObject).elementId = element.id;
      return imageGroup;
    }

    case 'puzzle': {
      // D3: A generated puzzle is ONE Fabric object (placeholder until Unit 12)
      const bg = new Rect({
        left: 0,
        top: 0,
        width,
        height,
        fill: 'rgba(194, 65, 12, 0.08)',
        stroke: '#c2410c',
        strokeWidth: 1,
        originX: 'left',
        originY: 'top',
      });
      const label = new FabricText(`[Puzzle: ${element.puzzle.kind}]`, {
        left: width / 2,
        top: height / 2,
        fontSize: Math.max(12, Math.min(18, width / 12)),
        fontFamily: 'sans-serif',
        fill: '#c2410c',
        originX: 'center',
        originY: 'center',
      });
      const puzzleGroup = new Group([bg, label], {
        left,
        top,
        width,
        height,
        originX: 'left',
        originY: 'top',
        selectable: !element.locked,
        evented: !element.locked,
      });
      (puzzleGroup as unknown as CanvasElementObject).elementId = element.id;
      return puzzleGroup;
    }
  }
}

/**
 * Pure rendering function: Document Page -> Fabric pixels.
 *
 * Stores nothing, writes nothing back to the Document.
 */
export function renderPage(
  canvas: Canvas | StaticCanvas,
  page: Page,
  _book: BookSettings,
  scale: number = PT_PER_IN,
): void {
  canvas.clear();
  canvas.backgroundColor = '#ffffff';

  // Sort elements in ascending z order
  const sorted = [...page.elements].sort((a, b) => a.z - b.z);

  for (const element of sorted) {
    const obj = renderElement(element, scale);
    if (obj !== null) {
      canvas.add(obj);
    }
  }

  canvas.requestRenderAll();
}
