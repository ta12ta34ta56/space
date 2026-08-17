/**
 * Commands — the only way to change a Document (architecture.md §5, D2).
 *
 * A user gesture never mutates anything. It names an intent, that intent
 * becomes a `Command`, and `apply` turns the current Document into the next
 * one. There is one writer (`state/doc-store.ts`) and one path, so the two
 * copies of the truth that crashed the legacy build cannot exist.
 *
 * Rules this file obeys, and every future change to it must keep obeying:
 *
 *  - **Pure.** No clock reads, no `Math.random()`, no `nanoid()`, no I/O, no
 *    logging. New ids and timestamps arrive inside the command.
 *  - **Immutable.** `doc` and everything reachable from it is never mutated.
 *  - **Structurally sharing.** A page or element that did not change is the
 *    same object reference in the result. Unit 05's renderer repaints on
 *    reference inequality, so this is behaviour, not an optimisation.
 *  - **Exhaustive.** The switch ends in a `never` default. Adding a command
 *    without handling it is a compile error, which is the point.
 *  - **Total or loud.** A command naming a page or element that does not exist
 *    throws `CommandError`. It never returns `doc` unchanged, and never
 *    returns a half-applied Document.
 *  - **`meta.updatedAt` is not touched here.** When a save happened is not a
 *    document edit, and stamping it would make `apply` impure. The store does
 *    it, from an injected clock.
 */

import { MAX_TITLE_LENGTH } from './parse';
import type {
  Binding,
  Cover,
  Document,
  Element,
  ElementType,
  Frame,
  Page,
  PaperStock,
  PuzzleSpec,
  ShapeSpec,
  TextStyle,
  TrimId,
} from './types';

/* ------------------------------------------------------------- patching -- */

/**
 * The fields of an element an update may change.
 *
 * `id`, `type` and `kind` are absent by construction, so patching them is a
 * compile error (D18: element identity is assigned at insertion and never
 * drifts). Proved in `commands.type-test.ts`.
 *
 * Payload fields belong to one element type each. Sending one to the wrong
 * type is caught at runtime by `assertPatchKeys`, because a patch can arrive
 * from a loaded file as well as from typed code.
 */
export type ElementPatch = {
  readonly frame?: Frame;
  readonly z?: number;
  readonly hidden?: boolean;
  readonly locked?: boolean;
  /** text elements */
  readonly text?: string;
  readonly style?: TextStyle;
  /** shape elements */
  readonly shape?: ShapeSpec;
  /** image elements */
  readonly assetId?: string;
  /** puzzle elements. Style is a property, not an edit: one field, one re-render (D3). */
  readonly puzzle?: PuzzleSpec;
};

/* ------------------------------------------------------------- commands -- */

/**
 * Named after user intent, never after implementation (code-standards.md).
 *
 * Generator commands (`generate/pages`, `applyToAll`) arrive in Unit 12 by
 * appending members here. The `never` default in `apply` turns that into a
 * compile error until they are handled.
 */
export type Command =
  // pages
  | { readonly t: 'page/add'; readonly index: number; readonly page: Page }
  | { readonly t: 'page/delete'; readonly ids: readonly string[] }
  | { readonly t: 'page/reorder'; readonly from: number; readonly to: number }
  | { readonly t: 'page/duplicate'; readonly id: string; readonly newId: string }
  | { readonly t: 'page/setLocked'; readonly id: string; readonly locked: boolean }
  // elements
  | { readonly t: 'element/add'; readonly pageId: string; readonly element: Element }
  | { readonly t: 'element/delete'; readonly pageId: string; readonly elementIds: readonly string[] }
  | {
      readonly t: 'element/update';
      readonly pageId: string;
      readonly elementId: string;
      readonly patch: ElementPatch;
    }
  | {
      readonly t: 'element/reorder';
      readonly pageId: string;
      readonly elementId: string;
      readonly z: number;
    }
  // book
  | { readonly t: 'book/setTrim'; readonly trimId: TrimId }
  | { readonly t: 'book/setPaper'; readonly paper: PaperStock }
  | { readonly t: 'book/setBinding'; readonly binding: Binding }
  | { readonly t: 'book/setTitle'; readonly title: string }
  // cover
  | { readonly t: 'cover/set'; readonly cover: Cover }
  | { readonly t: 'cover/clear' };

