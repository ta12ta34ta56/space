/**
 * The public surface of the model layer.
 *
 * This is the one permitted barrel file (code-standards.md, File organization).
 * The model imports nothing: it is the bottom of the stack.
 */

export {
  BINDINGS,
  ELEMENT_KINDS,
  ELEMENT_TYPES,
  GENERATOR_KINDS,
  PAGE_KINDS,
  PAPER_STOCKS,
  SHAPE_KINDS,
  TEXT_ALIGNS,
  TRIM_IDS,
} from './types';

export type {
  Binding,
  BookSettings,
  Cover,
  Document,
  DocumentMeta,
  Element,
  ElementKind,
  ElementType,
  Frame,
  GeneratorKind,
  ImageElement,
  Page,
  PageKind,
  PaperStock,
  PuzzleData,
  PuzzleElement,
  PuzzleSpec,
  PuzzleStyle,
  ShapeElement,
  ShapeKind,
  ShapeSpec,
  TextAlign,
  TextElement,
  TextStyle,
  TrimId,
} from './types';

export { PT_PER_IN, UnitError, inToPt, inToPx, ptToIn, pxToIn, roundIn } from './units';

export {
  CURRENT_SCHEMA_VERSION,
  DocumentInvariantError,
  assertValidDocument,
  createDocument,
  migrate,
} from './document';
export type { CreateDocumentInput } from './document';

export { DocumentParseError, MAX_TITLE_LENGTH, parseDocument, readSchemaVersion } from './parse';
