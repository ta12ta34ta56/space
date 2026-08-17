/**
 * Debounced autosave (architecture.md §8, spec 04 §2).
 *
 * Subscribes to the doc store. A `doc` change arms a debounce timer; when it
 * fires (or when `stop()` flushes it), the latest Document is written to the
 * separate autosave slot in the `meta` store — never over a named project, so
 * autosave cannot destroy a save the user made deliberately.
 *
 * Honesty rules, both from the spec:
 *
 *  - **Coalescing.** A save already in flight never queues a second write. The
 *    next pass picks up the latest Document, so no two writes to the same slot
 *    overlap.
 *  - **Failure is surfaced, never looped.** `StorageFullError` (and any other
 *    failure) sets `status: 'error'` and stops. There is no retry loop and no
 *    silent success. The UI reads `status` and offers the escape hatch.
 *
 * The debounce timer lives here. The doc store still has no timers.
 */

import type { DocStore } from './doc-store';
import type { AutosaveRecord, StorageApi } from './storage';

export type AutosaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/**
 * The slice of the zustand store autosave needs: read the current Document and
 * hear when it changes. `subscribe` and `getState` live on the store object,
 * not in the `DocStore` state shape, so this is declared separately.
 */
export type DocStoreApi = {
  readonly getState: () => DocStore;
  readonly subscribe: (listener: (state: DocStore, previous: DocStore) => void) => () => void;
};

export type AutosaveOptions = {
  readonly store: DocStoreApi;
  readonly storage: StorageApi;
  /** Debounce window after the last change before a save starts. */
  readonly delayMs: number;
  /** Injected clock, used to timestamp the autosave record. */
  readonly now: () => number;
};

export type AutosaveController = {
  readonly getStatus: () => AutosaveStatus;
  readonly getLastSavedAt: () => number | null;
  /**
   * Stops listening and flushes any save still due, so closing the tab does
   * not lose the last `delayMs` of work. Resolves when the flush is complete.
   */
  readonly stop: () => Promise<void>;
};

export function createAutosave(options: AutosaveOptions): AutosaveController {
  const { store, storage, delayMs, now } = options;

  let status: AutosaveStatus = 'idle';
  let lastSavedAt: number | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inflight: Promise<void> | null = null;
  /** True when the Document changed since the running save captured its copy. */
  let dirty = false;
  let stopped = false;

  const saveLatest = (): Promise<void> => {
    if (inflight !== null) {
      // Coalescing: never start a second write while one is in flight. The
      // running save's completion notices `dirty` and picks up the latest
      // Document instead.
      dirty = true;
      return inflight;
    }

    const document = store.getState().doc;
    const at = now();
    status = 'saving';
    dirty = false;

    inflight = (async (): Promise<void> => {
      try {
        const record: AutosaveRecord = { at, document };
        await storage.writeAutosave(record);
        lastSavedAt = at;
        status = 'saved';
      } catch {
        // Never fail silently and never retry in a loop. The next write would
        // fail the same way; the UI reads `error` and offers the escape hatch.
        status = 'error';
        dirty = false;
      }
    })().finally(() => {
      inflight = null;
      if (dirty && !stopped && status !== 'error') {
        void saveLatest();
      }
    });

    return inflight;
  };

  const schedule = (): void => {
    if (stopped) return;
    if (timer !== null) clearTimeout(timer);
    status = 'pending';
    timer = setTimeout(() => {
      timer = null;
      void saveLatest();
    }, delayMs);
  };

  const unsubscribe = store.subscribe((state, previous) => {
    if (state.doc !== previous.doc) schedule();
  });

  return {
    getStatus: () => status,
    getLastSavedAt: () => lastSavedAt,

    stop: async (): Promise<void> => {
      stopped = true;
      unsubscribe();
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      // A change is waiting on the debounce timer: flush it now.
      if (dirty || status === 'pending') {
        await saveLatest();
      }
      // Wait out a save already in flight.
      if (inflight !== null) {
        await inflight;
      }
      // The in-flight save may have flagged a newer Document; flush that too.
      if (dirty) {
        await saveLatest();
      }
    },
  };
}
