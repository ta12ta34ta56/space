/**
 * Guide geometry — the rectangles the guide overlays draw, computed here and
 * nowhere else (Unit 06).
 *
 * Guides are computed in `print/` and drawn in `ui/`: a React component may
 * not compute a margin (architecture.md §6, ownership rule 4). Everything in
 * this file is read from Unit 03 — `safeAreaFor`, `kdpMarginsFor`,
 * `coverSpecFor`, `barcodeKeepOutIn`. No new KDP math is written here; if a
 * number is missing from Unit 03, that is raised, not invented (spec 06 §1).
 *
 * Placement facts, all inherited from Unit 03 and the legacy reference:
 *
 *  - Interior: odd page numbers are right-hand (recto) and their gutter is on
 *    the LEFT. Get this wrong and every guide is mirrored on half the book.
 *  - Interior bleed extends past the top, bottom and OUTSIDE edges only. The
 *    gutter edge is bound into the spine and is never trimmed.
 *  - Cover: coordinates are within the flat cover, bleed included, exactly as
 *    `CoverSpec` defines them. The spine fold and barcode keep-out exist only
 *    here — an interior page never shows them. Cover safe-area placement is
 *    ported from `legacy/novelka/src/services/cover-guides.ts` (panels inset
 *    by KDP's 0.25 in minimum margin); the numbers come from `print/cover.ts`.
 *
 * Every displayed number carries a unit (ui-context.md §8), so the labels
 * built here say `0.375 in`, never `0.375`.
 */

import type { BookSettings, Frame } from '../model';
import { roundIn } from '../model';
import { COVER_BLEED_IN, barcodeKeepOutIn, coverSpecFor } from './cover';
import { BLEED_IN, OUTER_MARGIN_MIN_IN, kdpMarginsFor, safeAreaFor } from './margins';
import { TRIM_SIZE_IN } from './trims';

/** The six guide kinds. Instrument markings with fixed meanings (ui-context §2). */
export const GUIDE_KINDS = ['bleed', 'trim', 'safe', 'gutter', 'spine', 'barcode'] as const;
export type GuideKind = (typeof GUIDE_KINDS)[number];

/** Which surface the guides are for. The cover is isolated (invariant 6). */
export const GUIDE_SURFACES = ['interior', 'cover'] as const;
export type GuideSurface = (typeof GUIDE_SURFACES)[number];

/** One guide rectangle, in inches, in the surface's own coordinate space. */
export type Guide = {
  readonly kind: GuideKind;
  readonly rectIn: Frame;
  readonly label: string;
};

export type GuideOptions = {
  readonly surface: GuideSurface;
  /** The book-level bleed toggle (D9). Interior only; covers always bleed. */
  readonly bleedOn: boolean;
};

/** Thrown when guides are requested for a page that cannot exist. */
export class GuideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GuideError';
  }
}

/** Cover safe margin: KDP's 0.25 in minimum, per the ported legacy placement. */
const COVER_SAFE_MARGIN_IN = OUTER_MARGIN_MIN_IN;

const inset = (frame: Frame, marginIn: number): Frame => ({
  xIn: frame.xIn + marginIn,
  yIn: frame.yIn + marginIn,
  wIn: Math.max(0, frame.wIn - marginIn * 2),
  hIn: Math.max(0, frame.hIn - marginIn * 2),
});

/**
 * The guides for one surface of the book.
 *
 * `pageIndex` is zero-based print order; the human page number is
 * `pageIndex + 1`, so index 0 is page 1, a recto. For the cover, `pageIndex`
 * is ignored — the cover is one flat surface.
 */
export function guidesFor(
  book: BookSettings,
  pageIndex: number,
  pageCount: number,
  options: GuideOptions,
): readonly Guide[] {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new GuideError(`guidesFor: pageIndex must be a whole number of 0 or more, received ${String(pageIndex)}.`);
  }
  if (!Number.isInteger(pageCount) || pageCount < 0) {
    throw new GuideError(`guidesFor: pageCount must be a whole number of 0 or more, received ${String(pageCount)}.`);
  }

  if (options.surface === 'cover') {
    return coverGuides(book, pageCount);
  }

  if (pageIndex >= pageCount) {
    throw new GuideError(
      `guidesFor: pageIndex ${pageIndex} is outside a book of ${pageCount} pages.`,
    );
  }
  return interiorGuides(book, pageIndex, pageCount, options.bleedOn);
}

