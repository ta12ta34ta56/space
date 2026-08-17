/**
 * Parsing unknown input into a Document.
 *
 * A saved project, a migrated document, an imported file: none of them are
 * trusted just because we wrote them (code-standards.md, Security §1). Every
 * value is checked and rebuilt into a known type here. Nothing is ever cast.
 *
 * This module answers "is this the right SHAPE?". Whether a well-shaped
 * document also satisfies the model invariants (unique ids, positive
 * dimensions) is `assertValidDocument`'s question, in `document.ts`.
 */

import {
  BINDINGS,
  ELEMENT_KINDS,
  GENERATOR_KINDS,
  PAGE_KINDS,
  PAPER_STOCKS,
  SHAPE_KINDS,
  TEXT_ALIGNS,
  TRIM_IDS,
} from './types';
import type {
  BookSettings,
  Cover,
  Document,
  DocumentMeta,
  Element,
  Frame,
  Page,
  PuzzleSpec,
  ShapeSpec,
  TextStyle,
} from './types';

/**
 * Upper bound on a book title. Titles are user input and must be bounded at
 * the boundary; 200 characters is far beyond any real book title and far below
 * anything that could bloat a saved record.
 */
export const MAX_TITLE_LENGTH = 200;

const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Thrown when input does not have the shape of a Document. */
export class DocumentParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentParseError';
  }
}

function fail(path: string, expected: string, received: unknown): never {
  throw new DocumentParseError(`${path}: expected ${expected}, received ${describe(received)}.`);
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'string') return `the string ${JSON.stringify(value)}`;
  if (typeof value === 'object') return 'an object';
  return String(value);
}

export function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'an object', value);
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, path: string): string {
  if (typeof value !== 'string') fail(path, 'a string', value);
  return value;
}

function asNonEmptyString(value: unknown, path: string): string {
  const text = asString(value, path);
  if (text.length === 0) throw new DocumentParseError(`${path}: must not be empty.`);
  return text;
}

function asFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'a finite number', value);
  return value;
}

function asBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail(path, 'a boolean', value);
  return value;
}

function asArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) fail(path, 'an array', value);
  return value;
}

function asMember<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  const text = asString(value, path);
  const match = allowed.find((candidate) => candidate === text);
  if (match === undefined) {
    throw new DocumentParseError(
      `${path}: expected one of ${allowed.join(', ')}, received the string ${JSON.stringify(text)}.`,
    );
  }
  return match;
}

function asHexColor(value: unknown, path: string): string {
  const text = asString(value, path);
  if (!HEX_COLOR.test(text)) fail(path, 'a hex colour such as #1a2b3c', value);
  return text;
}

function asNullableHexColor(value: unknown, path: string): string | null {
  return value === null ? null : asHexColor(value, path);
}

/** Puzzle data and style are opaque until Unit 12; only `{}` is representable today. */
function asEmptyRecord(value: unknown, path: string): Record<string, never> {
  const record = asRecord(value, path);
  const keys = Object.keys(record);
  if (keys.length > 0) {
    throw new DocumentParseError(
      `${path}: must be empty until the generator schemas land (Unit 12), received the keys ${keys.join(', ')}.`,
    );
  }
  return {};
}

function parseFrame(value: unknown, path: string): Frame {
  const record = asRecord(value, path);
  return {
    xIn: asFiniteNumber(record['xIn'], `${path}.xIn`),
    yIn: asFiniteNumber(record['yIn'], `${path}.yIn`),
    wIn: asFiniteNumber(record['wIn'], `${path}.wIn`),
    hIn: asFiniteNumber(record['hIn'], `${path}.hIn`),
  };
}

function parseTextStyle(value: unknown, path: string): TextStyle {
  const record = asRecord(value, path);
  return {
    fontFamily: asNonEmptyString(record['fontFamily'], `${path}.fontFamily`),
    fontSizePt: asFiniteNumber(record['fontSizePt'], `${path}.fontSizePt`),
    bold: asBoolean(record['bold'], `${path}.bold`),
    italic: asBoolean(record['italic'], `${path}.italic`),
    underline: asBoolean(record['underline'], `${path}.underline`),
    align: asMember(record['align'], TEXT_ALIGNS, `${path}.align`),
    colorHex: asHexColor(record['colorHex'], `${path}.colorHex`),
  };
}

function parseShapeSpec(value: unknown, path: string): ShapeSpec {
  const record = asRecord(value, path);
  return {
    shape: asMember(record['shape'], SHAPE_KINDS, `${path}.shape`),
    fillHex: asNullableHexColor(record['fillHex'], `${path}.fillHex`),
    strokeHex: asNullableHexColor(record['strokeHex'], `${path}.strokeHex`),
    strokeWidthPt: asFiniteNumber(record['strokeWidthPt'], `${path}.strokeWidthPt`),
  };
}

