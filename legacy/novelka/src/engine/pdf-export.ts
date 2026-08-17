import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont } from 'pdf-lib';
import type * as fabric from 'fabric';
import type { FabricAny } from './canvas-engine';
import { KDP_MIN_IMAGE_DPI } from '../services/kdp';
import { findFontFace } from './font-manager';
import type { Page } from '../types/canvas.types';

export type ExportDPI = 72 | 150 | 300;
export type PdfMode = 'hybrid' | 'raster';

export interface ExportOptions {
  dpi: ExportDPI;
  /** 1-based inclusive page numbers; empty = all */
  pageRange?: number[];
  watermark?: boolean;
  watermarkText?: string;
  /** hybrid = real selectable text + raster art. raster = flat image. */
  mode?: PdfMode;
  transparent?: boolean;
  onProgress?: (done: number, total: number, label: string) => void;
}

/** Offscreen render of a stored page (does not disturb the live canvas). */
async function renderPage(
  page: Page,
  multiplier: number,
  opts: { skipText: boolean; transparent: boolean; format?: 'png' | 'jpeg'; quality?: number },
): Promise<string> {
  const fabricNs = await import('fabric');
  const el = document.createElement('canvas');
  const c = new fabricNs.StaticCanvas(el, {
    width: page.width,
    height: page.height,
    backgroundColor: opts.transparent ? '' : (page.background ?? '#ffffff'),
  });
  if (page.data) await c.loadFromJSON(page.data);
  // A saved page must never carry the editor's zoom/pan into the export.
  c.setViewportTransform([1, 0, 0, 1, 0, 0]);
  c.backgroundColor = opts.transparent ? '' : (page.background ?? '#ffffff');

  if (opts.skipText) {
    c.getObjects().forEach((o) => {
      if (isTextObject(o)) o.visible = false;
    });
  }
  c.renderAll();
  const url = c.toDataURL({
    format: opts.format ?? 'png',
    quality: opts.quality ?? 0.92,
    multiplier,
    enableRetinaScaling: false,
  });
  c.dispose();
  return url;
}

function isTextObject(o: fabric.FabricObject) {
  return o.type === 'textbox' || o.type === 'i-text' || o.type === 'text';
}

/** Collect plain text objects of a page so they can be drawn as real PDF text. */
async function collectText(page: Page): Promise<FabricAny[]> {
  if (!page.data) return [];
  const fabricNs = await import('fabric');
  const el = document.createElement('canvas');
  const c = new fabricNs.StaticCanvas(el, { width: page.width, height: page.height });
  await c.loadFromJSON(page.data);
  const out = c.getObjects().filter((o) => isTextObject(o) && o.visible !== false) as FabricAny[];
  const snapshot = out.map((o) => ({
    text: o.text as string,
    left: o.left as number,
    top: o.top as number,
    width: (o.width ?? 0) * (o.scaleX ?? 1),
    height: (o.height ?? 0) * (o.scaleY ?? 1),
    originX: o.originX,
    originY: o.originY,
    fontSize: (o.fontSize ?? 16) * (o.scaleY ?? 1),
    fontFamily: o.fontFamily,
    fontWeight: o.fontWeight,
    fontStyle: o.fontStyle,
    fill: o.fill,
    opacity: o.opacity ?? 1,
    angle: o.angle ?? 0,
    textAlign: o.textAlign ?? 'left',
    lineHeight: o.lineHeight ?? 1.16,
    lines: (o._textLines as string[][] | undefined)?.map((l) =>
      Array.isArray(l) ? l.join('') : String(l),
    ) ?? String(o.text ?? '').split('\n'),
  }));
  c.dispose();
  return snapshot;
}

function parseColor(fill: unknown) {
  if (typeof fill !== 'string') return rgb(0, 0, 0);
  const s = fill.trim();
  if (s.startsWith('#')) {
    const hex = s.length === 4
      ? s.slice(1).split('').map((ch) => ch + ch).join('')
      : s.slice(1, 7);
    const n = parseInt(hex, 16);
    return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b] = m[1].split(',').map((v) => parseFloat(v));
    return rgb(r / 255, g / 255, b / 255);
  }
  return rgb(0, 0, 0);
}

function pickStandardFont(
  fonts: Record<string, PDFFont>,
  weight: unknown,
  style: unknown,
): PDFFont {
  const bold = weight === 'bold' || Number(weight) >= 600;
  const italic = style === 'italic';
  if (bold && italic) return fonts.boldItalic;
  if (bold) return fonts.bold;
  if (italic) return fonts.italic;
  return fonts.regular;
}

async function pickFont(
  pdf: PDFDocument,
  standardFonts: Record<string, PDFFont>,
  customFonts: Map<string, PDFFont>,
  family: unknown,
  weight: unknown,
  style: unknown,
): Promise<PDFFont> {
  const face = findFontFace(typeof family === 'string' ? family : undefined, weight, style);
  if (!face) return pickStandardFont(standardFonts, weight, style);
  const key = `${face.src}|${face.weight}|${face.style}`;
  const cached = customFonts.get(key);
  if (cached) return cached;
  try {
    const res = await fetch(encodeURI(face.src));
    if (!res.ok) throw new Error('font fetch failed');
    const bytes = await res.arrayBuffer();
    const embedded = await pdf.embedFont(bytes, { subset: true });
    customFonts.set(key, embedded);
    return embedded;
  } catch {
    return pickStandardFont(standardFonts, weight, style);
  }
}

