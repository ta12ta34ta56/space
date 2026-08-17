/**
 * What the Pages tab is allowed to do to a book, and why it may refuse
 * (spec 07 §6).
 *
 * Pure functions over a Document that return either the Command to dispatch
 * or a plain-language reason for refusing. Keeping the decision out of the
 * component means "may I delete this page?" is testable without a DOM, and
 * the panel never has to know a KDP rule.
 *
 * The rule that needs a reason: **KDP will not print an interior below 24
 * pages**, so deleting past that is refused, not silently allowed. The user is
 * told what the limit is (code-standards.md: errors state what happened, and
 * the fix).
 */

import type { Command, Document, Page } from '../../model';
import { KDP_MIN_PAGE_COUNT } from '../../print';

/** Either a Command to dispatch, or a refusal with a reason a person can read. */
export type PageAction =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly reason: string };

/** A new blank interior page. Ids are injected, so this stays pure. */
export function blankPage(id: string): Page {
  return { id, kind: 'blank', role: 'interior', elements: [], locked: false };
}

/** Insert a blank page at `index`. Used by the insert gutters and Add page. */
export function addPageAt(doc: Document, index: number, newId: string): PageAction {
  const clamped = Math.max(0, Math.min(index, doc.pages.length));
  return { ok: true, command: { t: 'page/add', index: clamped, page: blankPage(newId) } };
}

/** Duplicate one page, immediately after it. */
export function duplicatePage(doc: Document, id: string, newId: string): PageAction {
  if (!doc.pages.some((page) => page.id === id)) {
    return { ok: false, reason: 'That page is no longer in this book.' };
  }
  return { ok: true, command: { t: 'page/duplicate', id, newId } };
}

/**
 * Delete one page, unless that would take the interior below KDP's minimum.
 *
 * The refusal names the limit and what to do instead, because "nothing
 * happened" is the one response a user cannot act on.
 */
export function deletePage(doc: Document, id: string): PageAction {
  if (!doc.pages.some((page) => page.id === id)) {
    return { ok: false, reason: 'That page is no longer in this book.' };
  }
  if (doc.pages.length <= KDP_MIN_PAGE_COUNT) {
    return {
      ok: false,
      reason:
        `Amazon will not print an interior with fewer than ${KDP_MIN_PAGE_COUNT} pages, ` +
        `and this book has ${doc.pages.length}. Add a page before deleting this one.`,
    };
  }
  return { ok: true, command: { t: 'page/delete', ids: [id] } };
}

/** Move a page from one position to another. One command, one undo entry. */
export function reorderPage(doc: Document, from: number, to: number): PageAction {
  const last = doc.pages.length - 1;
  if (from < 0 || from > last) {
    return { ok: false, reason: 'That page is no longer in this book.' };
  }
  const clamped = Math.max(0, Math.min(to, last));
  if (clamped === from) {
    return { ok: false, reason: 'That page is already in that position.' };
  }
  return { ok: true, command: { t: 'page/reorder', from, to: clamped } };
}
