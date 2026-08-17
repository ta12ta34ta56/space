/**
 * Compile-time half of the D18 identity test.
 *
 * `commands.test.mjs` proves at runtime that an element's `id`, `type` and
 * `kind` survive an update. This file proves the stronger thing: that code
 * attempting to change them does not compile. It is checked by `tsc -b`.
 *
 * `@ts-expect-error` is permitted here and only here (code-standards.md,
 * TypeScript): each one asserts that the line below it IS a type error, so if
 * the patch type ever loosens, `tsc` fails on the now-unused directive.
 */

import { apply } from './commands';
import type { Command, ElementPatch } from './commands';
import type { Document } from './types';

/** What an update is allowed to do: move the element, not become another one. */
export function moveElement(doc: Document, pageId: string, elementId: string): Document {
  const patch: ElementPatch = { frame: { xIn: 1, yIn: 1, wIn: 2, hIn: 2 } };
  return apply(doc, { t: 'element/update', pageId, elementId, patch });
}

/** Each of these must be rejected by the compiler. */
export function rejectedPatches(): readonly unknown[] {
  // @ts-expect-error a patch cannot change an element's id (D18)
  const patchesId: ElementPatch = { id: 'someone-else' };

  // @ts-expect-error a patch cannot change an element's structural type (D18)
  const patchesType: ElementPatch = { type: 'shape' };

  // @ts-expect-error a patch cannot change an element's semantic kind (D18)
  const patchesKind: ElementPatch = { kind: 'divider' };

  // @ts-expect-error generator commands arrive in Unit 12, not before
  const notYetACommand: Command = { t: 'generate/pages' };

  return [patchesId, patchesType, patchesKind, notYetACommand];
}
