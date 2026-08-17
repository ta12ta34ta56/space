# Progress Tracker — Novelka

> Update this file after every meaningful implementation change.
> It is how the next session recovers full context in one prompt.

**Last updated:** 17 August 2026 — Unit 03 complete

---

## Current Phase

**Phase 1 — Foundation.** Units 01, 02 and 03 are complete. The Document exists, it is
changeable in exactly one way (dispatch a Command), and the numbers it is derived against
— trims, papers, margins, safe area, cover geometry — are locked and tested.

The previous build now lives in `legacy/novelka/` and is the **reference implementation** —
the source of ported logic. It is not the thing being extended, it is not linted, and it
is not built.

---

## Current Goal

**Unit 04 — Storage and migrations.** IndexedDB save/load, debounced autosave,
`schemaVersion` migrations, `StorageFullError` with "download my work". Its spec has not
been written yet; see the open question below.

---

## Completed

### Unit 03 — KDP print truth *(17 August 2026)*

Built against `context/specs/03-print-truth.md`. Nothing beyond that spec was implemented:
no rendering, no guides, no preflight, no cover document, no UI. This unit is pure math
with tests.

**`src/print/trims.ts`** — the six trims (D7) and the **one paper vocabulary** (D8 defect
4). The paper *names* are declared in `model/types.ts` (the bottom layer, so the Document
can carry them) and re-exported here; the physical facts — `PAPER_STOCKS_INFO` with
`perPageIn` / `minPages` / `maxPages` — live here. `color-standard` is explicitly
0.002252 in, not premium's 0.002347 in (D8 defect 1, pinned by a regression test).
Per-trim ceilings are ported from the legacy limit table and trimmed to six trims:
`8.5x11` caps bw-white at 590, and `a4` returns **null** for `color-standard` —
unavailable, not merely limited. `assertPageCountFor` rejects out-of-range counts with a
message naming the limit **and** the paper; `UnsupportedBindingError` is thrown by every
function asked for hardcover (D24.4 — an honest refusal beats a rejected upload).

**`src/print/margins.ts`** — PORTED from `legacy/novelka/src/services/kdp.ts` with
exactly two changes and no others: (1) inches only — the legacy point fields are dropped
(architecture §3); (2) `safeAreaFor` takes a `TrimId` + `PaperStock` instead of bare
pageWidth/pageHeight. The gutter bands (150→0.375, 151→0.5, 300→0.5, 301→0.625,
500→0.625, 501→0.75, 700→0.75, 701→0.875, 828→0.875), the recto/verso rule (odd pages
are right-hand, gutter on the LEFT), and the bleed constants are verbatim. New export
`gutterBandFor` returns the band `{ maxPages, gutterIn }` because D16 needs band
comparisons, not width comparisons.

**`src/print/cover.ts`** — REBUILT, not ported (D8). `spine = pageCount × paper.perPageIn`
with **no +0.06″ allowance**; `width = 0.125 + trimW + spine + trimW + 0.125`;
`height = 0.125 + trimH + 0.125`. Spine text is allowed at **79 pages or more** (`>= 79`,
D8 defect 3); below that, `spineTextAllowed: false` so the UI can disable the control.
Barcode keep-out is 2″ × 1.2″ at the bottom-right of the back cover, offset 0.25″ from
the trim, placement ported from `legacy/cover-guides.ts`. Hardcover throws
`UnsupportedBindingError` at every trim.

**`src/print/reference-table.ts`** — the frozen 12-row `COVER_REFERENCE_TABLE`
(trim × paper × pages → spine, cover width, cover height) with the provenance note from
the spec: these are **derived** values, consistent by construction, our locked contract
rather than gospel — if a real KDP template ever disagrees, the table is corrected and
the test follows the table. `COVER_REFERENCE_TOLERANCE_IN = 0.0005`.

**`src/print/index.ts`** — the barrel for the layer (spec §5). The spec explicitly
requires it; the layer's exports all funnel through it.

