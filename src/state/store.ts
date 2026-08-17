/**
 * The app-wide document store — a module-level singleton (spec 04 §4).
 *
 * The app edits one book at a time, so a React provider would be ceremony
 * around a singleton. `createDocStore` stays a factory for tests; this is the
 * one instance the app uses. Opening a saved project calls `store.load(doc)`,
 * which replaces the Document and clears the undo history.
 *
 * The placeholder initial document is a blank 24-page book (KDP's minimum
 * interior, 6×9 white paperback, no title). Unit 06 gave the shell a page
 * indicator and guide overlays that need real recto and verso pages to stand
 * on, so the placeholder holds the smallest legal book instead of zero pages.
 * It is replaced by `load` before anything is edited, or by the New Book flow
 * in Unit 10.
 */

import { nanoid } from 'nanoid';
import { createDocument } from '../model/document';
import type { Document } from '../model/types';
import { createDocStore } from './doc-store';

function initialDocument(): Document {
  return createDocument({
    trimId: '6x9',
    paper: 'bw-white',
    binding: 'paperback',
    bleed: false,
    pageCount: 24,
    now: Date.now,
    id: () => nanoid(),
  });
}

export const store = createDocStore(initialDocument());