/** The name of a command, used to label history entries and errors. */
export type CommandName = Command['t'];

/** Thrown when a command cannot be applied. The Document is left untouched. */
export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

/* -------------------------------------------------------------- lookups -- */

type PageHit = { readonly index: number; readonly page: Page };
type ElementHit = { readonly index: number; readonly element: Element };

function requirePage(doc: Document, pageId: string, t: CommandName): PageHit {
  const index = doc.pages.findIndex((candidate) => candidate.id === pageId);
  const page = doc.pages[index];
  if (page === undefined) {
    throw new CommandError(`${t}: no page with id ${JSON.stringify(pageId)} in this document.`);
  }
  return { index, page };
}

function requireElement(page: Page, elementId: string, t: CommandName): ElementHit {
  const index = page.elements.findIndex((candidate) => candidate.id === elementId);
  const element = page.elements[index];
  if (element === undefined) {
    throw new CommandError(
      `${t}: no element with id ${JSON.stringify(elementId)} on page ${JSON.stringify(page.id)}.`,
    );
  }
  return { index, element };
}

function requireIndex(value: number, max: number, field: string, t: CommandName): number {
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new CommandError(
      `${t}: ${field} must be a whole number between 0 and ${max}, received ${String(value)}.`,
    );
  }
  return value;
}

/* --------------------------------------------------------- replacements -- */

/** Replaces one page, keeping every other page's object reference. */
function withPage(doc: Document, index: number, page: Page): Document {
  const pages = doc.pages.slice();
  pages[index] = page;
  return { ...doc, pages };
}

/** Replaces one element, keeping every other element's object reference. */
function withElement(page: Page, index: number, element: Element): Page {
  const elements = page.elements.slice();
  elements[index] = element;
  return { ...page, elements };
}

/* --------------------------------------------------------- element patch -- */

const COMMON_PATCH_KEYS: readonly string[] = ['frame', 'z', 'hidden', 'locked'];

/** The payload fields each element type owns. Nothing else is patchable. */
const PAYLOAD_PATCH_KEYS: Readonly<Record<ElementType, readonly string[]>> = {
  text: ['text', 'style'],
  shape: ['shape'],
  image: ['assetId'],
  puzzle: ['puzzle'],
};

/**
 * Rejects any key that is not a patchable field of this element.
 *
 * The type system already stops `id`, `type` and `kind` (D18) and stops a
 * shape field reaching a text element. This is the same guarantee at runtime,
 * for a patch that arrived from a loaded file rather than from typed code.
 */
function assertPatchKeys(element: Element, patch: ElementPatch, t: CommandName): void {
  const allowed = [...COMMON_PATCH_KEYS, ...PAYLOAD_PATCH_KEYS[element.type]];
  for (const key of Object.keys(patch)) {
    if (!allowed.includes(key)) {
      throw new CommandError(
        `${t}: ${JSON.stringify(key)} is not a patchable field of a ${element.type} element. ` +
          `Patchable here: ${allowed.join(', ')}. An element's id, type and kind are fixed at insertion.`,
      );
    }
  }
}

function patchElement(element: Element, patch: ElementPatch, t: CommandName): Element {
  assertPatchKeys(element, patch, t);

  const common = {
    frame: patch.frame ?? element.frame,
    z: patch.z ?? element.z,
    hidden: patch.hidden ?? element.hidden,
    locked: patch.locked ?? element.locked,
  };

  switch (element.type) {
    case 'text':
      return {
        ...element,
        ...common,
        text: patch.text ?? element.text,
        style: patch.style ?? element.style,
      };
    case 'shape':
      return { ...element, ...common, shape: patch.shape ?? element.shape };
    case 'image':
      return { ...element, ...common, assetId: patch.assetId ?? element.assetId };
    case 'puzzle':
      return { ...element, ...common, puzzle: patch.puzzle ?? element.puzzle };
  }
}

/* ----------------------------------------------------------- duplication -- */

/**
 * A duplicated page needs new element ids, because ids are unique across the
 * whole Document. They are derived from the page's `newId`, which the caller
 * generated, so `apply` stays pure and the result is deterministic.
 */
function duplicatePage(page: Page, newId: string): Page {
  return {
    ...page,
    id: newId,
    elements: page.elements.map((element) => ({ ...element, id: `${newId}-${element.id}` })),
  };
}