**Model sync required by the spec, kept minimal:** `model/types.ts` `PAPER_STOCKS` now
declares the spec's five stocks (`premium-color` → `color-premium`, plus
`color-standard`). This is the "one paper vocabulary" requirement — the Document model
and the print layer share the same five ids, so D8 defect 4 cannot return. One existing
test (`commands.test.mjs` purity list) was updated from `'premium-color'` to
`'color-premium'`; no other model code changed.

**Tests** — `trims.test.mjs`, `margins.test.mjs`, `cover.test.mjs`, run by plain Node
over an esbuild bundle (`npm run test:trims` / `test:margins` / `test:cover`, chained
into `npm run test`):

- `trims`: TRIM_IDS matches `model/types.ts` **exactly** (compared against the model
  bundle); five stocks with the exact thicknesses; the color-standard 0.002252 pin;
  a4 + color-standard is null (unavailable), every other a4 paper is available;
  rejection messages name the limit and the paper; per-trim ceilings match the legacy
  limit table.
- `margins`: all nine gutter band boundaries; recto/verso gutter side; safe area inside
  the trim at every trim × every band; bleed shifting the outer minimum to 0.375;
  **ported values compared against a bundle of the actual legacy `kdp.ts`** — the same
  inputs give the same values, so a divergence means the port went wrong.
