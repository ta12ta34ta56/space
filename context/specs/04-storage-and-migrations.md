# Unit 04 — Storage and migrations

> **Read first:** `AGENTS.md`, then `context/architecture.md` (§2 Document model,
> §8 storage, §10 invariants), `context/decisions.md` (**D12, D24.7**),
> `context/code-standards.md`.

---

## Goal

Make work survive a reload. IndexedDB save/load, a project list, debounced autosave,
crash recovery, and the migration path that lets a book saved today open in a year.

Nothing renders. This is the last invisible unit — Unit 05 puts pixels on screen.

**The bar:** a user who closes the tab mid-edit and comes back must find their book exactly
as they left it. Losing someone's work is the one failure this product cannot survive, and
the legacy build did it — localStorage capped out around 5 MB and a 5.7 MB book was lost
with the QuotaExceededError swallowed.

---

## Design

No visual design. The recovery prompt and project list are UI and belong to later units;
this unit exposes the functions they will call.

---

## Implementation

### 1. `src/state/storage.ts` — IndexedDB, PORTED plumbing

`legacy/novelka/src/services/storage.ts` (536 lines) already solved this correctly. Its
IndexedDB plumbing is **ported, not rewritten**:

- `openDb` / `tx` transaction wrapper
- **`QuotaExceededError` → `StorageFullError`** on both `onerror` and `onabort` (L120–140).
  This is the fix for the swallowed error; keep it exactly.
- the localStorage index cache for instant first paint of the project list
- `list` / `get` / `save` / `remove` / `rename` / `duplicate`
- `downloadJSON` and `readProjectFile`

What changes, and only this:

1. **The stored payload is a `Document`,** not the legacy `ProjectFile`. One shape, the one
   from Unit 01.
2. **Drop the legacy-migration code** — `migrateLegacy`, `LEGACY_DB_NAME = 'minipdf'`, the
   `minipdf.*` localStorage keys, `DB_MIGRATED_FLAG`. This is a fresh product with a fresh
   database; there are no old novelka books in anyone's browser to rescue. Deleting this is
   the decision, not an oversight.
3. **Errors are never swallowed.** The legacy `list`/`get`/`remove` have `catch { return
   [] }`. A read that fails must reject, so the UI can say so. An empty list and a broken
   database must not look identical.
4. **`Date.now()` is injected**, as everywhere else.

Database `novelka`, version 1, stores `projects` and `meta`.

### 2. `src/state/autosave.ts` — debounced, and honest about failing

```ts
createAutosave({ store, storage, delayMs: 1500, now }): { stop(): void }
```

- Subscribes to the doc store. On a `doc` change, debounce **1500 ms**, then save.
- **Coalescing:** a save already in flight does not queue a second; the next save picks up
  the latest Document. No overlapping writes to the same key.
- `StorageFullError` sets a status the UI can read and offers the escape hatch — it never
  retries in a loop and never fails silently.
- Exposes `status: 'idle' | 'pending' | 'saving' | 'saved' | 'error'` and `lastSavedAt`.
- Writes to a **separate autosave slot** (`meta` store, key `__autosave__`), not over the
  named project. Autosave must never destroy a save the user made deliberately.
- `stop()` flushes any pending save, so closing does not lose the last 1.5 seconds.

The debounce timer lives here. **The doc store still has no timers** (Unit 02).

### 3. `src/model/migrate.ts` — extend what Unit 01 built

Unit 01 built the chain and left it empty at version 1. This unit proves it works before
anyone depends on it:

- Write a **deliberate no-op v1→v2 step** and bump `CURRENT_SCHEMA_VERSION` to 2. It exists
  so the mechanism is exercised by a real migration rather than assumed. Record in the
  tracker that v2 is intentionally identical to v1.
