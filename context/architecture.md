# Architecture — Novelka

> **The most important file in the context system.** It defines the stack, the system
> boundaries, the data model, and the **invariants the codebase must never violate**.
> Read this before touching any code. If a spec contradicts this file, this file wins
> and the spec is wrong.
>
> Status: **v2 — locked 16 August 2026.** This describes the architecture we are building
> toward, not the one that exists today. The differences are deliberate and are listed
> in §11.

---

## 0. The one-sentence architecture

**Novelka is a pure function from a Document to a printable book.** Everything else —
canvas, panels, undo, autosave, export — is a view of that function or a way to edit its
input.

If you remember nothing else from this file, remember that. Every rule below is a
consequence of it.

---

## 1. Stack

| Layer | Technology | Role | Why this and not something else |
|---|---|---|---|
| Language | TypeScript (strict) | All code | `any` is banned. The domain is geometry; types catch unit errors. |
| UI | React 19 | Component tree | Already known, already working. Not a rewrite risk. |
| Build | Vite 8 | Dev server, bundling | Fast HMR, ESM-native. |
| Rendering | Fabric.js 6 | **Renderer only** — draws the document to a canvas | See §4. Fabric is demoted from "state owner" to "painter". |
| State | Zustand 5 | Holds the Document + UI state | Small, no boilerplate, no context hell. |
| Persistence | IndexedDB (via `storage/`) | Projects, autosave | localStorage's ~5 MB cap already lost a 5.7 MB book. Non-negotiable. |
| PDF out | pdf-lib + @pdf-lib/fontkit | Interior + cover PDFs with real embedded text | Proven in the current build. |
| PDF in | pdfjs-dist (lazy) | Optional page import | ~1.3 MB — loaded only when used. |
| Workers | Web Workers | Puzzle generation off the main thread | 16×16 sudoku takes ~2.1 s; it must not freeze the UI. |
| Tests | Node + esbuild + jsdom | Pure-logic and DOM suites | Already 9,300 lines and green. Keep the harness. |

### Explicitly NOT in the stack (v1)

No backend. No database. No auth provider. No Stripe. No analytics SDK. No CSS
framework. No component library. No state library beyond Zustand. No router library
(the app has ~4 views; a discriminated union in a store is enough).

> **Rationale.** Every dependency is a thing that can break, drift, or demand a version
> upgrade at the worst moment. v1 ships as a static site with zero servers to operate.

---

## 2. The Document model — the single source of truth

This is the heart of the rebuild. **The Document is plain, serialisable, immutable data.**
No class instances, no Fabric objects, no functions, no DOM references. If it cannot be
`JSON.stringify`'d and read back identically, it does not belong in the Document.

```ts
type Document = {
  readonly id: string;
  readonly schemaVersion: number;      // migrations are explicit, never implicit
  readonly book: BookSettings;         // trim, paper, binding — the physical object
  readonly pages: readonly Page[];      // interior pages, in print order
  readonly cover: Cover | null;         // isolated surface; null when no cover
  readonly meta: { title: string; createdAt: number; updatedAt: number };
};

type BookSettings = {
  readonly trimId: TrimId;             // one of six; see §3
  readonly paper: 'bw-white' | 'bw-cream' | 'bw-groundwood' | 'premium-color';
  readonly binding: 'paperback' | 'hardcover';
};

type Page = {
  readonly id: string;
  readonly kind: GeneratorKind;        // 'sudoku' | 'wordsearch' | ... | 'template' | 'blank'
  readonly role: 'interior';           // covers never live in pages[]
  readonly elements: readonly Element[];
  readonly locked: boolean;
};

type Element =
  | { type: 'text';   id: string; frame: Frame; text: string; style: TextStyle; z: number; hidden: boolean; locked: boolean }
  | { type: 'shape';  id: string; frame: Frame; shape: ShapeSpec; z: number; hidden: boolean; locked: boolean }
  | { type: 'image';  id: string; frame: Frame; assetId: string; z: number; hidden: boolean; locked: boolean }
  | { type: 'puzzle'; id: string; frame: Frame; puzzle: PuzzleSpec; z: number; hidden: boolean; locked: boolean };

// A generated puzzle is ONE element — never a pile of cells. See decisions.md D3.
type PuzzleSpec = {
  readonly kind: GeneratorKind;   // 'sudoku' | 'wordsearch' | 'crossword' | 'maze' | 'handwriting'
  readonly data: PuzzleData;      // WHAT it is: seed, givens, solution, words, difficulty
  readonly style: PuzzleStyle;    // HOW it looks: borders, colours, fonts, cell size
};

type Frame = { xIn: number; yIn: number; wIn: number; hIn: number };  // see §3 — inches, always
```