function parsePuzzleSpec(value: unknown, path: string): PuzzleSpec {
  const record = asRecord(value, path);
  return {
    kind: asMember(record['kind'], GENERATOR_KINDS, `${path}.kind`),
    data: asEmptyRecord(record['data'], `${path}.data`),
    style: asEmptyRecord(record['style'], `${path}.style`),
  };
}

function parseElement(value: unknown, path: string): Element {
  const record = asRecord(value, path);
  const base = {
    id: asNonEmptyString(record['id'], `${path}.id`),
    kind: asMember(record['kind'], ELEMENT_KINDS, `${path}.kind`),
    frame: parseFrame(record['frame'], `${path}.frame`),
    z: asFiniteNumber(record['z'], `${path}.z`),
    hidden: asBoolean(record['hidden'], `${path}.hidden`),
    locked: asBoolean(record['locked'], `${path}.locked`),
  };
  const type = asString(record['type'], `${path}.type`);
  switch (type) {
    case 'text':
      return {
        ...base,
        type: 'text',
        text: asString(record['text'], `${path}.text`),
        style: parseTextStyle(record['style'], `${path}.style`),
      };
    case 'shape':
      return { ...base, type: 'shape', shape: parseShapeSpec(record['shape'], `${path}.shape`) };
    case 'image':
      return { ...base, type: 'image', assetId: asNonEmptyString(record['assetId'], `${path}.assetId`) };
    case 'puzzle':
      return { ...base, type: 'puzzle', puzzle: parsePuzzleSpec(record['puzzle'], `${path}.puzzle`) };
    default:
      throw new DocumentParseError(
        `${path}.type: expected one of text, shape, image, puzzle, received the string ${JSON.stringify(type)}.`,
      );
  }
}

function parseElements(value: unknown, path: string): readonly Element[] {
  return asArray(value, path).map((entry, index) => parseElement(entry, `${path}[${index}]`));
}

function parsePage(value: unknown, path: string): Page {
  const record = asRecord(value, path);
  const role = asString(record['role'], `${path}.role`);
  if (role !== 'interior') {
    throw new DocumentParseError(
      `${path}.role: interior pages only. The cover is an isolated surface and lives in document.cover, never in pages. Received the string ${JSON.stringify(role)}.`,
    );
  }
  return {
    id: asNonEmptyString(record['id'], `${path}.id`),
    kind: asMember(record['kind'], PAGE_KINDS, `${path}.kind`),
    role: 'interior',
    elements: parseElements(record['elements'], `${path}.elements`),
    locked: asBoolean(record['locked'], `${path}.locked`),
  };
}

function parseCover(value: unknown, path: string): Cover | null {
  if (value === null) return null;
  const record = asRecord(value, path);
  const role = asString(record['role'], `${path}.role`);
  if (role !== 'cover') {
    fail(`${path}.role`, 'the string "cover"', role);
  }
  return {
    id: asNonEmptyString(record['id'], `${path}.id`),
    role: 'cover',
    elements: parseElements(record['elements'], `${path}.elements`),
    locked: asBoolean(record['locked'], `${path}.locked`),
  };
}

function parseBook(value: unknown, path: string): BookSettings {
  const record = asRecord(value, path);
  return {
    trimId: asMember(record['trimId'], TRIM_IDS, `${path}.trimId`),
    paper: asMember(record['paper'], PAPER_STOCKS, `${path}.paper`),
    binding: asMember(record['binding'], BINDINGS, `${path}.binding`),
  };
}

function parseMeta(value: unknown, path: string): DocumentMeta {
  const record = asRecord(value, path);
  const title = asString(record['title'], `${path}.title`);
  if (title.length > MAX_TITLE_LENGTH) {
    throw new DocumentParseError(
      `${path}.title: must be ${MAX_TITLE_LENGTH} characters or fewer, received ${title.length}.`,
    );
  }
  return {
    title,
    createdAt: asFiniteNumber(record['createdAt'], `${path}.createdAt`),
    updatedAt: asFiniteNumber(record['updatedAt'], `${path}.updatedAt`),
  };
}

/** Reads the `schemaVersion` of unknown input without trusting anything else about it. */
export function readSchemaVersion(value: unknown, path = 'document'): number {
  const record = asRecord(value, path);
  const version = asFiniteNumber(record['schemaVersion'], `${path}.schemaVersion`);
  if (!Number.isInteger(version) || version < 1) {
    fail(`${path}.schemaVersion`, 'an integer of 1 or more', record['schemaVersion']);
  }
  return version;
}

/** Rebuilds unknown input as a Document, or throws a `DocumentParseError` saying why not. */
export function parseDocument(value: unknown, path = 'document'): Document {
  const record = asRecord(value, path);
  return {
    id: asNonEmptyString(record['id'], `${path}.id`),
    schemaVersion: readSchemaVersion(record, path),
    book: parseBook(record['book'], `${path}.book`),
    pages: asArray(record['pages'], `${path}.pages`).map((entry, index) =>
      parsePage(entry, `${path}.pages[${index}]`),
    ),
    cover: parseCover(record['cover'], `${path}.cover`),
    meta: parseMeta(record['meta'], `${path}.meta`),
  };
}
