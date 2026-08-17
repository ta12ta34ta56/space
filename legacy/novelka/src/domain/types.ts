/**
 * Fabric-free domain model for Novelka.
 *
 * All coordinates and dimensions are in PDF points (1 inch = 72 pt).
 * Fabric JSON is a rendering target only; this model is the canonical source of truth.
 */

export type Unit = 'pt' | 'in' | 'mm';

export interface PageSizeSpec {
  name: string;
  /** width in PDF points (1/72 inch) */
  width: number;
  /** height in PDF points (1/72 inch) */
  height: number;
  unit?: Unit;
  label?: string;
  group?: 'kdp' | 'paper' | 'custom';
}

export interface RectFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Margins {
  top: number;
  bottom: number;
  outer: number;
  gutter: number;
  bleed?: number;
}

export interface BleedInsets {
  top: number;
  bottom: number;
  outer: number;
  inner: number;
}

export interface PageGeometry {
  width: number;
  height: number;
  pageNumber: number;
  pageCount: number;
  /** true for odd pages (right/recto), false for even pages (left/verso) */
  isRecto: boolean;
  margins: Margins;
  safeArea: RectFrame;
  bleed: BleedInsets;
  trimBox: RectFrame;
}

export type InstanceRole =
  | 'puzzle'
  | 'solution'
  | 'title'
  | 'subtitle'
  | 'word-list'
  | 'grid'
  | 'instruction'
  | 'decoration'
  | 'page-number'
  | 'divider';

export type LetterCase = 'upper' | 'lower';
export type GridStyle = 'plain' | 'lines' | 'boxes' | 'shaded';
export type BankStyle = 'columns' | 'inline' | 'boxed' | 'checklist';
export type AnswerStyle = 'line' | 'oval' | 'highlight';

export interface LayoutConfiguration {
  boxSize?: number;
  puzzlesPerPage?: number;
  puzzleIndex?: number;
  gridColumns?: number;
  gridRows?: number;
  bankColumns?: number;
  bankPosition?: 'bottom' | 'side' | 'inline';
  titlePosition?: 'top' | 'none';
  minCellSize?: number;
  minLetterSize?: number;
  minTitleSize?: number;
  minBankFontSize?: number;
  maxGridSize?: number;
  gap?: number;
  padding?: number;
  offsetX?: number;
  offsetY?: number;
  alignment?: 'center' | 'left' | 'right';
  [key: string]: unknown;
}

export interface StyleConfiguration {
  fontFamily: string;
  letterColor: string;
  gridLineColor: string;
  gridLineWidth: number;
  frameWidth: number;
  backgroundColor: string | null;
  /** 0-1, letter size relative to the cell */
  fontScale: number;
  letterSpacing: number;
  letterCase: LetterCase;
  gridStyle: GridStyle;
  bankStyle: BankStyle;
  bankColumns: number;
  bankFontSize: number;
  bankColor: string;
  titleFontSize?: number;
  titleColor?: string;
  showTitle: boolean;
  showDifficulty: boolean;
  showWordBank: boolean;
  answerColor?: string;
  answerStyle?: AnswerStyle;
  accentColor?: string;
  [key: string]: unknown;
}

export interface UserOverrides {
  isOverridden: boolean;
  layout?: Partial<LayoutConfiguration>;
  style?: Partial<StyleConfiguration>;
  customFrame?: Partial<RectFrame>;
  appliedAt?: string;
}