### Rules for the Document

1. **Immutable.** Every edit produces a new Document. Never mutate in place.
2. **Serialisable.** No class instances, no `undefined` (use `null`), no `NaN`.
3. **Self-describing.** `schemaVersion` is bumped whenever the shape changes, and a
   migration function is written *in the same commit*. Old saved books must always open.
4. **Complete.** The Document alone is enough to render, preflight, and export the book.
   If rendering needs a fact that is not in the Document, that fact is missing from the
   Document — add it there, do not stash it in a component.
5. **`kind` is assigned at creation and never inferred.** Nothing may guess a page's kind
   by counting objects or sniffing shapes.
6. **A puzzle is one element, and its style is data.** Restyling a puzzle sets a field in
   `puzzle.style` and re-renders. Nothing ever reaches inside a puzzle to patch individual
   cells, letters, or lines. "Apply to all" copies one `style` object across pages — one
   command, one undo record. (The current app's `live-style.ts`, which deep-searches Fabric
   groups and patches matching objects by hand, is deleted rather than ported.)

### What is NOT in the Document

Selection. Zoom. Which panel is open. Theme. Guide visibility. Hover state. Scroll
position. Undo history. Any of these in the Document is a bug: it would make "select an
element" an undoable, autosaved document change.

---

## 3. Units and coordinates — one rule, zero conversions in UI

> **All Document geometry is in INCHES. Always. Everywhere.**

Points, pixels, and millimetres exist only at the boundaries: `topt()` at the PDF
boundary, `toPx(scale)` at the render boundary. A number in the Document with no unit
suffix is a bug; every geometry field is named `xIn`, `wIn`, `fontSizePt`, etc.

**Rationale.** The current codebase mixes points and pixels and inches across layers.
Unit confusion is the number-one source of "why is this 3 px off the safe area" bugs,
and it is exactly the class of bug that is invisible until a real print run.

### The six supported trims (locked)

| id | Inches | Notes |
|---|---|---|
| `6x9` | 6 × 9 | The default. The most common KDP trim. |
| `5.5x8.5` | 5.5 × 8.5 | Compact puzzle/activity books. |
| `7x10` | 7 × 10 | Large-print puzzle books. |
| `8x10` | 8 × 10 | Activity / kids' books. |
| `8.5x11` | 8.5 × 11 | Workbooks, handwriting, planners. |
| `a4` | 8.27 × 11.69 | European printing. |

No custom sizes. No width/height inputs. Adding a seventh trim is a deliberate change to
this table plus a full template re-verification — never an ad-hoc addition.

### Derived print geometry (never stored, always computed)

`bleed`, `margins`, `gutter`, `safeArea`, `spineWidth`, `coverSize` are **pure functions
of `BookSettings` + `pages.length`**. They are never fields in the Document, because a
stored copy can go stale the moment a page is added. The gutter grows with page count —
storing it is a guaranteed future bug.

```
safeAreaFor(book, pageCount, pageIndex) -> Frame   // gutter side flips recto/verso
```

---

## 4. Fabric is a renderer, never a store

This is the invariant that fixes the crashes. Stated plainly:

> **Data flows one way: Document → Renderer → pixels. Nothing flows back.**

```
        ┌─────────────────────────────────────────────┐
        │                 Document                    │  ← the only truth
        └───────────────┬─────────────────────────────┘
                        │ (pure, one-way)
            ┌───────────┴────────────┬──────────────────┐
            ▼                        ▼                  ▼
     render/canvas            render/pdf          domain/preflight
     (Fabric → screen)     (pdf-lib → file)      (pure → report)
            │
            │ user gestures produce COMMANDS, not mutations
            ▼
     commands/apply(doc, cmd) -> Document        ← the only writer
```

### Concretely