/* ------------------------------------------------------------------ apply -- */

/** The single writer's single function. Pure: same inputs, same Document. */
export function apply(doc: Document, cmd: Command): Document {
  switch (cmd.t) {
    /* ----------------------------------------------------------- pages -- */

    case 'page/add': {
      const index = requireIndex(cmd.index, doc.pages.length, 'index', cmd.t);
      const pages = doc.pages.slice();
      pages.splice(index, 0, cmd.page);
      return { ...doc, pages };
    }

    case 'page/delete': {
      const doomed = new Set(cmd.ids);
      for (const id of cmd.ids) {
        requirePage(doc, id, cmd.t);
      }
      return { ...doc, pages: doc.pages.filter((page) => !doomed.has(page.id)) };
    }

    case 'page/reorder': {
      const last = doc.pages.length - 1;
      const from = requireIndex(cmd.from, last, 'from', cmd.t);
      const to = requireIndex(cmd.to, last, 'to', cmd.t);
      const pages = doc.pages.slice();
      const [moved] = pages.splice(from, 1);
      if (moved === undefined) {
        throw new CommandError(`${cmd.t}: no page at index ${from}.`);
      }
      pages.splice(to, 0, moved);
      return { ...doc, pages };
    }

    case 'page/duplicate': {
      const { index, page } = requirePage(doc, cmd.id, cmd.t);
      const pages = doc.pages.slice();
      pages.splice(index + 1, 0, duplicatePage(page, cmd.newId));
      return { ...doc, pages };
    }

    case 'page/setLocked': {
      const { index, page } = requirePage(doc, cmd.id, cmd.t);
      return withPage(doc, index, { ...page, locked: cmd.locked });
    }

    /* -------------------------------------------------------- elements -- */

    case 'element/add': {
      const { index, page } = requirePage(doc, cmd.pageId, cmd.t);
      return withPage(doc, index, { ...page, elements: [...page.elements, cmd.element] });
    }

    case 'element/delete': {
      const { index, page } = requirePage(doc, cmd.pageId, cmd.t);
      for (const elementId of cmd.elementIds) {
        requireElement(page, elementId, cmd.t);
      }
      const doomed = new Set(cmd.elementIds);
      return withPage(doc, index, {
        ...page,
        elements: page.elements.filter((element) => !doomed.has(element.id)),
      });
    }

    case 'element/update': {
      const { index, page } = requirePage(doc, cmd.pageId, cmd.t);
      const hit = requireElement(page, cmd.elementId, cmd.t);
      const patched = patchElement(hit.element, cmd.patch, cmd.t);
      return withPage(doc, index, withElement(page, hit.index, patched));
    }

    case 'element/reorder': {
      const { index, page } = requirePage(doc, cmd.pageId, cmd.t);
      const hit = requireElement(page, cmd.elementId, cmd.t);
      if (!Number.isFinite(cmd.z)) {
        throw new CommandError(`${cmd.t}: z must be a finite number, received ${String(cmd.z)}.`);
      }
      return withPage(doc, index, withElement(page, hit.index, { ...hit.element, z: cmd.z }));
    }

    /* ------------------------------------------------------------ book -- */

    case 'book/setTrim':
      return { ...doc, book: { ...doc.book, trimId: cmd.trimId } };

    case 'book/setPaper':
      return { ...doc, book: { ...doc.book, paper: cmd.paper } };

    case 'book/setBinding':
      return { ...doc, book: { ...doc.book, binding: cmd.binding } };

    case 'book/setTitle': {
      if (cmd.title.length > MAX_TITLE_LENGTH) {
        throw new CommandError(
          `${cmd.t}: a title must be ${MAX_TITLE_LENGTH} characters or fewer, received ${cmd.title.length}.`,
        );
      }
      return { ...doc, meta: { ...doc.meta, title: cmd.title } };
    }

    /* ----------------------------------------------------------- cover -- */

    case 'cover/set':
      return { ...doc, cover: cmd.cover };

    case 'cover/clear':
      return { ...doc, cover: null };

    default: {
      const unhandled: never = cmd;
      throw new CommandError(`apply: unhandled command ${JSON.stringify(unhandled)}.`);
    }
  }
}
