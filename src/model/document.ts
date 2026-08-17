/**
 * Creating and validating a Document.
 *
 * Everything here is pure. `createDocument` takes its clock and its id source
 * as arguments and calls nothing else, so the same inputs always produce a
 * byte-identical document (code-standards.md; architecture.md invariant 3).
 *
 * Migration — the schemaVersion upgrade chain — lives in `migrate.ts`. The
 * version constant stays here because `createDocument` is the writer that
 * stamps it, while `migrate` is the reader that upgrades toward it.
 */

import type { Binding, Document, Element, Frame, PaperStock, Page, TrimId } from './types';

/**
 * The schema version this build writes. Bumped with a migration in the same
 * commit. Version 2 exists solely to exercise the migration chain; it is a
 * deliberate no-op over version 1 (spec 04 §3).
 */
export const CURRENT_SCHEMA_VERSION = 2;

/** Thrown when a document breaks a model invariant. */
export class DocumentInvariantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentInvariantError';
  }
}

/* ------------------------------------------------------------- creation -- */

export type CreateDocumentInput = {
  readonly trimId: TrimId;
  readonly paper: PaperStock;
  readonly binding: Binding;
  /** Number of blank interior pages to create. */
  readonly pageCount: number;
  /** Injected clock. `Date.now` is never called inside this module. */
  readonly now: () => number;
  /** Injected id source. `nanoid` is never called inside this module. */
  readonly id: () => string;
};

/**
 * Builds a valid document with `pageCount` blank interior pages and no cover.
 *
 * The cover surface arrives in Unit 10, and page geometry (margins, safe area)
 * is derived from `book` by `print/` in Unit 03 — it is never stored here.
 */
export function createDocument(input: CreateDocumentInput): Document {
  if (!Number.isInteger(input.pageCount) || input.pageCount < 0) {
    throw new DocumentInvariantError(
      `createDocument: pageCount must be a whole number of 0 or more, received ${String(input.pageCount)}.`,
    );
  }

  const timestamp = input.now();
  if (!Number.isFinite(timestamp)) {
    throw new DocumentInvariantError(
      `createDocument: now() must return a finite number, received ${String(timestamp)}.`,
    );
  }

  const pages: Page[] = [];
  for (let index = 0; index < input.pageCount; index += 1) {
    pages.push({
      id: input.id(),
      kind: 'blank',
      role: 'interior',
      elements: [],
      locked: false,
    });
  }

  const document: Document = {
    id: input.id(),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    book: { trimId: input.trimId, paper: input.paper, binding: input.binding },
    pages,
    cover: null,
    meta: { title: '', createdAt: timestamp, updatedAt: timestamp },
  };

  assertValidDocument(document);
  return document;
}

/* ----------------------------------------------------------- validation -- */

function assertFrame(frame: Frame, where: string): void {
  const dimensions: readonly (readonly [string, number])[] = [
    ['xIn', frame.xIn],
    ['yIn', frame.yIn],
    ['wIn', frame.wIn],
    ['hIn', frame.hIn],
  ];
  for (const [field, value] of dimensions) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new DocumentInvariantError(
        `${where}: frame.${field} must be a finite number, received ${String(value)}.`,
      );
    }
  }
  if (frame.wIn < 0) {
    throw new DocumentInvariantError(`${where}: frame.wIn must not be negative, received ${frame.wIn}.`);
  }
  if (frame.hIn < 0) {
    throw new DocumentInvariantError(`${where}: frame.hIn must not be negative, received ${frame.hIn}.`);
  }
}

function assertElement(element: Element, where: string, seenIds: Set<string>): void {
  if (typeof element.id !== 'string' || element.id.length === 0) {
    throw new DocumentInvariantError(`${where}: element id must be a non-empty string.`);
  }
  if (seenIds.has(element.id)) {
    throw new DocumentInvariantError(`${where}: duplicate id ${JSON.stringify(element.id)}.`);
  }
  seenIds.add(element.id);

  assertFrame(element.frame, where);

  if (!Number.isFinite(element.z)) {
    throw new DocumentInvariantError(`${where}: z must be a finite number, received ${String(element.z)}.`);
  }
  if (element.type === 'text' && !Number.isFinite(element.style.fontSizePt)) {
    throw new DocumentInvariantError(
      `${where}: style.fontSizePt must be a finite number, received ${String(element.style.fontSizePt)}.`,
    );
  }
  if (element.type === 'shape' && !Number.isFinite(element.shape.strokeWidthPt)) {
    throw new DocumentInvariantError(
      `${where}: shape.strokeWidthPt must be a finite number, received ${String(element.shape.strokeWidthPt)}.`,
    );
  }
}

/**
 * Throws a `DocumentInvariantError` naming the exact breach, or returns.
 *
 * Checks: every id in the document is unique, page roles are interior only
 * (the cover is an isolated surface — invariant 6), every frame is finite,
 * and no dimension is negative.
 */
export function assertValidDocument(doc: Document): void {
  if (typeof doc.id !== 'string' || doc.id.length === 0) {
    throw new DocumentInvariantError('document.id must be a non-empty string.');
  }
  if (!Number.isInteger(doc.schemaVersion) || doc.schemaVersion < 1) {
    throw new DocumentInvariantError(
      `document.schemaVersion must be a whole number of 1 or more, received ${String(doc.schemaVersion)}.`,
    );
  }
  if (!Number.isFinite(doc.meta.createdAt) || !Number.isFinite(doc.meta.updatedAt)) {
    throw new DocumentInvariantError('document.meta timestamps must be finite numbers.');
  }

  const seenIds = new Set<string>([doc.id]);

  doc.pages.forEach((page, index) => {
    const where = `document.pages[${index}]`;
    if (typeof page.id !== 'string' || page.id.length === 0) {
      throw new DocumentInvariantError(`${where}: page id must be a non-empty string.`);
    }
    if (seenIds.has(page.id)) {
      throw new DocumentInvariantError(`${where}: duplicate id ${JSON.stringify(page.id)}.`);
    }
    seenIds.add(page.id);

    // `role` is typed as 'interior', so this only fires for data that reached
    // the model unchecked. That is exactly the case worth naming clearly.
    if (String(page.role) !== 'interior') {
      throw new DocumentInvariantError(
        `${where}: pages hold interior pages only. The cover is an isolated surface and lives in document.cover.`,
      );
    }

    page.elements.forEach((element, elementIndex) => {
      assertElement(element, `${where}.elements[${elementIndex}]`, seenIds);
    });
  });

  const cover = doc.cover;
  if (cover !== null) {
    if (typeof cover.id !== 'string' || cover.id.length === 0) {
      throw new DocumentInvariantError('document.cover: cover id must be a non-empty string.');
    }
    if (seenIds.has(cover.id)) {
      throw new DocumentInvariantError(`document.cover: duplicate id ${JSON.stringify(cover.id)}.`);
    }
    seenIds.add(cover.id);
    cover.elements.forEach((element, elementIndex) => {
      assertElement(element, `document.cover.elements[${elementIndex}]`, seenIds);
    });
  }
}