- `render/canvas` **reads** a `Page` and paints it. It owns no state that outlives a
  frame. If you destroyed and recreated the canvas every render, the app would behave
  identically (just slower). That is the test for whether this rule is being honoured.
- Fabric objects are **disposable output**, not records. They are never serialised into
  the Document. `page.data = canvas.toJSON()` — the current approach — is **banned**.
- User gestures (drag a handle, type in a field, hit a key) **do not touch Fabric state**.
  They dispatch a Command. The Command produces a new Document. The Document re-renders.
- The renderer may keep a **cache** keyed by page id + revision, because caches are
  derived and can be thrown away at any moment without changing behaviour. State cannot.

### Why the current app crashes (the thing we are fixing)

Measured in today's codebase: **161** direct engine calls from `.tsx`, **109** store
subscriptions, **87** `toJSON`/`loadFromJSON`/`renderAll` round-trips, **97** `useEffect`
hooks bridging two copies of the same data. Each is a place the copies can drift. That is
the "fix one thing, break another" loop. One-way data flow deletes the entire bug class —
not by being careful, but by making the bug *impossible to express*.

---

## 5. Commands — the only way to change anything

Every mutation is a typed, named, pure Command.

```ts
type Command =
  | { t: 'page/add';        index: number; page: Page }
  | { t: 'page/delete';     ids: string[] }
  | { t: 'page/reorder';    from: number; to: number }
  | { t: 'page/duplicate';  id: string }
  | { t: 'element/update';  pageId: string; elementId: string; patch: Partial<Element> }
  | { t: 'element/reorder'; pageId: string; elementId: string; z: number }
  | { t: 'book/setTrim';    trimId: TrimId }
  | { t: 'generate/pages';  kind: GeneratorKind; pages: Page[]; at: number }
  | { t: 'applyToAll';      kind: GeneratorKind; patch: StylePatch }
  // ...
```

```ts
apply(doc: Document, cmd: Command): Document   // pure. no I/O. no Date.now(). no Math.random().
```

### What this buys us, for free

| Feature | How it falls out |
|---|---|
| Undo / redo | A stack of Documents (or commands). ~40 lines. Cannot desync. |
| Autosave | Persist on Document change, debounced. One subscription. |
| "Apply to all" | One Command → one Document → **one** undo record, by construction. |
| Reorder pages/layers | An array move on immutable data. Physically cannot desync from the canvas. |
| Tests | `apply()` is pure: assert `apply(doc, cmd)` deep-equals expected. No DOM, no mocks. |
| Crash recovery | The last good Document is on disk. Reload restores it exactly. |

**Randomness and time are injected, never called inside `apply`.** Puzzle generation
takes a seed; the seed is stored in the page so the same book regenerates identically.

---

## 6. System boundaries — which folder owns what

Dependencies point **downward only**. A lower layer must never import a higher one.
This is mechanically checkable and will be checked.

```
src/
├── model/         # LAYER 0 — types + pure Document logic. Imports NOTHING.
│   ├── types.ts           Document, Page, Element, Frame, BookSettings, TrimId
│   ├── commands.ts        Command union + apply(doc, cmd) — the only writer
│   ├── document.ts        create, migrate(schemaVersion), invariant assertions
│   └── units.ts           inches ↔ pt ↔ px. The ONLY place conversions exist.
│
├── print/         # LAYER 1 — KDP truth. Imports: model.
│   ├── trims.ts           the six trims + page-count limits per paper
│   ├── margins.ts         margins, gutter-by-page-count, safe area (recto/verso)
│   ├── cover.ts           spine width, cover size, zones  [REBUILT — see decisions.md D8]
│   └── preflight.ts       pure Document -> Report[]        [PORTED]
│
├── generators/    # LAYER 2 — pure content. Imports: model, print.
│   ├── wordsearch/  sudoku/  crossword/  maze/  handwriting/
│   │     generator.ts   pure algorithm, seeded          [PORTED — do not rewrite]
│   │     layout.ts      Puzzle + Frame -> Element[]      (lays out inside the safe area)
│   │     banks.ts       word/clue data                   [PORTED]
│   │     schema.ts      the generator's options + defaults + validation
│   └── registry.ts      GeneratorKind -> definition. Adding a generator = one entry.
│
├── templates/     # LAYER 3 — parametric page designs. Imports: model, print.
│                  #   A template is (Frame, params) -> Element[]. Adapts to all 6 trims.
│
├── render/        # LAYER 4 — Document -> pixels/PDF. Imports: model, print.
│   ├── canvas/      Fabric renderer. THE ONLY PLACE `import 'fabric'` APPEARS.
│   ├── pdf.ts       pdf-lib export, interior + cover as separate files
│   └── thumbnail.ts small raster previews (guides always stripped)
│
├── state/         # LAYER 5 — Zustand. Imports: model, print, generators, templates.
│   ├── doc-store.ts    the Document + dispatch(cmd) + undo/redo. THE ONLY WRITER.
│   ├── ui-store.ts     selection, zoom, open panel, view — never persisted to the doc
│   └── storage.ts      IndexedDB read/write, debounced autosave
│
├── ui/            # LAYER 6 — React. Imports: everything below. Owns no domain logic.
│   ├── app/         shell, view switching, keyboard shortcuts
│   ├── views/       Home, NewBook, Editor, Export
│   ├── panels/      Pages, Layers, Inspector, Generator, Template
│   └── kit/         Button, Field, Select, Modal, Toast — the design system primitives
│
└── assets/        # SVGs, fonts. Data, not code.
```

