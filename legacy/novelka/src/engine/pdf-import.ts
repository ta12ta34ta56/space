// pdfjs-dist is ~1.3 MB — loaded lazily so the main bundle stays lean.
// It is only needed when the user actually opens the PDF importer.
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { nanoid } from 'nanoid';
import { KDP_MIN_IMAGE_DPI } from '../services/kdp';
import type { Page } from '../types/canvas.types';

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((m) => {
      m.GlobalWorkerOptions.workerSrc = workerSrc;
      return m;
    });
  }
  return pdfjsPromise;
}

export interface ImportOptions {
  /** render scale relative to PDF points; 300 DPI is 300 / 72 = 4.1667 */
  scale?: number;
  /** lock the imported page image so it can't be dragged by accident */
  lockBackground?: boolean;
  maxPages?: number;
  onProgress?: (done: number, total: number) => void;
}

/**
 * Import a PDF as editable pages.
 *
 * Each PDF page becomes a Novelka page whose background is the rendered
 * artwork (a normal fabric image element — CRITICAL RULE #4). Users then
 * layer text, stickers and shapes on top. Extracting the original vector
 * text as editable objects is a Phase 3 upgrade.
 */
export async function importPDF(
  file: File | ArrayBuffer,
  options: ImportOptions = {},
): Promise<Page[]> {
  const {
    scale = KDP_MIN_IMAGE_DPI / 72,
    lockBackground = true,
    maxPages = 100,
    onProgress,
  } = options;

  const data = file instanceof ArrayBuffer ? file : await file.arrayBuffer();
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;

  const total = Math.min(doc.numPages, maxPages);
  const pages: Page[] = [];

  for (let i = 1; i <= total; i++) {
    onProgress?.(i - 1, total);

    const pdfPage = await doc.getPage(i);
    // viewport at scale 1 == the true point size of the page
    const base = pdfPage.getViewport({ scale: 1 });
    const view = pdfPage.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(view.width);
    canvas.height = Math.ceil(view.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not create a rendering context');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await pdfPage.render({ canvasContext: ctx, viewport: view }).promise;

    const render = canvas.toDataURL('image/png');
    canvas.width = canvas.height = 0; // free memory eagerly

    const width = Math.round(base.width);
    const height = Math.round(base.height);

    // Build the fabric JSON directly so no live canvas is needed.
    pages.push({
      id: nanoid(8),
      name: `Page ${i}`,
      width,
      height,
      background: '#ffffff',
      data: {
        version: '6.0.0',
        objects: [
          {
            type: 'Image',
            version: '6.0.0',
            originX: 'left',
            originY: 'top',
            left: 0,
            top: 0,
            width: canvasSizeOf(view.width),
            height: canvasSizeOf(view.height),
            scaleX: width / canvasSizeOf(view.width),
            scaleY: height / canvasSizeOf(view.height),
            src: render,
            crossOrigin: null,
            selectable: !lockBackground,
            evented: !lockBackground,
            id: nanoid(8),
            elementType: 'image',
            name: `PDF page ${i}`,
            locked: lockBackground,
          },
        ],
        background: '#ffffff',
      },
    });

    pdfPage.cleanup();
  }

  onProgress?.(total, total);
  await doc.destroy();
  return pages;
}

function canvasSizeOf(v: number) {
  return Math.ceil(v);
}

/** Quick page count + size probe without rendering anything. */
export async function inspectPDF(file: File) {
  const data = await file.arrayBuffer();
  const pdfjs = await getPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
  const first = await doc.getPage(1);
  const vp = first.getViewport({ scale: 1 });
  const info = {
    pageCount: doc.numPages,
    width: Math.round(vp.width),
    height: Math.round(vp.height),
  };
  await doc.destroy();
  return info;
}