- `cover`: every reference row passes within 0.0005″ (the unit's headline test); 78/79/80
  spine-text threshold; spine is exactly `pages × perPageIn` (no +0.06); hardcover throws
  `UnsupportedBindingError` at all six trims; the barcode box sits inside the back cover
  and clears the spine at the thinnest and thickest spine, all six trims.

**Verification, all run and all green:** `npm run check` (lint 0 errors 0 warnings ·
`tsc -b` clean · 7/7 suites · build passes) · `grep -rn "\* ?72\|/ ?72" src/print/`
empty · `grep -rn "state/\|render/\|ui/\|fabric" src/print/` empty · `grep -rn
"0.002252" src/` hits only `print/trims.ts` and the tests · no `any`, no `@ts-ignore`,
no non-null `!` · every exported number is inches with an `In` suffix (page counts and
`Pt`-free by construction).

**Invariants checked explicitly** (`architecture.md` §10). Applicable and held: 1 (pure
functions; nothing renderer-shaped enters the Document), 4 (all geometry inches; no
conversion in `print/` — the grep proves it), 6 (cover geometry is a `CoverSpec`, never
a `Cover` element in `pages[]`), 7 (one paper vocabulary, five ids, shared with the
model; reference-table test pins the math), 10 (six trims, tested against the model),
14 (zero `any`, zero `!`), 15 (`print/` imports only `model/`), 16 (no backend). Not yet
applicable, nothing in this unit contradicts them: 2, 3, 5, 8, 9, 11, 12, 13, 17.

Judgement calls recorded rather than left silent:

- **`safeAreaFor` validates the page count** (`assertPageCountFor`) before computing.
  The spec's two changes to the port were inches-only and TrimId/PaperStock instead of
  raw numbers; validation is a deliberate consequence of the new signature — the paper
  parameter must mean something, and an honest refusal beats computing a safe area for a
  book KDP would reject. If the owner wants the legacy silently-clamping behaviour back,
  remove the one `assertPageCountFor` call. Documented in the `margins.ts` header.
- **The legacy comparison test builds `legacy/novelka/src/services/kdp.built.mjs`** into
  the legacy tree (gitignored via `**/*.built.mjs`) so the port test can import the real
  legacy code, not a copy of its numbers. `src/print/` stays clean for the grep checks.
- **`kdpMarginsFor` kept its legacy `(pageCount, options)` signature** — the spec's
  "take a TrimId and a PaperStock" applies to `safeAreaFor`, the function that actually
  took raw pageWidth/pageHeight.

### Unit 02 — commands and the document store *(17 August 2026)*

Built against `context/specs/02-commands-and-store.md`. Nothing beyond that spec was
implemented: no `ui-store`, no storage, no rendering, no KDP math, no generator commands.

**`src/model/commands.ts`** — the `Command` union with exactly the 15 members the spec
lists (5 page, 4 element, 4 book, 2 cover) and `apply(doc, cmd): Document`.

- **Pure.** No `Date.now`, no `Math.random`, no `nanoid`, no `console`, no `await`. New ids
  and timestamps arrive inside the command, which is why `page/duplicate` carries `newId`.
- **Structurally sharing.** `withPage` and `withElement` copy one array slot, so every page
  and element that did not change is the *same object reference* in the result. Unit 05's
  renderer will use that reference equality to decide what to repaint, so it is behaviour,
  not an optimisation. Book-only commands return the same `pages` array; page-only commands
  return the same `book` and `meta`.
- **Exhaustive.** The switch ends in `const unhandled: never = cmd`. Verified by deleting
  the `cover/clear` case and watching `tsc` fail with
  `Type '{ readonly t: "cover/clear"; }' is not assignable to type 'never'`, then restoring
  it. Appending the Unit 12 generator commands will fail the build until they are handled,
  which is the point.
- **Total or loud.** `requirePage` / `requireElement` / `requireIndex` throw `CommandError`
  naming the command and the missing id. Multi-id commands (`page/delete`,
  `element/delete`) check **every** id before removing any, so a partly unknown command
  applies none of itself.
- **`meta.updatedAt` is not touched by `apply`.** Asserted in the tests. The store stamps it.

`ElementPatch` carries only mutable fields: `frame`, `z`, `hidden`, `locked` plus the
payload fields (`text`/`style`, `shape`, `assetId`, `puzzle`). `id`, `type` and `kind` are
absent by construction, so patching identity is a compile error (D18).
`assertPatchKeys` enforces the same rule at runtime, per element type, because a patch can
arrive from a loaded file as well as from typed code: `text` on a shape is refused, not
silently dropped.

**`src/model/commands.type-test.ts`** — the compile-time half of the D18 test. Four
`@ts-expect-error` lines assert that patching `id`, `type` or `kind`, and dispatching a
`generate/pages` command, do not compile. `tsc -b` passing *is* the assertion: if the types
ever loosen, the unused directives fail the build. This is the one place
`@ts-expect-error` is permitted (code-standards.md, TypeScript).

**`src/state/doc-store.ts`** — Zustand 5, added in this unit and nothing else.
`createDocStore(initial)` returns a store of `{ doc, past, future, dispatch, undo, redo,
jumpTo }` and nothing more: no selection, no zoom, no panel, no theme. That absence is
asserted by a test on the store's key list.

- `dispatch(cmd, now)` runs `apply` then `assertValidDocument` **before** anything is
  stored, so a rejected command leaves `doc`, `past` and `future` untouched by reference
  and the error propagates. Tested for both rejection paths: a command `apply` refuses
  (unknown page) and a well-formed command whose *result* is illegal (duplicate element
  id).
- On success it pushes the *previous* Document onto `past` with a plain-language label,
  clears `future`, and stamps `meta.updatedAt` from the injected `now`. The store never
  reads the clock itself; a non-finite `now` throws.
- `past` is capped at 50; the oldest entries drop.
- `jumpTo(i)` moves entries between the stacks rather than replaying commands, and a test
  asserts it lands on the same `doc`, `past` and `future` as the equivalent run of `undo`,
  for every reachable target.
- **No timers, no coalescing, no debouncing.** One dispatch is one undo entry. A gesture
  previews from local component state and commits once when it ends — a binding rule on
  every later unit that adds a drag or a resize.

**Tests.** `src/model/commands.test.mjs` (16 blocks) and `src/state/doc-store.test.mjs`
(12 blocks), both run by plain Node over an esbuild bundle, as `npm run test:commands` and
`npm run test:doc-store`. Every one of the 15 commands has a test asserting the resulting
Document. Purity is proved by deep-freezing the input, replacing `Date.now` and
`Math.random` with throwing stubs, running all 15 commands, and byte-comparing the input
afterwards. Structural sharing is asserted by reference (`result.pages[0] === doc.pages[0]`,
`result.pages[3] !== doc.pages[3]`), at element level too. The command sequence result
still round-trips through `JSON.parse(JSON.stringify(...))` and still reloads through
`migrate`.

**Verification, all run and all green:** `npm run check` (lint 0 errors 0 warnings ·
`tsc -b` clean · 4/4 suites · build passes) · `npm run dev` serves the page with no console
errors · `grep -rn "fabric" src/` empty · `grep -rn "state/" src/model src/print
src/generators src/templates` matches only a prose comment · `apply` contains no `Date.now`,
`Math.random`, `nanoid`, `console` or `await` · no `any`, no non-null `!` · the only
`@ts-expect-error` lines are the four in `commands.type-test.ts` that exist to assert type
errors · `dispatch` is the only place a new `doc` is stored.

**Invariants checked explicitly** (`architecture.md` §10). Applicable and held: 1 (the
Document is still plain data; nothing renderer-shaped enters it), 2 (commands are the only
writer; nothing flows back), 3 (`apply` is pure, proved by the frozen-input test), 4 (no
geometry is created here; frames pass through untouched), 6 (`cover/set` and `cover/clear`
write `document.cover`; no command can put a cover in `pages[]`, and no interior command
reads or writes the cover), 8 (`kind` is carried in on the command, never inferred),
14 (zero `any`, zero non-null `!`; `@ts-expect-error` only in the file whose purpose is
asserting type errors), 15 (`model/` still imports nothing outside itself; `state/` imports
only `model/` and `zustand`), 16 (no backend). Not yet applicable, nothing in this unit
contradicts them: 5, 7, 9, 10, 11, 12, 13, 17.

One judgement call recorded rather than left silent: `page/duplicate` derives the copied
elements' ids as `` `${newId}-${element.id}` ``. Ids must be unique across the whole
Document, the copy's elements need new ones, and `apply` may not call `nanoid`. Deriving
them from the caller-supplied `newId` keeps `apply` pure and deterministic. The spec
specifies `newId` for the page only and is silent on its elements, so if the owner wants
generated ids for them instead, the command grows an `elementIds` field.

### Unit 01 — project skeleton and the Document model *(17 August 2026)*

Built at the repository root against `context/specs/01-skeleton-and-model.md`. Nothing
beyond that spec was implemented.

**Skeleton.** Vite 8 + React 19 + TypeScript 6, ESM, `"type": "module"`. `tsconfig.app.json`
and `tsconfig.node.json` both carry `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `noImplicitOverride`. Dependencies are exactly `react`,
`react-dom`, `nanoid`; dev-dependencies exactly `vite`, `@vitejs/plugin-react`,
`typescript`, `oxlint`, `esbuild`, `@types/*`. **No Fabric, no pdf-lib, no zustand.**
Scripts: `dev`, `build`, `preview`, `lint`, `test`, `check` (lint → tsc → test → build).
The test harness copies the legacy pattern — esbuild bundles the module, plain Node runs
the `.test.mjs` beside it — so failures print readable output and no test runner is a
dependency.

**`src/model/units.ts`** — the only file in the codebase that may contain `* 72` or `/ 72`.
`PT_PER_IN`, `inToPt`, `ptToIn`, `inToPx`, `pxToIn`, `roundIn` (4 dp). Every function
throws a named `UnitError` on non-finite input *and* on a non-finite result, so `NaN`
can never reach geometry.

**`src/model/types.ts`** — the Document model per `architecture.md` §2. Every vocabulary
is a `const` tuple with its union derived from it (`TRIM_IDS`, `PAPER_STOCKS`, `BINDINGS`,
`GENERATOR_KINDS`, `PAGE_KINDS`, `ELEMENT_KINDS`, `ELEMENT_TYPES`, `SHAPE_KINDS`,
`TEXT_ALIGNS`), so the runtime validator and the compile-time type cannot drift. All
geometry is inches with an `In` suffix, type sizes `Pt`; every field and array is
`readonly`; absence is `null`, never `undefined`. `Element` discriminates on `type`
(`text | shape | image | puzzle` — the payload) and carries `kind` separately (the eleven
D18 semantic families), so a divider stays a divider in the data. `PuzzleSpec` is
`{ kind, data, style }` (D3); `PuzzleData` and `PuzzleStyle` are `Record<string, never>`
placeholders until Unit 12.

**`src/model/parse.ts`** — `unknown` → `Document` with a `DocumentParseError` naming the
offending path. Split out from `document.ts` so shape-checking and invariant-checking stay
separate concerns.

**`src/model/document.ts`** — `createDocument` (takes injected `now` and `id`; calls
neither `Date.now()` nor `nanoid()` itself), `assertValidDocument` (duplicate ids, negative
or non-finite geometry, an element outside its page, a cover inside `pages[]`), and
`migrate`. Migration is a `readonly MigrationStep[]` chain walked in a loop, empty at
schema version 1, so adding v2 is an append — not a switch.

**`src/model/index.ts`** — the one permitted barrel.

**Placeholder app** — `main.tsx` (throws a named error if `#root` is missing rather than
asserting), `App.tsx` rendering `Novelka` on `--workspace`, and `index.css` containing
only the `ui-context.md` §2 tokens. No fonts are linked and no theme script exists — the
legacy `index.html` did both and is the anti-pattern, not the template.

**Tests** — `units.test.mjs` (5 cases) and `document.test.mjs` (7 cases), all passing.
Purity is proved by replacing `Date.now` and `Math.random` with throwing stubs for the
duration of the call. The serialisation round-trip test constructs one element of every
`ElementKind` and deep-equals the document against
`JSON.parse(JSON.stringify(doc))` — that test is what holds invariant 1 in place.

**Verification, all run and all green:** `npm run lint` 0 errors 0 warnings ·
`npx tsc -b` clean · `npm run test` 12/12 · `npm run build` passes · `npm run dev` serves
the page with no console errors · `grep -r "fabric" src/` empty ·
`grep -rE "\* ?72|/ ?72" src/ --include=*.ts` matches only `model/units.ts` (its header
comment) · no `any`, no `@ts-ignore`, no non-null `!` anywhere · `apply` does not exist
and nothing imports a store.

**Invariants checked explicitly** (`architecture.md` §10). Applicable and held: 1 (no
`canvas.toJSON()` anywhere; the Document is plain data), 3 (`createDocument` takes injected
`now`/`id`), 4 (all geometry inches, conversion only in `units.ts`), 6 (`Cover` is a
distinct type in `document.cover`; `assertValidDocument` rejects a cover in `pages[]`),
7 (one paper vocabulary, `PAPER_STOCKS`), 8 (`kind` is a stored field, never inferred),
10 (`TRIM_IDS` has exactly six entries, no custom size), 14 (zero `any`, zero `@ts-ignore`,
zero `!`), 15 (`model/` imports nothing outside itself), 16 (no backend). Not yet
applicable, nothing in this unit contradicts them: 2, 5, 9, 11, 12, 13, 17.

One deliberate deviation from the legacy setup, recorded here rather than silently: the
lint script is `oxlint --disable-nested-config --deny-warnings`. `legacy/novelka/` carries
its own `.oxlintrc.json`, and a nested config overrides the root `ignorePatterns`, so
without that flag oxlint lints the legacy tree and reports its 3 pre-existing
`react-hooks(exhaustive-deps)` warnings. Legacy is reference material and is not held to
the new standards.

### Phase 0 — architecture and context

- **Measured audit of the existing codebase** (`context/inventory.md`) — not recalled from
  documentation, measured directly:
  - 32,814 lines of logic, 18,999 lines of UI, 9,307 lines of tests
  - 0 `any` casts, clean `tsc`, all 25 test suites passing, clean build
  - ~25,000 of 32,800 logic lines are pure and portable by copying the file
  - Root cause of crashes identified: two sources of truth (Fabric + store) bridged by
    hand across 161 engine calls, 109 store subscriptions, 87 serialise round-trips, and
    97 `useEffect` hooks
- **Locked decisions** (`context/decisions.md`) — D1 through D16, each with its reason.
- **Context files written:**
  - `project-overview.md` — product definition, flow, scope, success criteria
  - `architecture.md` — stack, Document model, boundaries, 17 invariants
  - `ui-context.md` — visual language and the anti-vibecoded ban list
  - `code-standards.md` — implementation rules
  - `ai-workflow-rules.md` — agent behaviour and verification gates
  - `progress-tracker.md` — this file
  - `decisions.md` and `inventory.md` — supporting records
- **Specific defects found and documented with evidence:**
  - Cover math: 4 real defects (wrong standard-colour thickness, invented hardcover
    geometry with no hinge or board, off-by-one spine-text threshold, two incompatible
    paper vocabularies)
  - Crossword overlap: `layout.ts` clue-fitting loop stops shrinking at 5.5pt and places
    clues anyway; the crossword suite has 42 checks and none test layout
  - Gutter band trap: adding pages can cross a KDP gutter band and silently invalidate
    every page of a finished book
- **Claims checked and found false:** the templates were believed to be hardcoded for 6×9
  and unsafe at other trims. They are parametric and pass a 95,677-check safe-area audit
  at every trim, recto and verso. They are kept.

---

## In Progress

- Nothing. Unit 03 is finished and verified; Unit 04 has not started.

---

## Next Up

**Unit 04 — Storage and migrations.** IndexedDB save/load, debounced autosave,
`schemaVersion` migrations, `StorageFullError` with a "download my work" escape. Done
when a document survives save → reload → identical, and a v1 document opens under a v2
schema. `state/storage.ts` will also settle open question 4 (how a loaded project becomes
the live document).

The full ordered plan is `context/specs/00-build-plan.md` — 23 units in five phases.
Checkpoints: Unit 05 proves the architecture, Unit 11 is the first shippable book.

---

## Open Questions

1. **Unit 04 has no spec file yet.** `context/specs/` holds `00-build-plan.md` and
   `01-` / `02-` / `03-` unit specs. The build plan's summary of Unit 04 — IndexedDB
   save/load, debounced autosave, migrations, `StorageFullError` with "download my work"
   — is not enough to implement against on its own. Owner to write the spec, or to say
   the agent should draft it for review first.
2. **`PuzzleData` / `PuzzleStyle` are `Record<string, never>` until Unit 12.** The parser
   therefore *rejects* any puzzle carrying real data, with a message pointing at Unit 12.
   This is correct for now, but it means no document written between here and Unit 12 can
   contain a real puzzle. Flagging it so it is a known constraint and not a surprise.
3. **Duplicated element ids are derived, not generated** (Unit 02). `page/duplicate`
   carries `newId` for the page; its elements get `` `${newId}-${oldId}` `` because ids must
   be unique document-wide and `apply` may not call `nanoid`. Deterministic and pure, but
   it is a shape the spec did not state. If the owner wants generated ids there instead,
   the command grows an `elementIds` field. Low cost either way.
4. **Nothing reads the store yet.** `createDocStore` is a factory, not an app-wide
   singleton, because no UI exists to consume one and Unit 04 (storage) will decide how a
   loaded project becomes the live document. Whether the app ends up with a module-level
   store or a provider is a Unit 04 question, deliberately not answered here.
5. **`safeAreaFor` validates the page count before computing** (Unit 03 judgement call,
   recorded in the Unit 03 section). The spec's port changes were inches-only and
   TrimId/PaperStock; validation was added so the paper parameter means something and an
   illegal book is refused loudly. Remove the single `assertPageCountFor` call in
   `safeAreaFor` if the owner prefers the legacy silently-clamping behaviour.
6. **The cover reference table is derived, not scraped from Amazon** (as the spec's
   provenance note states). It is our locked contract; if the owner ever downloads a real
   KDP cover template and a value disagrees, the table is corrected and the test follows
   the table. Nothing to do now — flagged so the provenance is never mistaken for gospel.

Everything else was resolved on 17 August 2026 (D24). The owner decided History (keep),
PDF import (cut) and fonts (keep); the remaining calls were delegated to the agent and are
recorded with reasoning in `decisions.md` D24. Any of them can be overruled at low cost.

## Architecture Decisions

Full reasoning in `context/decisions.md`. Summary:

| # | Decision | Why |
|---|---|---|
| D1 | Fresh skeleton, ported brain | ~25,000 lines of pure logic are proven; the shell is what fails |
| D2 | Document is the only source of truth; Fabric renders and stores nothing | Deletes the dual-state crash class outright |
| D3 | **A puzzle is ONE semantic object** (data + style + frame) | Resolves "tidy" vs "editable"; makes apply-to-all one field and one undo step |
| D4 | Style is chosen in a live preview before generating, and stays live after | User sees real output before committing 50 pages |
| D5 | Generator algorithms are fine; layout is what is broken | 250+ algorithm tests pass; layout has no tests at all |
| D6 | No account to build; sign-in button present; gate at export, built later | A signup wall before value contradicts the product promise |
| D7 | Six fixed trims | Makes template QA finite and completable |
| D8 | Cover math rebuilt against a reference table; spine = pages × thickness, no +0.06" | Passing tests only proved the code agreed with itself |
| D9 | Bleed is an editor toggle, not a creation question | The user does not know the answer at creation time |
| D10 | Panels drag-reorder; no free-form canvas composition | Novelka produces books; it is not a design tool |
| D11 | Engine → generators → templates | Templates are designed around real generator output |
| D12 | No payments, accounts, admin, or backend in v1 | v1 is a static site with no servers to operate |
| D13 | **Templates are kept** — 95,677 safe-area checks pass | The feared defect does not exist; the real one is that `kdpSafe` is opt-in |
| D14 | Layout returns a result, never silently overflows | Root cause of the crossword overlap |
| D15 | Anti-vibecoded identity: not Inter, not purple, not Lucide | The current app trips the two loudest tells |
| D16 | Gutter band locked at creation; movement constrained to the safe area | Adding pages can silently invalidate a finished book; unconstrained movement discards the product's only real advantage |
| D17 | **The editor UI layout is preserved, not redesigned** | The right dock is proven, accessible, hard-won work; only its data source changes |
| D18 | Every element kind keeps its own identity | 31 dividers and 58 stickers all collapsed to one generic "sticker" row |
| D19 | Generation fills existing pages, never silently appends | 15-page book + generate = 30 pages; there was no fill operation at all |
| D20 | Real font faces only; missing styles disabled, never faked | 22 font files, only 1 italic — the browser was synthesising the rest |
| D21 | Simplifications: PDF-only export, auto-download both files, no drag-and-drop, one theme | Owner's call; every removal is one less thing to break |
| D22 | Template previews render true-to-print, with variants | Early templates preview as abstract shapes, not real pages |
| D23 | Dark only, with a neutral grey paper surround | Simultaneous contrast: white paper on near-black misleads print judgement |
| D24 | Remaining questions decided: history keep, import cut, 5 font families, paperback only, quick-create makes a complete interior | Owner delegated; all reversible |

---

## Session Notes

- **The owner is the architect; the agent is the implementation engine.** Push back on
  vague or contradictory requirements. Do not agree by default.
- **Measure before believing anything — including the owner's own account of the code.**
  Three months of exhaustion has made good work look broken. Twice now, a feared defect
  turned out not to exist (templates), while a real one sat undetected (crossword layout,
  cover math). Run the code. Read the file. Then answer.
- The **new** build runs at `http://localhost:5173/` via `npm run dev` from the repository
  root. `npm run check` is its full chain: lint → tsc → tests → build. It takes seconds.
- The **legacy** build lives in `legacy/novelka/` with its own `package.json`, its own
  dependencies and its own `.oxlintrc.json`. It is reference material: not linted, not
  type-checked and not built by anything at the root. Its dependencies must be installed
  in both `legacy/novelka/` and `legacy/novelka/server/` if it is ever run again.
- The six-file system plus `decisions.md` and `inventory.md` is the complete context. The
  entry point is `AGENTS.md` at the repository root.
