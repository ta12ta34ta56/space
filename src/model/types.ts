/**
 * The Document model — the single source of truth (architecture.md §2, D2).
 *
 * Rules this file obeys, and every future change to it must keep obeying:
 *
 *  - Plain, serialisable data. No class instances, no functions, no DOM or
 *    renderer objects. If it does not survive `JSON.parse(JSON.stringify(x))`
 *    unchanged, it does not belong here.
 *  - All geometry is in INCHES, and every field says so in its name (`xIn`,
 *    `wIn`). Type sizes are in points (`fontSizePt`). Conversions happen only
 *    in `model/units.ts`.
 *  - `readonly` on every field and every array. Every edit produces a new
 *    Document; nothing is mutated in place.
 *  - No `undefined`. Absence is `null`.
 *  - Derived print geometry (bleed, margins, gutter, safe area, spine, cover
 *    size) is NEVER stored here. It is a pure function of `BookSettings` plus
 *    the page count (architecture.md §3), and it arrives in Unit 03.
 *
 * Each vocabulary below is declared once as a `const` tuple, and its type is
 * derived from it, so the runtime list used for validation and the compile-time
 * union can never drift apart.
 */

/* ------------------------------------------------------------------ book -- */

/** The six supported trims (architecture.md §3). No custom sizes, ever. */
export const TRIM_IDS = ['6x9', '5.5x8.5', '7x10', '8x10', '8.5x11', 'a4'] as const;
export type TrimId = (typeof TRIM_IDS)[number];

/**
 * One paper vocabulary for the whole system (invariant 7). The physical facts
 * about each stock — spine thickness, page-count limits — live in
 * `print/trims.ts`; this tuple is the shared *naming* vocabulary, so the
 * Document model and the print layer can never disagree on a paper's id.
 * `color-standard` shares `bw-white`'s thickness, not premium's — that
 * confusion is D8 defect 1, and its regression test lives in `trims.test.mjs`.
 */
export const PAPER_STOCKS = [
  'bw-white',
  'bw-cream',
  'bw-groundwood',
  'color-standard',
  'color-premium',
] as const;
export type PaperStock = (typeof PAPER_STOCKS)[number];

export const BINDINGS = ['paperback', 'hardcover'] as const;
export type Binding = (typeof BINDINGS)[number];

/** The physical object. Everything printable is derived from these three. */
export type BookSettings = {
  readonly trimId: TrimId;
  readonly paper: PaperStock;
  readonly binding: Binding;
};

/* ----------------------------------------------------------------- pages -- */

export const GENERATOR_KINDS = ['wordsearch', 'sudoku', 'crossword', 'maze', 'handwriting'] as const;
export type GeneratorKind = (typeof GENERATOR_KINDS)[number];

/**
 * A page's kind is assigned at creation and NEVER inferred from its contents
 * (invariant 8).
 */
export const PAGE_KINDS = [...GENERATOR_KINDS, 'template', 'blank'] as const;
export type PageKind = (typeof PAGE_KINDS)[number];

export type Page = {
  readonly id: string;
  readonly kind: PageKind;
  /** Interior only. The cover is an isolated surface (invariant 6). */
  readonly role: 'interior';
  readonly elements: readonly Element[];
  readonly locked: boolean;
};

/**
 * The cover lives in `document.cover` and never in `pages[]` (invariant 6).
 * Its geometry — spine width, wrap, zones — is derived, never stored.
 */
export type Cover = {
  readonly id: string;
  readonly role: 'cover';
  readonly elements: readonly Element[];
  readonly locked: boolean;
};

/* -------------------------------------------------------------- elements -- */

/** Inches, always (architecture.md §3). */
export type Frame = {
  readonly xIn: number;
  readonly yIn: number;
  readonly wIn: number;
  readonly hIn: number;
};

/**
 * Semantic identity, stored at insertion and never re-derived from appearance
 * (D18). A divider is a divider in the data, so the Layers panel, the
 * inspector and preflight can each behave correctly per family without
 * guessing.
 */
export const ELEMENT_KINDS = [
  'text',
  'shape',
  'image',
  'divider',
  'border',
  'pattern',
  'sticker',
  'icon',
  'puzzle',
  'solution',
  'template',
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** The structural payload an element carries. `Element` discriminates on this. */
export const ELEMENT_TYPES = ['text', 'shape', 'image', 'puzzle'] as const;
export type ElementType = (typeof ELEMENT_TYPES)[number];

export const TEXT_ALIGNS = ['left', 'center', 'right'] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];

/** Bold and italic are real font faces, never synthesised (D20). */
export type TextStyle = {
  readonly fontFamily: string;
  readonly fontSizePt: number;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly underline: boolean;
  readonly align: TextAlign;
  readonly colorHex: string;
};

export const SHAPE_KINDS = [
  'rect',
  'rounded-rect',
  'circle',
  'ellipse',
  'triangle',
  'polygon',
  'star',
  'arrow',
  'line',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

export type ShapeSpec = {
  readonly shape: ShapeKind;
  readonly fillHex: string | null;
  readonly strokeHex: string | null;
  readonly strokeWidthPt: number;
};

/**
 * WHAT a puzzle is. Filled in per generator in Unit 12; opaque until then.
 */
export type PuzzleData = Record<string, never>;

/**
 * HOW a puzzle looks. Filled in per generator in Unit 12; opaque until then.
 * Style is a property, not an edit: restyling sets a field here and re-renders.
 * Nothing ever reaches inside a puzzle to patch cells (D3).
 */
export type PuzzleStyle = Record<string, never>;

/** A generated puzzle is ONE semantic object: kind, data, style (D3). */
export type PuzzleSpec = {
  readonly kind: GeneratorKind;
  readonly data: PuzzleData;
  readonly style: PuzzleStyle;
};

type ElementBase = {
  readonly id: string;
  readonly kind: ElementKind;
  readonly frame: Frame;
  readonly z: number;
  readonly hidden: boolean;
  readonly locked: boolean;
};

export type TextElement = ElementBase & {
  readonly type: 'text';
  readonly text: string;
  readonly style: TextStyle;
};

export type ShapeElement = ElementBase & {
  readonly type: 'shape';
  readonly shape: ShapeSpec;
};

export type ImageElement = ElementBase & {
  readonly type: 'image';
  readonly assetId: string;
};

export type PuzzleElement = ElementBase & {
  readonly type: 'puzzle';
  readonly puzzle: PuzzleSpec;
};

export type Element = TextElement | ShapeElement | ImageElement | PuzzleElement;

/* -------------------------------------------------------------- document -- */

export type DocumentMeta = {
  readonly title: string;
  readonly createdAt: number;
  readonly updatedAt: number;
};

export type Document = {
  readonly id: string;
  /** Bumped whenever the shape changes, with a migration in the same commit. */
  readonly schemaVersion: number;
  readonly book: BookSettings;
  /** Interior pages, in print order. */
  readonly pages: readonly Page[];
  /** Isolated surface; `null` when the book has no cover. */
  readonly cover: Cover | null;
  readonly meta: DocumentMeta;
};