- A document with a **future** schemaVersion is refused with a clear message ("saved by a
  newer version of Novelka"). Never open it optimistically.
- A document with **no** schemaVersion is refused, not assumed to be v1.
- Migration runs on load, before `assertValidDocument`.

### 4. Loading a project — how it becomes the live document

This settles **open question 4** from the tracker.

- `state/doc-store.ts` exports **`createDocStore(initial)`**, and `state/store.ts` creates
  **one module-level instance**. No React provider, no context. The app edits one book at a
  time; a provider would be ceremony around a singleton.
- Loading adds **`store.load(doc)`** — a method, deliberately **not a Command**. It
  replaces the Document and **clears `past` and `future`**.
- **Why it is not a Command:** undoing past the moment you opened a file is meaningless,
  and history from the previous book must not survive into this one. `apply` stays pure and
  its union stays closed.
- `load` runs `migrate` then `assertValidDocument` and **throws before touching the store**
  if either fails, exactly like `dispatch`.

### 5. Crash recovery

- On startup, if the autosave slot is newer than the newest named project, expose it as a
  recovery candidate. This unit returns the facts; the prompt is UI.
- `clearAutosave()` after a successful explicit save or an accepted recovery.

---

## Tests

`storage.test.mjs`, `autosave.test.mjs`, `migrate.test.mjs`.

IndexedDB does not exist in plain Node, so tests run against a **fake-indexeddb** dev
dependency, or a hand-written in-memory `IDBFactory` double if that proves simpler. Say
which in the tracker.

### `storage.test.mjs`
- **Round-trip:** save a Document with one element of every kind, read it back,
  deep-equal. This is the headline test.
- Save → `list` shows it with the right name and page count
- `remove` deletes it; `rename` and `duplicate` preserve every element
- **`duplicate` produces new ids** and mutating the copy does not touch the original
- A quota failure surfaces as `StorageFullError` — simulate by making the transaction
  abort with `QuotaExceededError`
- A read failure **rejects**; it does not return `[]`
- `downloadJSON` → `readProjectFile` round-trips identically

### `autosave.test.mjs`
- Three rapid changes within the debounce window produce **one** write
- The write carries the **latest** Document, not the first
- `stop()` flushes a pending save
- A save in flight does not overlap a second
- `StorageFullError` sets `status: 'error'` and does not retry in a loop

### `migrate.test.mjs`
- A v1 document loads and comes out at v2
- A v2 document is unchanged
- schemaVersion 99 is **refused** with a message naming the version
- A missing schemaVersion is refused
- A document that migrates but then fails `assertValidDocument` throws, and nothing is
  stored
- `store.load(doc)` clears `past` and `future`; a subsequent `undo` is a no-op

---

## Dependencies

- `fake-indexeddb` (dev only) — if the hand-written double is not simpler.

No runtime dependency. If the implementation seems to need one, the design is wrong — stop
and raise it.

---

## Verify when done

- [ ] `npm run check` — lint 0/0, `tsc -b` clean, tests pass, build passes
- [ ] No `any`, no `@ts-ignore`, no non-null `!`
- [ ] `grep -rn "minipdf" src/` returns nothing
- [ ] `grep -rn "catch {}\|catch { }\|catch { return \[\]" src/state/` returns nothing —
      no swallowed errors
- [ ] `grep -rn "setTimeout\|setInterval" src/state/doc-store.ts` returns nothing — the
      store is still timer-free
- [ ] `grep -rn "Date.now()" src/model src/print` returns nothing
- [ ] Killing the tab mid-edit and reloading restores the document (checked by hand)
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

The project list UI, the recovery prompt, the "download my work" button (later units — this
unit provides the functions). Any rendering — Unit 05. Thumbnails — they need the renderer,
Unit 05. Cloud sync or accounts — never in v1 (D12).

If the spec seems to be missing something needed to finish, **it is not missing — it
belongs to a later unit.** Do not pull work forward.

---

## Note for the implementer

`legacy/novelka/src/services/storage.ts` is **good code with one bad habit**: it catches
and returns a fallback in `list`, `get`, `remove` and `autosave`. That habit is why a user
lost a 5.7 MB book and saw nothing. Port the structure; do not port the `catch`.
