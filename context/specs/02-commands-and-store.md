# Unit 02 — Commands and the document store

> **Read first:** `AGENTS.md`, then `context/architecture.md` (§2 Document model, §5
> Commands, §6 folder boundaries, §10 invariants), `context/decisions.md` (D2, D3, D18,
> D24.1), `context/code-standards.md`.

---

## Goal

Make the Document **changeable in exactly one way**: dispatch a Command.

This unit adds `model/commands.ts` (the Command union and the pure `apply` function) and
`state/doc-store.ts` (the store, dispatch, and undo/redo). Nothing renders. There is still
no canvas and no real UI.

This is the unit that kills the crash class. In the legacy build, 161 direct engine calls
and 109 store subscriptions each mutated state their own way, and the two sources of truth
were hand-bridged. After this unit, **there is one writer and one path**, and a desync is
not something you avoid by being careful — it is not expressible.

---

## Design

No visual design. `App.tsx` stays the placeholder from Unit 01.

---

## Implementation

### 1. `src/model/commands.ts`

The Command union, exactly this membership for v1-so-far:

```ts
export type Command =
  // pages
  | { readonly t: 'page/add';        readonly index: number; readonly page: Page }
  | { readonly t: 'page/delete';     readonly ids: readonly string[] }
  | { readonly t: 'page/reorder';    readonly from: number; readonly to: number }
  | { readonly t: 'page/duplicate';  readonly id: string; readonly newId: string }
  | { readonly t: 'page/setLocked';  readonly id: string; readonly locked: boolean }
  // elements
  | { readonly t: 'element/add';     readonly pageId: string; readonly element: Element }
  | { readonly t: 'element/delete';  readonly pageId: string; readonly elementIds: readonly string[] }
  | { readonly t: 'element/update';  readonly pageId: string; readonly elementId: string; readonly patch: ElementPatch }
  | { readonly t: 'element/reorder'; readonly pageId: string; readonly elementId: string; readonly z: number }
  // book
  | { readonly t: 'book/setTrim';    readonly trimId: TrimId }
  | { readonly t: 'book/setPaper';   readonly paper: PaperStock }
  | { readonly t: 'book/setBinding'; readonly binding: Binding }
  | { readonly t: 'book/setTitle';   readonly title: string }
  // cover
  | { readonly t: 'cover/set';       readonly cover: Cover }
  | { readonly t: 'cover/clear' };
```

**Generator commands (`generate/pages`, `applyToAll`) are NOT in this unit.** They arrive
in Unit 12 by appending union members; the exhaustive switch in `apply` turns that into a
compile error, which is the point.

```ts
export function apply(doc: Document, cmd: Command): Document;
```

Rules for `apply`:

- **Pure.** No `Date.now()`, no `Math.random()`, no `nanoid()`, no I/O, no logging. New ids
  and timestamps arrive **inside the command** (note `page/duplicate` carries `newId`).
- **Immutable.** Never mutates `doc` or anything reachable from it. Returns a new Document.
- **Structurally sharing.** Pages and elements that did not change must be the *same object
  reference* in the result. This is not an optimisation detail — Unit 05's renderer will
  use reference equality to decide what to repaint.
- **Exhaustive.** Switch on `cmd.t` with a `never` default. No fallthrough, no default case
  that silently returns `doc`.
- **Total or loud.** A command referencing a page or element that does not exist throws
  `CommandError` naming the command and the missing id. It never returns `doc` unchanged
  and never returns a half-applied Document.
- **`meta.updatedAt` is not touched by `apply`.** It is not a document edit, it is a fact
  about when a save happened, and stamping it inside `apply` would make `apply` impure.
  The store sets it (see below).

`ElementPatch` is a `Partial<>` of the mutable fields of an element that **cannot change
`type` or `kind` or `id`**. Type it so that attempting to patch those is a compile error —
D18 exists because the legacy build let element identity drift.

### 2. `src/state/doc-store.ts`

Zustand 5. This is the **first** unit that adds `zustand`; add it now, nothing else.

```ts
type DocStore = {
  readonly doc: Document;
  readonly past: readonly HistoryEntry[];
  readonly future: readonly HistoryEntry[];
  dispatch(cmd: Command, now: number): void;
  undo(): void;
  redo(): void;
  jumpTo(index: number): void;   // D24.1 — the History panel is a view of `past`
};

type HistoryEntry = { readonly label: string; readonly doc: Document };
```