### Ownership rules

1. **`model/`, `print/`, `generators/`, `templates/` are pure.** No React, no Fabric, no
   DOM, no `window`, no I/O. They are testable with plain Node. This is where the value is.
2. **`render/canvas/` is the only place Fabric is imported.** Grep-enforceable.
3. **`state/doc-store.ts` is the only thing that writes the Document.** Every other module
   dispatches a Command.
4. **`ui/` contains no domain logic.** A React component may not compute a margin, decide
   a font size, or lay out a puzzle. It reads derived values and renders them. If a
   component needs a calculation, that calculation belongs in a lower layer.
5. **Generators do not know about React, panels, or the canvas.** A generator takes
   options and a frame, and returns elements. That is all.

---

## 7. Adding a generator — the extensibility test

An architecture is only as good as how cleanly it extends. To add a sixth generator
(say, cryptogram) the complete list of changes must be:

1. `generators/cryptogram/` — `generator.ts`, `layout.ts`, `schema.ts`, `banks.ts`
2. One entry in `generators/registry.ts`
3. One test file

**Zero** changes to the UI, the store, the renderer, the export path, or preflight. The
generator panel is rendered *from the schema*, not hand-written per generator.

> If adding a generator requires touching `ui/`, the abstraction is wrong — fix the
> abstraction, do not special-case the generator. (Today, five generators have five
> bespoke panels totalling ~110 KB. That is the anti-pattern this rule kills.)

---

## 8. Storage model

- **One IndexedDB database**, `novelka`, store `projects`, keyed by project id.
- A record is `{ id, schemaVersion, document, updatedAt, thumbnail }`.
- **Autosave** is debounced (~800 ms after the last change) and writes the whole
  Document. Documents are small (elements are compact JSON, not Fabric dumps).
- **Migrations run on load**, driven by `schemaVersion`, one pure function per version
  step. A book saved in v1 must open in v9. There is a test for every migration.
- `StorageFullError` is surfaced honestly with a "download my work" escape hatch. Never
  fail silently, never pretend a save succeeded.
- **No cloud, no accounts, no sync in v1.** The user's books are on their machine.

---

## 9. Rendering pipeline

1. `doc-store` holds the Document.
2. A page is selected → `render/canvas` receives `(page, book, scale)`.
3. The renderer builds Fabric objects from `page.elements`, in `z` order, converting
   inches → px once at the boundary.
4. Guides (safe area, bleed, gutter, spine, barcode) are drawn as **DOM overlays above
   the canvas** — `pointer-events: none` — never as Fabric objects.
5. Resolution: integer CSS sizes, `devicePixelRatio`-aware backing store, 2×
   supersampling capped at 4096 px. Re-render on DPR/monitor/zoom change. *(Ported —
   this logic is already correct and hard-won.)*
6. Thumbnails and export take the **same** `page.elements` through the same layout
   math. There is exactly one definition of where things are.

