import { nanoid } from 'nanoid';
import { isCover, type Page } from '../types/canvas.types';
import { loadFont } from '../engine/font-manager';

export type NumberPosition =
  | 'bottom-center'
  | 'bottom-outer'
  | 'bottom-inner'
  | 'top-center'
  | 'top-outer';

export interface PageNumberOptions {
  position: NumberPosition;
  fontFamily: string;
  fontSize: number;
  color: string;
  /** page index (1-based) to begin numbering at — front matter is often skipped */
  startAtPage: number;
  /** the number printed on that first numbered page */
  startNumber: number;
  /** distance from the trim edge, in points */
  margin: number;
  /** e.g. "{n}" or "— {n} —" or "Page {n}" */
  format: string;
  skipFirst: boolean;
}

export const DEFAULT_PAGE_NUMBERS: PageNumberOptions = {
  position: 'bottom-center',
  fontFamily: 'Inter',
  fontSize: 10,
  color: '#6b7280',
  startAtPage: 1,
  startNumber: 1,
  margin: 28,
  format: '{n}',
  skipFirst: false,
};

/** Marker so we can find and replace previously stamped numbers. */
export const PAGE_NUMBER_TAG = 'novelka:page-number';

/** Pre-rename tag, still recognised so old books can re-number correctly. */
const PAGE_NUMBER_TAG_LEGACY = 'minipdf:page-number';
const PAGE_NUMBER_TAG_LEGACY_GRIDPRESS = 'gridpress:page-number';

/** Is this object one of ours, under either the current or the old tag? */
const isPageNumber = (o: unknown) => {
  const name = (o as { name?: string }).name;
  return name === PAGE_NUMBER_TAG || name === PAGE_NUMBER_TAG_LEGACY || name === PAGE_NUMBER_TAG_LEGACY_GRIDPRESS;
};

function xFor(
  pos: NumberPosition,
  pageWidth: number,
  margin: number,
  isRightHandPage: boolean,
) {
  // "outer" = away from the spine. Odd pages sit on the right in a bound book.
  if (pos.endsWith('center')) return pageWidth / 2;
  const outerIsRight = isRightHandPage;
  if (pos.endsWith('outer')) return outerIsRight ? pageWidth - margin : margin;
  return outerIsRight ? margin : pageWidth - margin; // inner
}

/**
 * Stamp page numbers onto every page's stored fabric JSON.
 * Runs on the serialized data, so it works without a live canvas and covers
 * every page at once — not just the one on screen.
 */
export async function applyPageNumbers(
  pages: Page[],
  opts: PageNumberOptions,
): Promise<Page[]> {
  await loadFont(opts.fontFamily);

  let interiorNo = 0;
  return pages.map((page) => {
    // The cover is a separate file — it is never numbered.
    if (isCover(page)) return page;
    interiorNo += 1;
    const pageNo = interiorNo;
    const data = (page.data as { objects?: unknown[] } | null) ?? { objects: [] };
    const objects = Array.isArray(data.objects) ? [...data.objects] : [];

    // drop any previously stamped number
    const cleaned = objects.filter(
      (o) => !isPageNumber(o),
    );

    const shouldNumber =
      pageNo >= opts.startAtPage && !(opts.skipFirst && pageNo === 1);

    if (!shouldNumber) {
      return { ...page, data: { ...data, objects: cleaned } };
    }

    const n = opts.startNumber + (pageNo - opts.startAtPage);
    const text = opts.format.replace(/\{n\}/g, String(n));
    const isRight = pageNo % 2 === 1;

    const top = opts.position.startsWith('top')
      ? opts.margin
      : page.height - opts.margin;

    const label = {
      type: 'Textbox',
      version: '6.0.0',
      text,
      left: xFor(opts.position, page.width, opts.margin, isRight),
      top,
      width: Math.max(60, opts.fontSize * 8),
      fontSize: opts.fontSize,
      fontFamily: opts.fontFamily,
      fill: opts.color,
      textAlign: 'center',
      originX: 'center',
      originY: 'center',
      id: nanoid(8),
      name: PAGE_NUMBER_TAG,
      elementType: 'text',
      selectable: true,
      evented: true,
    };

    return { ...page, data: { ...data, objects: [...cleaned, label] } };
  });
}

/** Remove every stamped page number. */
export function removePageNumbers(pages: Page[]): Page[] {
  return pages.map((page) => {
    const data = (page.data as { objects?: unknown[] } | null) ?? { objects: [] };
    const objects = Array.isArray(data.objects) ? data.objects : [];
    return {
      ...page,
      data: {
        ...data,
        objects: objects.filter((o) => !isPageNumber(o)),
      },
    };
  });
}

export function hasPageNumbers(pages: Page[]): boolean {
  return pages.some((p) => {
    const data = p.data as { objects?: unknown[] } | null;
    return (data?.objects ?? []).some(
      (o) => isPageNumber(o),
    );
  });
}

