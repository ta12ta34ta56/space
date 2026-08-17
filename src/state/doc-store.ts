/**
 * The document store — the only writer in the codebase (architecture.md §6,
 * ownership rule 3).
 *
 * It holds the Document and its history, and nothing else. Selection, zoom,
 * the open panel, guide visibility and theme are ephemeral UI state: they live
 * in `ui-store.ts` (a later unit) and never here, because putting them here
 * would make "select an element" an undoable, autosaved document change
 * (architecture.md §2).
 *
 * `legacy/novelka/src/stores/canvas-store.ts` is 716 lines and holds document
 * state, selection, zoom, panel visibility, history and direct canvas calls at
 * once. It is not a template. This is the split that replaces it.
 *
 * Two rules make the rest fall out:
 *
 *  1. **`dispatch` and `load` are the only assignments to `doc`.** Everything
 *     else asks for a change by naming a Command. `load` is deliberately not a
 *     Command: undoing past the moment a book was opened is meaningless, and
 *     the previous book's history must not survive into this one (spec 04 §4).
 *  2. **A rejected change changes nothing.** `apply` (or `migrate`) then
 *     `assertValidDocument` all run before anything is stored. If any throws,
 *     the old Document survives untouched and the error propagates to the
 *     caller, which is the only place that can explain it to a person.
 *
 * There are no timers here, no coalescing and no debouncing. One dispatch is
 * one undo entry: a gesture previews from local component state and commits a
 * single command when it ends (spec 02 §3). That keeps `apply` pure and undo
 * granularity obvious. The debounce timer for autosave lives in
 * `state/autosave.ts`, never here.
 */

import { create } from 'zustand';
import { apply } from '../model/commands';
import type { Command, CommandName } from '../model/commands';
import { assertValidDocument } from '../model/document';
import { migrate } from '../model/migrate';
import type { Document } from '../model/types';

/** How many undo steps are kept. Entries share structure, so this is cheap. */
export const HISTORY_LIMIT = 50;

/** One point the book can be returned to, and the change that left it. */
export type HistoryEntry = {
  /** Human label for the History panel (Unit 18), derived from the command. */
  readonly label: string;
  readonly doc: Document;
};

export type DocStore = {
  readonly doc: Document;
  /** Oldest first. The Document each entry holds is the state *before* its change. */
  readonly past: readonly HistoryEntry[];
  /** Nearest first. Cleared by any dispatch. */
  readonly future: readonly HistoryEntry[];
  /** The only writer. `now` is injected so the store never reads the clock itself. */
  dispatch: (cmd: Command, now: number) => void;
  /**
   * Replaces the Document (opening a saved book) and clears `past` and
   * `future`. Runs `migrate` then `assertValidDocument` and throws before
   * touching the store if either fails. Not a Command — `apply` stays pure and
   * its union stays closed.
   */
  load: (document: Document) => void;
  undo: () => void;
  redo: () => void;
  /** Jump to the state at `past[index]`. D24.1 — the History panel is a view of `past`. */
  jumpTo: (index: number) => void;
};

/* --------------------------------------------------------------- labels -- */

/**
 * Plain-language names for the History panel. No em dashes, no emojis
 * (code-standards.md, User-facing copy).
 */
const COMMAND_LABELS: Readonly<Record<CommandName, string>> = {
  'page/add': 'Add page',
  'page/delete': 'Delete pages',
  'page/reorder': 'Reorder pages',
  'page/duplicate': 'Duplicate page',
  'page/setLocked': 'Lock page',
  'element/add': 'Add element',
  'element/delete': 'Delete elements',
  'element/update': 'Edit element',
  'element/reorder': 'Restack element',
  'book/setTrim': 'Change trim size',
  'book/setPaper': 'Change paper',
  'book/setBinding': 'Change binding',
  'book/setBleed': 'Change bleed',
  'book/setTitle': 'Rename book',
  'cover/set': 'Add cover',
  'cover/clear': 'Remove cover',
};

/** The label shown for a command in the History panel. */
export function labelFor(cmd: Command): string {
  return COMMAND_LABELS[cmd.t];
}

/* ---------------------------------------------------------------- store -- */

function stamp(doc: Document, now: number): Document {
  return { ...doc, meta: { ...doc.meta, updatedAt: now } };
}

/** Drops the oldest entries once the stack is over the limit. */
function capped(past: readonly HistoryEntry[]): readonly HistoryEntry[] {
  return past.length <= HISTORY_LIMIT ? past : past.slice(past.length - HISTORY_LIMIT);
}

/**
 * Builds a store around an existing Document.
 *
 * Exported separately from the app-wide store so tests, and later the project
 * loader, can start from a known document without a module-level singleton
 * standing in the way.
 */
export function createDocStore(initial: Document) {
  assertValidDocument(initial);

  return create<DocStore>((set, get) => ({
    doc: initial,
    past: [],
    future: [],

    dispatch: (cmd, now) => {
      if (!Number.isFinite(now)) {
        throw new TypeError(`dispatch: now must be a finite number, received ${String(now)}.`);
      }

      const previous = get().doc;

      // Both of these can throw. Nothing is stored until both have returned,
      // so a rejected command leaves doc, past and future exactly as they were.
      const next = stamp(apply(previous, cmd), now);
      assertValidDocument(next);

      set({
        doc: next,
        past: capped([...get().past, { label: labelFor(cmd), doc: previous }]),
        future: [],
      });
    },

    load: (document) => {
      // Migrate first, then validate. Both throw before anything is stored,
      // exactly like dispatch, so a rejected load leaves the store untouched.
      const migrated = migrate(document);
      assertValidDocument(migrated);

      set({ doc: migrated, past: [], future: [] });
    },

    undo: () => {
      const { doc, past, future } = get();
      const entry = past[past.length - 1];
      if (entry === undefined) return;
      set({
        doc: entry.doc,
        past: past.slice(0, -1),
        future: [{ label: entry.label, doc }, ...future],
      });
    },

    redo: () => {
      const { doc, past, future } = get();
      const entry = future[0];
      if (entry === undefined) return;
      set({
        doc: entry.doc,
        past: capped([...past, { label: entry.label, doc }]),
        future: future.slice(1),
      });
    },

    jumpTo: (index) => {
      const { doc, past, future } = get();
      if (!Number.isInteger(index) || index < 0 || index >= past.length) return;

      const target = past[index];
      if (target === undefined) return;

      // Entries are moved, never replayed: every document already exists, so
      // this lands exactly where repeated undo would, in one update.
      const moved: HistoryEntry[] = [];
      for (let position = index; position < past.length; position += 1) {
        const entry = past[position];
        const newer = past[position + 1];
        if (entry === undefined) continue;
        moved.push({ label: entry.label, doc: newer === undefined ? doc : newer.doc });
      }

      set({ doc: target.doc, past: past.slice(0, index), future: [...moved, ...future] });
    },
  }));
}