export async function exportPDF(
  pages: Page[],
  projectName: string,
  options: ExportOptions,
): Promise<Blob> {
  const {
    dpi,
    pageRange,
    watermark = false,
    watermarkText = 'Made with Novelka',
    mode = 'hybrid',
    transparent = false,
    onProgress,
  } = options;

  const selected =
    pageRange && pageRange.length
      ? pages.filter((_, i) => pageRange.includes(i + 1))
      : pages;

  const pdf = await PDFDocument.create();
  const fontkit = await import('@pdf-lib/fontkit');
  pdf.registerFontkit(fontkit.default ?? fontkit);
  pdf.setTitle(projectName);
  pdf.setProducer('Novelka');
  pdf.setCreator('Novelka');

  const fonts = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
  };
  const customFonts = new Map<string, PDFFont>();

  // KDP requires 300 DPI minimum for all rasterized manuscript/cover imagery.
  // Even hybrid export has a raster art layer behind vector text, so the PDF
  // renderer must never emit 72/150 DPI print PDFs.
  const rasterDpi = Math.max(dpi, KDP_MIN_IMAGE_DPI);
  const multiplier = rasterDpi / 72;

  for (let i = 0; i < selected.length; i++) {
    const page = selected[i];
    onProgress?.(i, selected.length, `Rendering page ${i + 1}`);

    const pdfPage = pdf.addPage([page.width, page.height]);
    const hybrid = mode === 'hybrid';

    const dataUrl = await renderPage(page, multiplier, {
      skipText: hybrid,
      transparent,
    });
    const png = await pdf.embedPng(dataUrl);
    pdfPage.drawImage(png, { x: 0, y: 0, width: page.width, height: page.height });

    if (hybrid) {
      const texts = await collectText(page);
      for (const t of texts) {
        const font = await pickFont(pdf, fonts, customFonts, t.fontFamily, t.fontWeight, t.fontStyle);
        const color = parseColor(t.fill);
        const size = t.fontSize;
        const lineGap = size * (t.lineHeight || 1.16);

        // fabric origin -> pdf origin (bottom-left)
        const boxLeft = t.originX === 'center' ? t.left - t.width / 2 : t.left;
        const boxTop = t.originY === 'center' ? t.top - t.height / 2 : t.top;

        t.lines.forEach((line: string, li: number) => {
          if (!line) return;
          const textWidth = font.widthOfTextAtSize(line, size);
          let x = boxLeft;
          if (t.textAlign === 'center') x = boxLeft + (t.width - textWidth) / 2;
          else if (t.textAlign === 'right') x = boxLeft + t.width - textWidth;
          const yTop = boxTop + li * lineGap;
          const y = page.height - yTop - size * 0.87;
          pdfPage.drawText(sanitize(line), {
            x,
            y,
            size,
            font,
            color,
            opacity: t.opacity,
            rotate: degrees(-(t.angle || 0)),
          });
        });
      }
    }

    if (watermark) {
      const font = fonts.bold;
      const size = 12;
      const w = font.widthOfTextAtSize(watermarkText, size);
      pdfPage.drawRectangle({
        x: page.width / 2 - w / 2 - 10,
        y: 14,
        width: w + 20,
        height: size + 12,
        color: rgb(0, 0, 0),
        opacity: 0.06,
      });
      pdfPage.drawText(watermarkText, {
        x: page.width / 2 - w / 2,
        y: 20,
        size,
        font,
        color: rgb(0.25, 0.25, 0.3),
        opacity: 0.75,
      });
    }
  }

  onProgress?.(selected.length, selected.length, 'Finalizing');
  const bytes = await pdf.save();
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
}

/** WinAnsi safety for the standard fonts. */
function sanitize(s: string) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[^\x00-\xFF]/g, '?');
}

export async function exportImages(
  pages: Page[],
  options: {
    format: 'png' | 'jpeg';
    dpi: ExportDPI;
    pageRange?: number[];
    transparent?: boolean;
    quality?: number;
  },
): Promise<{ name: string; url: string }[]> {
  const selected =
    options.pageRange && options.pageRange.length
      ? pages.filter((_, i) => options.pageRange!.includes(i + 1))
      : pages;
  const multiplier = options.dpi / 72;
  const out: { name: string; url: string }[] = [];
  for (let i = 0; i < selected.length; i++) {
    const page = selected[i];
    const url = await renderPage(page, multiplier, {
      skipText: false,
      transparent: options.format === 'png' && !!options.transparent,
      format: options.format,
      quality: options.quality ?? 0.92,
    });
    out.push({ name: `${page.name.replace(/\s+/g, '-').toLowerCase()}.${options.format}`, url });
  }
  return out;
}

/**
 * Convenience: current live canvas thumbnail.
 * Rendered at 2× the display width so project cards stay crisp on retina
 * screens, and stored as PNG (JPEG smears small text).
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  triggerDownload(url, filename);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