export interface InstanceSourceData {
  seed?: number;
  puzzleIndex?: number;
  theme?: string;
  difficulty?: string;
  gridSize?: number;
  words?: string[];
  secret?: string;
  rawMetadata?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * A GeneratedInstance represents a single logical element on a page.
 * objectIds remains an empty array in Phase 1 (Fabric mapping is deferred to Phase 2).
 */
export interface GeneratedInstance {
  instanceId: string;
  kind: string;
  pageId: string;
  contentId: string;
  objectIds: string[];
  role: InstanceRole;
  layout: LayoutConfiguration;
  style: StyleConfiguration;
  source: InstanceSourceData;
  overrides?: UserOverrides;
}

export type LayoutWarningCode =
  | 'GRID_BELOW_MINIMUM'
  | 'WORD_LIST_OVERFLOW'
  | 'TITLE_OVERFLOW'
  | 'GUTTER_COLLISION'
  | 'SAFE_AREA_COLLISION'
  | 'UNREADABLE_TEXT'
  | 'CONTENT_DOES_NOT_FIT'
  | 'MISSING_SOLUTION'
  | 'TEMPLATE_FALLBACK';

export interface LayoutWarning {
  code: LayoutWarningCode;
  message: string;
  severity: 'error' | 'warn';
  instanceId?: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface FallbackDecision {
  rule: string;
  reason: string;
  from: unknown;
  to: unknown;
}

export interface ResolvedTemplateMetadata {
  templateId: string;
  version: string;
  status: string;
  name: string;
  fallbackApplied: boolean;
  reason?: string;
}

export interface LayoutMeasurements {
  pageWidth: number;
  pageHeight: number;
  safeArea: RectFrame;
  availableWidth: number;
  availableHeight: number;
  titleHeight: number;
  footerHeight: number;
  bodyHeight: number;
  gridSide: number;
  cellSize: number;
  bankHeight: number;
  bankRows: number;
  bankColumns: number;
  bankFontSize: number;
  titleFontSize: number;
  letterFontSize: number;
  puzzlesPerPage: number;
}

export interface PuzzleLayoutFrame {
  id: string;
  puzzleIndex: number;
  unitFrame: RectFrame;
  captionFrame?: RectFrame;
  gridFrame: RectFrame;
  cellSize: number;
  gridSize: number;
  wordListFrame?: RectFrame;
  bankColumns: number;
  bankRows: number;
  bankItemFrames?: RectFrame[];
  dividerFrame?: RectFrame;
}

export interface WordSearchFrames {
  titleFrame?: RectFrame;
  subtitleFrame?: RectFrame;
  puzzles: PuzzleLayoutFrame[];
  pageNumberFrame?: RectFrame;
  footerFrame?: RectFrame;
  instructionFrame?: RectFrame;
}

export interface WordSearchLayoutResult {
  ok: boolean;
  frames: WordSearchFrames;
  warnings: LayoutWarning[];
  measurements: LayoutMeasurements;
  fallbackDecisions: FallbackDecision[];
  template?: ResolvedTemplateMetadata;
}

export interface WordSearchPuzzleInput {
  id: string;
  index: number;
  title?: string;
  theme?: string;
  difficulty?: string;
  size: number;
  words: string[];
  secret?: string;
}

export interface WordSearchContentSpec {
  puzzles: WordSearchPuzzleInput[];
  pageType: 'puzzle' | 'solution';
  puzzlesPerPage?: number;
  title?: string;
  subtitle?: string;
  theme?: string;
  showFolio?: boolean;
  folio?: number;
  templateId?: string;
  template?: import('./template-types').ParametricTemplate;
  trimSizeKey?: string;
}

export interface WordSearchLayoutConstraints {
  minCellSize?: number;
  minLetterSize?: number;
  minTitleSize?: number;
  minBankFontSize?: number;
  maxBankColumns?: number;
  targetGap?: number;
  headerGap?: number;
  footerGap?: number;
  titleMaxHeightRatio?: number;
  bankMaxHeightRatio?: number;
}

export interface BookSettings {
  trimSize: string;
  bleed: boolean;
  paper: 'bw-white' | 'bw-cream' | 'bw-groundwood' | 'standard-color' | 'premium-color';
  targetPageCount: number;
  gutterIntent?: 'minimum' | 'safe';
  solutionArrangement: 'back_of_book' | 'next_page' | 'none';
  puzzlesPerPage: number;
  solutionsPerPage: number;
  showFolio?: boolean;
  defaultFont?: string;
}

export interface DomainPage {
  id: string;
  pageNumber: number;
  role: 'interior' | 'cover';
  kind: 'puzzle' | 'solution' | 'standard' | 'blank';
  geometry: PageGeometry;
  instances: GeneratedInstance[];
  templateId?: string;
  templateVersion?: string;
  templateStatus?: string;
  rawLegacyMeta?: Record<string, unknown>;
}

export interface Book {
  id: string;
  title: string;
  theme?: string;
  settings: BookSettings;
  pageSize: PageSizeSpec;
  pageCount: number;
  pages: DomainPage[];
  globalStyles: StyleConfiguration;
  createdAt: string;
  updatedAt: string;
}