/* ------------------------------------------------------------- interior -- */

function interiorGuides(
  book: BookSettings,
  pageIndex: number,
  pageCount: number,
  bleedOn: boolean,
): readonly Guide[] {
  const size = TRIM_SIZE_IN[book.trimId];
  const pageNumber = pageIndex + 1;
  const margins = kdpMarginsFor(pageCount, { bleed: bleedOn });
  const safe = safeAreaFor(book.trimId, book.paper, pageCount, pageNumber, { bleed: bleedOn });

  const guides: Guide[] = [];

  if (bleedOn) {
    // Bleed extends past the top, bottom and outside edges. The gutter edge
    // is bound into the spine and is never trimmed, so it gets no bleed.
    guides.push({
      kind: 'bleed',
      rectIn: {
        xIn: safe.isRecto ? 0 : -BLEED_IN,
        yIn: -BLEED_IN,
        wIn: size.widthIn + BLEED_IN,
        hIn: size.heightIn + BLEED_IN * 2,
      },
      label: `Bleed ${roundIn(BLEED_IN)} in`,
    });
  }

  guides.push({
    kind: 'trim',
    rectIn: { xIn: 0, yIn: 0, wIn: size.widthIn, hIn: size.heightIn },
    label: `Trim ${roundIn(size.widthIn)} × ${roundIn(size.heightIn)} in`,
  });

  guides.push({
    kind: 'safe',
    rectIn: { xIn: safe.xIn, yIn: safe.yIn, wIn: safe.wIn, hIn: safe.hIn },
    label: 'Safe area',
  });

  guides.push({
    kind: 'gutter',
    rectIn: {
      xIn: safe.isRecto ? 0 : size.widthIn - margins.gutterIn,
      yIn: 0,
      wIn: margins.gutterIn,
      hIn: size.heightIn,
    },
    label: `Gutter ${roundIn(margins.gutterIn)} in`,
  });

  return guides;
}

/* ---------------------------------------------------------------- cover -- */

function coverGuides(book: BookSettings, pageCount: number): readonly Guide[] {
  // Throws UnsupportedBindingError for hardcover and PageCountError for a
  // count KDP would refuse — Unit 03's refusals, passed through unchanged.
  const spec = coverSpecFor(book.trimId, book.paper, pageCount, book.binding);
  const size = TRIM_SIZE_IN[book.trimId];

  const trimRect: Frame = {
    xIn: COVER_BLEED_IN,
    yIn: COVER_BLEED_IN,
    wIn: size.widthIn * 2 + spec.spineIn,
    hIn: size.heightIn,
  };

  const backPanel: Frame = {
    xIn: trimRect.xIn,
    yIn: trimRect.yIn,
    wIn: size.widthIn,
    hIn: size.heightIn,
  };
  const frontPanel: Frame = {
    xIn: spec.spineLeftIn + spec.spineIn,
    yIn: trimRect.yIn,
    wIn: size.widthIn,
    hIn: size.heightIn,
  };

  const barcode = barcodeKeepOutIn(book.trimId);

  return [
    {
      kind: 'bleed',
      rectIn: { xIn: 0, yIn: 0, wIn: spec.widthIn, hIn: spec.heightIn },
      label: `Bleed ${roundIn(spec.widthIn)} × ${roundIn(spec.heightIn)} in`,
    },
    {
      kind: 'trim',
      rectIn: trimRect,
      label: `Trim ${roundIn(trimRect.wIn)} × ${roundIn(trimRect.hIn)} in`,
    },
    {
      kind: 'spine',
      rectIn: {
        xIn: spec.spineLeftIn,
        yIn: trimRect.yIn,
        wIn: spec.spineIn,
        hIn: size.heightIn,
      },
      label: `Spine fold ${roundIn(spec.spineIn)} in`,
    },
    {
      kind: 'safe',
      rectIn: inset(backPanel, COVER_SAFE_MARGIN_IN),
      label: 'Safe area, back cover',
    },
    {
      kind: 'safe',
      rectIn: inset(frontPanel, COVER_SAFE_MARGIN_IN),
      label: 'Safe area, front cover',
    },
    {
      kind: 'barcode',
      rectIn: { xIn: barcode.xIn, yIn: barcode.yIn, wIn: barcode.wIn, hIn: barcode.hIn },
      label: `Barcode keep-out ${roundIn(barcode.wIn)} × ${roundIn(barcode.hIn)} in`,
    },
  ];
}