- **`dispatch` is the only writer in the entire codebase.** Nothing else assigns to `doc`.
- `dispatch` calls `apply`, then `assertValidDocument`. **If either throws, the store does
  not change.** The old Document survives, and the error propagates. A rejected command
  must never leave the app in a partial state.
- On success: push the *previous* Document onto `past` with a human label derived from
  `cmd.t`, clear `future`, set `meta.updatedAt` from the injected `now`.
- `past` is capped at **50 entries**; the oldest is dropped. Documents share structure, so
  this is cheap.
- Undo/redo move entries between `past` and `future`. `jumpTo(i)` replays to that point by
  moving entries, not by re-running commands.
- **No timers, no coalescing, no debouncing in the store.**

### 3. One undo entry per gesture — the rule that makes coalescing unnecessary

A drag or a resize must produce **one** command, dispatched when the gesture ends. The UI
shows a live preview from local component state during the gesture and commits once.

The store will never merge two commands into one undo entry, and will never inspect the
clock to decide whether to. That keeps `apply` pure and the store timer-free, and it is why
undo granularity is simply *one dispatch, one entry*.

This is a binding rule on every later unit that adds a gesture.

### 4. Read access

- `ui/` reads the store through selectors. That is the only consumer.
- `model/`, `print/`, `generators/`, `templates/` **never import `state/`**. They take
  arguments and return values. Grep-enforceable: `grep -r "state/" src/model src/print` is
  empty.
- Selection, zoom, open panel, guide visibility are **not** in this store and not in the
  Document (architecture §2). `ui-store.ts` is not part of this unit.

---

## Tests

`commands.test.mjs` beside the source, plus `doc-store.test.mjs`.

### `commands.test.mjs`
- **Every command in the union** has at least one test asserting the resulting Document
  deep-equals the expected value. A missing case is a failing unit.
- **Purity:** `Object.freeze` the input Document deeply, run every command, assert no throw
  and that the input is unchanged. Replace `Date.now` and `Math.random` with throwing stubs
  for the duration.
- **Structural sharing:** after `element/update` on page 3, assert `result.pages[0] ===
  doc.pages[0]` and `result.pages[3] !== doc.pages[3]`.
- **Loudness:** `element/update` with an unknown `pageId` throws `CommandError` naming it;
  `page/reorder` with an out-of-range index throws.
- **Identity (D18):** a patch cannot change `type`, `kind` or `id` — assert at the type
  level with a `// @ts-expect-error` line, and at runtime that the fields survive.
- **Serialisation:** the Document after a sequence of commands still round-trips through
  `JSON.parse(JSON.stringify(...))` unchanged.

### `doc-store.test.mjs`
- Dispatch → undo → redo returns a Document deep-equal to the one before undo.
- A sequence of 5 commands undone 5 times returns to the exact starting Document.
- A rejected command (unknown id) leaves `doc`, `past` and `future` **untouched**.
- Dispatching after undo clears `future`.
- `past` never exceeds 50 entries.
- `jumpTo` lands on the same Document that repeated `undo` would reach.

---

## Dependencies

- `zustand` — the store. First use; add it in this unit.

No other new dependency. If the implementation seems to need one, the design is wrong —
stop and raise it.

---

## Verify when done

- [ ] `npm run check` — lint 0/0, `tsc -b` clean, tests pass, build passes
- [ ] No `any`, no `@ts-ignore`, no non-null `!`
- [ ] `grep -rn "fabric" src/` returns nothing
- [ ] `grep -rn "state/" src/model src/print src/generators src/templates` returns nothing
- [ ] `apply` contains no `Date.now`, `Math.random`, `nanoid`, `console`, or `await`
- [ ] The switch in `apply` is exhaustive with a `never` default
- [ ] `dispatch` is the only assignment to `doc` in the codebase
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

`ui-store.ts` (selection, zoom, panels). Storage or autosave — Unit 04. Any rendering —
Unit 05. Any KDP math — Unit 03. Generator commands — Unit 12. The History **panel** — the
store exposes `past` and `jumpTo`; the panel is built in Unit 18.

If the spec seems to be missing something needed to finish, **it is not missing — it
belongs to a later unit.** Do not pull work forward.

---

## Note for the implementer

`legacy/novelka/src/stores/canvas-store.ts` is 716 lines and does everything: document
state, selection, zoom, panel visibility, history, and direct canvas calls. It is the
single clearest cause of the legacy build's crashes.

It is **not** a template. Read it only to see what the split is protecting against. This
store holds the Document and its history, and nothing else.