> **Corollary — WYSIWYG is structural, not aspirational.** Screen, thumbnail, and PDF
> read the same data through the same geometry. They cannot disagree, because there is
> nothing for them to disagree about.

---

## 10. Invariants — rules the codebase must NEVER violate

These are not guidelines. A pull request violating one of these is wrong even if it works.

1. **The Document is the only source of truth.** Fabric holds no state the Document does
   not have. `canvas.toJSON()` is never stored.
2. **Data flows one way.** Document → render. Gestures → Commands → new Document. Never
   render → Document.
3. **`apply(doc, cmd)` is pure.** No I/O, no `Date.now()`, no `Math.random()`, no
   mutation of the input. Time and randomness are injected.
4. **All Document geometry is in inches.** Conversions happen only in `model/units.ts`
   and at the render/PDF boundaries.
5. **Guide overlays are never document content.** Never in `elements`, never in
   selection, never in thumbnails, never in export.
6. **The cover is an isolated surface.** It lives in `document.cover`, never in `pages[]`.
   Interior operations — apply-to-all, templates, interior export — never touch it.
7. **Print math is verified against reference data, never against itself.** `print/cover.ts`
   is rebuilt against a reference table of known-good KDP values (see `decisions.md` D8);
   `print/margins.ts` is ported. Changes to either require a failing reference test first.
   One paper vocabulary exists, defined once in `print/trims.ts`.
8. **`kind` is assigned at creation and never inferred.** No guessing a page's type by
   inspecting its contents.
9. **Generated content is built at the interior trim size** from `book.trimId` — never
   the cover size, never a hardcoded default.
10. **Only the six trims.** No custom size input, ever. Every template must be verified
    at all six.
11. **No free-form canvas design.** Pages and Layers panels support drag-**reorder**;
    elements can be selected, nudged, resized and recoloured. Dragging elements around
    the canvas to compose a layout is not a feature.
12. **Real fonts only.** Bold and italic load actual font files. Synthetic bold/italic is
    banned — it does not survive PDF embedding honestly.
13. **No dead controls.** Every visible control does something real. A control that is
    not implemented is not rendered.
14. **No `any`.** No `@ts-ignore`. No non-null assertion (`!`) outside `model/` invariant
    checks. The current codebase has zero `any` — that record is kept.
15. **Every layer imports downward only.** `ui/` may import `model/`; `model/` may never
    import anything.
16. **No payments, accounts, admin, or backend in v1.** If a feature needs a server, it
    is out of scope. A sign-in button may exist in the UI; the only gate is at export, and
    it stays open until a backend exists.
17. **Puzzle style is a bounded schema, never free-form.** Each generator declares its
    style options as an enumerated, validated schema with safe defaults. Every reachable
    combination must be printable and inside the safe area — a user cannot style their way
    into a rejected book.

---

## 11. Deliberate differences from the current codebase

For the agent porting the code, and for the human reviewing it:

| Today | v2 | Why |
|---|---|---|
| Fabric JSON stored in `page.data` | Typed `Element[]` | Serialisable, diffable, testable, ~10× smaller, and renderer-independent. |
| Two sources of truth bridged by 97 effects | One Document, one-way flow | Deletes the crash class. |
| Mixed pt/px/inch across layers | Inches everywhere in the Document | Deletes the off-by-a-margin class. |
| 5 bespoke generator panels (~110 KB) | 1 schema-driven panel | Adding a generator stops touching the UI. |
| 16 trims | 6 trims | Template QA becomes finite and actually completable. |
| Auth + flags + entitlement + Stripe + admin (~5,000 lines + 32 MB server) | Deleted | Not the product. |
| `canvas-store` 716 lines doing everything | `doc-store` (document + history) and `ui-store` (ephemeral) | Two clearly different lifetimes should not share a store. |

### What is ported unchanged (the three months that count)

`generators/*/generator.ts` (maze 760, crossword 599, sudoku 520, handwriting 830,
word-search solver 683), all word and clue banks, `print/cover.ts`, `print/margins.ts`,
the trim table, `preflight.ts`, the SVG sanitiser, the 130 SVG assets, and the ~9,300
lines of tests that prove them.

**Roughly 25,000 of ~32,800 logic lines move by copying the file.** The rebuild is the
skeleton, not the brain.
