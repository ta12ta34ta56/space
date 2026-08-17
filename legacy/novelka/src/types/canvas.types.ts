/**
 * Core canvas/page types for Novelka.
 *
 * Fabric JSON is the canonical element model. These types intentionally define
 * project and page metadata only; do not add a parallel element abstraction
 * unless the Fabric persistence layer is replaced.
 */

export type Unit = 'px' | 'mm' | 'in';

export interface PageSize {
  name: string;
  /** width/height in CSS pixels at 72dpi (1pt = 1px) */
  width: number;
  height: number;
}

/** 1 inch = 72 points. KDP works in inches, the canvas works in points. */
export const IN = 72;

export interface PageSizePreset extends PageSize {
  /** shown in the picker */
  label: string;
  group: 'kdp' | 'paper' | 'other';
  note?: string;
  /** KDP requires a bleed of 0.125" on outer edges for full-bleed interiors */
  kdp?: boolean;
}

/**
 * Page presets. KDP trim sizes come first — most users of this app are
 * publishing journals and low-content books to Amazon KDP.
 */
export const PAGE_SIZE_PRESETS: Record<string, PageSizePreset> = {
  // ---- KDP trim sizes (inches -> points) -------------------------------
  kdp6x9:      { name: 'kdp6x9',      label: '6 × 9 in',        group: 'kdp', width: 6 * IN,   height: 9 * IN,   note: 'Most popular — journals, KDP', kdp: true },
  kdp85x11:    { name: 'kdp85x11',    label: '8.5 × 11 in',     group: 'kdp', width: 8.5 * IN, height: 11 * IN,  note: 'Workbooks, lecture notes',     kdp: true },
  kdp55x85:    { name: 'kdp55x85',    label: '5.5 × 8.5 in',    group: 'kdp', width: 5.5 * IN, height: 8.5 * IN, note: 'Guided journals, field notes', kdp: true },
  kdp5x8:      { name: 'kdp5x8',      label: '5 × 8 in',        group: 'kdp', width: 5 * IN,   height: 8 * IN,   note: 'Pocket notebooks',             kdp: true },
  kdp7x10:     { name: 'kdp7x10',     label: '7 × 10 in',       group: 'kdp', width: 7 * IN,   height: 10 * IN,  note: 'Activity & puzzle books',      kdp: true },
  kdp8x10:     { name: 'kdp8x10',     label: '8 × 10 in',       group: 'kdp', width: 8 * IN,   height: 10 * IN,  note: 'Large print, kids books',      kdp: true },
  kdp825x6:    { name: 'kdp825x6',    label: '8.25 × 6 in',     group: 'kdp', width: 8.25 * IN, height: 6 * IN,    note: 'KDP landscape paperback',      kdp: true },
  kdp825x825:  { name: 'kdp825x825',  label: '8.25 × 8.25 in',  group: 'kdp', width: 8.25 * IN, height: 8.25 * IN, note: 'Square — photo & kids',      kdp: true },

  // ---- standard paper ---------------------------------------------------
  A4:     { name: 'A4',     label: 'A4',        group: 'paper', width: 595, height: 842, note: '210 × 297 mm' },
  A5:     { name: 'A5',     label: 'A5',        group: 'paper', width: 420, height: 595, note: '148 × 210 mm' },
  letter: { name: 'letter', label: 'US Letter', group: 'paper', width: 612, height: 792, note: '8.5 × 11 in' },
  legal:  { name: 'legal',  label: 'US Legal',  group: 'paper', width: 612, height: 1008, note: '8.5 × 14 in' },

  // ---- other ------------------------------------------------------------
  square: { name: 'square', label: 'Square',    group: 'other', width: 600, height: 600 },
};

/** Back-compat alias used across the editor. */
export const PAGE_SIZES: Record<string, PageSize> = PAGE_SIZE_PRESETS;

/**
 * A KDP submission is two separate files: the wraparound cover and the
 * interior. The cover lives in the same project for convenience but is
 * excluded from page numbering, interior templates and interior export.
 */
export type PageRole = 'cover' | 'interior';

/**
 * Machine-readable generator kind, stamped on every generated page at creation
 * time and persisted forever. This is the SOLE basis for "apply to all" — we
 * never guess a page's generator by shape or object count.
 */
export type GeneratorKind =
  | 'sudoku'
  | 'wordsearch'
  | 'crossword'
  | 'maze'
  | 'handwriting'
  | 'template'
  | null;

export interface Page {
  id: string;
  name: string;
  width: number;
  height: number;
  background: string | null; // null === transparent
  /** Serialized fabric.js state for this page */
  data: unknown | null;
  thumbnail?: string;
  /** defaults to 'interior' when absent */
  role?: PageRole;
  /** Which generator produced this page (set at generation time, persisted). */
  kind?: GeneratorKind;
}

export const isCover = (p: Page) => p.role === 'cover';
export const isInterior = (p: Page) => p.role !== 'cover';

export interface LayerInfo {
  id: string;
  name: string;
  type: string;
  locked: boolean;
  visible: boolean;
  index: number;
  isActive: boolean;
}

export interface ProjectFile {
  version: 1;
  name: string;
  pages: Page[];
  createdAt: string;
  updatedAt: string;
  /**
   * Book-level print settings (trim in points, paper stock, binding). The
   * cover's flat geometry is DERIVED from these + the interior page count —
   * it is never stored as an independent page size choice.
   */
  book?: {
    trimWidth: number;
    trimHeight: number;
    paper: 'white' | 'cream' | 'groundwood' | 'color-standard' | 'color-premium';
    binding: 'paperback' | 'hardcover';
  };
}
