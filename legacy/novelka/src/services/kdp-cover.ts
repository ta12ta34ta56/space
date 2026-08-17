import { IN } from '../types/canvas.types';

/**
 * KDP paperback cover calculator.
 *
 * A KDP cover is ONE flat PDF containing back cover + spine + front cover,
 * plus 0.125" bleed on all four sides. Get the spine width wrong and Amazon
 * rejects the file, so the paper-stock multipliers below are Amazon's own.
 *
 * spine width (inches) = page count x multiplier for the paper type
 */

export type PaperType = 'white' | 'cream' | 'groundwood' | 'color-standard' | 'color-premium';
export type BindingType = 'paperback' | 'hardcover';

export interface PaperStock {
  id: PaperType;
  label: string;
  /** inches of spine per interior page */
  perPage: number;
  minPages: number;
  maxPages: number;
  note: string;
}

export const PAPER_STOCKS: PaperStock[] = [
  { id: 'white', label: 'Black ink, white paper', perPage: 0.002252, minPages: 24, maxPages: 828, note: 'Most common' },
  { id: 'cream', label: 'Black ink, cream paper', perPage: 0.0025, minPages: 24, maxPages: 776, note: 'Novels, journals' },
  { id: 'groundwood', label: 'Black ink, groundwood paper', perPage: 0.00235, minPages: 24, maxPages: 812, note: 'Economy paper' },
  { id: 'color-standard', label: 'Colour, standard paper', perPage: 0.002347, minPages: 72, maxPages: 600, note: 'Colour interior' },
  { id: 'color-premium', label: 'Colour, premium paper', perPage: 0.002347, minPages: 24, maxPages: 828, note: 'Photo books' },
];

/** Bleed on every outer edge of a cover. */
export const COVER_BLEED_IN = 0.125;

/** KDP wants nothing important within this of the spine fold or trim edge. */

/** Hardcover adds a wrap allowance and a hinge either side of the spine. */
export const HARDCOVER_WRAP_IN = 0.75;

export interface CoverSpec {
  /** everything below is in POINTS unless the name says inches */
  trimWidth: number;
  trimHeight: number;
  pageCount: number;
  paper: PaperType;
  binding: BindingType;

  spine: number;
  spineInches: number;
  bleed: number;
  /** full flat cover including bleed */
  totalWidth: number;
  totalHeight: number;
  /** x of the spine's left edge within the flat cover */
  spineLeft: number;
  /** whether KDP will print spine text (strictly more than 79 pages) */
  spineTextAllowed: boolean;
  warnings: string[];
}

export function calculateCover(
  trimWidthIn: number,
  trimHeightIn: number,
  pageCount: number,
  paper: PaperType = 'white',
  binding: BindingType = 'paperback',
): CoverSpec {
  const stock = PAPER_STOCKS.find((s) => s.id === paper) ?? PAPER_STOCKS[0];
  const warnings: string[] = [];

  let spineIn = pageCount * stock.perPage;

  if (binding === 'hardcover') {
    // KDP hardcover spine uses a stepped table; this is the published approximation
    spineIn = pageCount * stock.perPage + 0.06;
  }

  const bleedIn = COVER_BLEED_IN;
  const wrapIn = binding === 'hardcover' ? HARDCOVER_WRAP_IN : 0;

  const totalWidthIn = trimWidthIn * 2 + spineIn + bleedIn * 2 + wrapIn * 2;
  const totalHeightIn = trimHeightIn + bleedIn * 2 + wrapIn * 2;

  const minPages = binding === 'hardcover' ? 75 : stock.minPages;
  const maxPages = binding === 'hardcover' ? 550 : stock.maxPages;
  if (pageCount < minPages)
    warnings.push(`KDP ${binding}s need at least ${minPages} pages for this paper/interior choice.`);
  if (pageCount > maxPages)
    warnings.push(`KDP ${binding}s allow at most ${maxPages} pages for this paper/interior choice.`);
  if (pageCount <= 79)
    warnings.push('Spine text is only printed on books with more than 79 pages.');

  return {
    trimWidth: trimWidthIn * IN,
    trimHeight: trimHeightIn * IN,
    pageCount,
    paper,
    binding,
    spine: spineIn * IN,
    spineInches: spineIn,
    bleed: bleedIn * IN,
    totalWidth: totalWidthIn * IN,
    totalHeight: totalHeightIn * IN,
    spineLeft: (bleedIn + wrapIn + trimWidthIn) * IN,
    spineTextAllowed: pageCount > 79,
    warnings,
  };
}

export interface CoverZone {
  id: 'back' | 'spine' | 'front';
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The three panels of the flat cover, in points. */
export function coverZones(spec: CoverSpec): CoverZone[] {
  const wrap = spec.binding === 'hardcover' ? HARDCOVER_WRAP_IN * IN : 0;
  const x0 = spec.bleed + wrap;
  const y0 = spec.bleed + wrap;
  return [
    { id: 'back', left: x0, top: y0, width: spec.trimWidth, height: spec.trimHeight },
    { id: 'spine', left: x0 + spec.trimWidth, top: y0, width: spec.spine, height: spec.trimHeight },
    {
      id: 'front',
      left: x0 + spec.trimWidth + spec.spine,
      top: y0,
      width: spec.trimWidth,
      height: spec.trimHeight,
    },
  ];
}

export function formatIn(pt: number, digits = 3) {
  return `${(pt / IN).toFixed(digits)}"`;
}
