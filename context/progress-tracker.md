# Progress Tracker — Novelka

> Update this file after every meaningful implementation change.
> It is how the next session recovers full context in one prompt.

**Last updated:** 17 August 2026 — Unit 06 complete

---

## Current Phase

**Phase B — Making it visible.** Units 01 through 06 are complete. The Document exists,
it is changeable in exactly one way (dispatch a Command), the KDP numbers it is derived
against are locked and tested, persistence and autosave are proven, the canvas renderer
proves the one-way Document → pixels architecture, and the editor shell now frames the
page with the six print guide overlays drawn as DOM above the canvas.

The previous build now lives in `legacy/novelka/` and is the **reference implementation** —
the source of ported logic. It is not the thing being extended, it is not linted, and it
is not built.

---

## Current Goal

**Unit 07 — Right dock: Pages (ported design, D17).** The Pages tab reproduced exactly:
thumbnails, subtle insert gutters, warning dot, selected state, drag-reorder with
drop-line, duplicate, delete. IntersectionObserver + rAF-throttled live thumbnails.
Reads the Document, dispatches Commands. Done when it is indistinguishable from the
original, except it cannot desync.

---

## Completed

### Unit 06 — Editor shell and print guides *(17 August 2026)*

Built against `context/specs/06-shell-and-guides.md`. The frame the editor lives in, and
the guides that make Novelka worth using. Still no editing: no selection, no dragging,
no panels — the right dock is a reserved, empty 280px column until Unit 07.

**`src/print/guides.ts`** — the geometry, pure. `guidesFor(book, pageIndex, pageCount,
{ surface, bleedOn })` returns `Guide[]` (`{ kind, rectIn, label }`), computed entirely
from Unit 03 (`safeAreaFor`, `kdpMarginsFor`, `coverSpecFor`, `barcodeKeepOutIn`). No new
KDP math. Interior guides: trim, safe area, gutter (left on recto, right on verso), and
the bleed band (top/bottom/outside only — the gutter edge is never trimmed) when bleed is
on. Cover guides: bleed, trim, spine fold, back/front safe areas (panels inset by KDP's
0.25 in minimum, placement ported from `legacy/novelka/src/services/cover-guides.ts`),
and the barcode keep-out. Impossible requests throw `GuideError`; hardcover passes
through Unit 03's `UnsupportedBindingError`. Every numeric label carries a unit
(`Gutter 0.375 in`).

**`src/ui/canvas/GuideOverlay.tsx`** — DOM above the canvas, never Fabric (architecture
§9 rule 4). `pointer-events: none` inline AND in the stylesheet, `aria-hidden`, fixed
instrument colours via the `--guide-*` tokens. A hidden guide renders nothing — no
invisible element that could still be hit. Renders interior pages and the cover surface.

**`src/state/ui-store.ts`** — the second store (architecture §6): `zoom` (clamped,
step ladder), `currentPageIndex`, `visibleGuides` (per guide kind), `bleedOn` (D9),
`activePanel` (declared for Unit 07), `selection` (declared for Unit 09). Nothing in it
is ever persisted, undone, or written to the Document; the test asserts the ui-store and
Document key sets are disjoint.

**Shell** — `ui-context.md` §7 exactly: `TopBar.tsx` (48px; brand, inline-editable book
name dispatching one `book/setTitle` per commit, monospaced trim and page count readouts;
Preflight/Export absent, not greyed out — honesty rule 3), `LeftRail.tsx` (56px; ported
FoundationRail structure per D17 — `aria-pressed`, labels under icons; only the toggles
that work are rendered: safe, gutter, trim, and the bleed guide toggle only while bleed
is on; rulers/grid/snap belong to Unit 09 and are absent), `BottomBar.tsx` (36px; ported
EditorFooter behaviour — zoom out/readout/in, Fit, the "9 of 10" page indicator that
swaps to an inline jump-to-page input (D21), and the bleed Toggle (D9)), `AppShell.tsx`
(dark chrome `--surface`, paper on `--workspace` #4a4a4c grey (D23), reserved empty
right dock, keyboard zoom shortcuts, autosave wiring kept from Unit 05).

**`src/ui/kit/`** — Button, Field, Select, Toggle, Tooltip, Icon. Tokenised, no library.
Icons are hand-drawn on a 20×20 grid at 1.5px stroke (D15, never Lucide). Print terms get
real explanatory tooltips (gutter, bleed, trim, safe area) shown on hover and focus.
`index.css` grew the full token set (type scale, spacing, radius, fonts — IBM Plex Sans/
Mono stacks); the dead `App.css` placeholder was deleted.

**Tests** — `guides.test.mjs` (pure: rects inside the page at all six trims, recto/verso
gutter flip, bleed toggles only the bleed rect, spine+barcode are cover-only, 150→151
band crossing moves the gutter guide, labels carry units, refusals), `ui-store.test.mjs`
(key sets disjoint from the Document; toggling guides/zoom/bleed leaves `doc`, `past`,
`future` untouched by reference; guides toggle independently; zoom clamps),
`overlay.test.mjs` (jsdom: guides are DIVs not canvas objects, pointer-events none
inline and in CSS, hidden guide renders nothing, overlay above the canvas in stacking
order, cover surface renders spine and barcode), `no-dead-controls.test.mjs` (walks the
rendered shell; fails on any disabled control; Preflight/Export/Ruler/Grid/Snap absent;
every control has an accessible name; no em dashes; "1 of 24"; units on numbers).
18/18 suites green.

**Placeholder document** — `state/store.ts` now creates a blank 24-page book (KDP's
minimum) instead of 0 pages, so the shell stands on real recto/verso pages until the New
Book flow (Unit 10) replaces it.

**Verification, all run and all green:** `npm run check` (lint 0/0 · `tsc -b` clean ·
18/18 suites · build passes) · `grep -rn "from 'fabric'" src/ui/` empty ·
`grep -rn "lucide\|react-icons" src/` empty · `grep -rn "#6366f1\|#a78bfa" src/` empty ·
no guide state in `model/` or the Document · paper on `--workspace` grey (D23) ·
all six guides toggle independently (test) at all six trims recto and verso (test) ·
dev server runs with no console errors. Note: the spec's literal
`grep -rni "inter\b..."` check matches the substring in "pointer" and "printer", so the
D15 intent was verified instead: no Inter/Geist/Space Grotesk font reference exists
anywhere in `src/`.

**Invariants checked explicitly** (`architecture.md` §10). Applicable and held: 1–2 (ui
reads the Document, dispatches Commands; guides flow Document → print → DOM, nothing
back), 4 (the only conversion is `inToPx`/`inToPt` at the render boundary), 5 (guides
are DOM overlays, never in `elements`, never selectable, never exported), 6 (cover
guides are a separate surface; interior guides never show spine/barcode), 7 (guide
geometry reads Unit 03's tested functions; no new KDP math), 13 (no dead controls —
enforced by a test), 14 (zero `any`, zero `!`), 15 (`print/guides` imports model only;
`ui/` imports downward only), 16 (no backend).

### Unit 05 — The canvas renderer *(17 August 2026)*

Built against `context/specs/05-canvas-renderer.md`. Turns a Document into pixels, one
direction only. Proves the core architecture invariant (D2: Document is the only source
of truth; Fabric is a disposable painter that stores nothing).

**`src/render/canvas/`** — the only place Fabric is imported across the entire codebase.
Enforced by `fabric-boundary.test.mjs`, which walks `src/` and fails if Fabric is imported
anywhere outside this folder or if any Fabric type is exported outside it.

**`src/render/canvas/resolution.ts`** — PORTED pure resolution and viewport math from
`legacy/novelka/src/engine/canvas-engine.ts` L307–348:
- CSS size is an integer.
- Backing store = CSS × `devicePixelRatio`.
- 2× supersampling below the cap keeps text and shapes crisp at fractional zooms (73%, 137%).
- Capped at 4096 px on the long side to prevent GPU memory exhaustion.
- `pixelScaleFor({ cssW, cssH, dpr, maxPx })` and `computeCanvasDimensions(...)`.

**`src/render/canvas/render-page.ts`** — `renderPage(canvas, page, book, scale)`:
- Pure painter: reads `page.elements` in ascending `z` order and draws them onto the canvas.
- Converts inches → px exactly once at the boundary via `model/units` (`inToPx`, `ptToIn`).
- `grep -rn "\* ?72\|/ ?72" src/render/` hits nothing.
- Writes nothing back: no `toJSON()`, no `toObject()`, no geometry read back.
- Fabric objects carry `{ elementId }` for hit-testing and nothing else.
- A puzzle element renders as ONE Fabric object (D3 placeholder frame; real drawing in Unit 12).
- `kind` is read from element, never inferred (D18, invariant 8).
- `hidden: true` elements are skipped.

**`src/render/canvas/CanvasHost.tsx`** — the single React seam owning a Fabric Canvas instance:
- Creates canvas on mount, `dispose()` called on unmount.
- Subscribes to `store`; uses structural sharing from Unit 02 to skip repaint if `page`
  and `book` references have not changed.
- Exactly 1 `useEffect` hook (`grep -c "useEffect"` is 2 including import, <= 2 limit).
- Paper styling: pure white on `--workspace` grey (`#4a4a4c`) with a soft drop shadow (D23).

**`src/render/canvas/thumbnail.ts` + `src/render/thumbnail.ts`** —
`renderThumbnail(page, book, maxPx)`:
- Same code path as the main renderer (`renderPage`).
- Paints opaque white background before `toDataURL` (the D17 transparent-to-black JPEG fix).
- Quality 0.6 JPEG, multiplier `min(1, maxPx / pageWidthPx)`.
- Re-exported by `src/render/thumbnail.ts` without leaking Fabric types.
- Closes tracker open question 8: `StoredProject` and `storage.save(doc, thumbnail)` support `thumbnail`.

**`src/ui/app/AppShell.tsx`** — the minimum shell:
- Centred workspace on `--workspace` grey (`#4a4a4c`), dark header and footer (`#191a1c`).
- Zoom controls (zoom in, zoom out, 100% reset, Fit) and keyboard shortcuts (`Ctrl/Cmd +/-/0`).
- Wires Unit 04 autosave (`createAutosave` on mount, `stop()` on unmount), closing tracker open question 7.

**Tests** — `resolution.test.mjs`, `fabric-boundary.test.mjs`, `render-page.test.mjs`,
`thumbnail.test.mjs`, chained into `npm run test` (14/14 suites green):
- `resolution`: 2× supersample applied below cap; 3000×3000 at dpr 2 yields long side of 4096;
  `pixelScale` >= 1; integer CSS dimensions across all tested dpr and fractional zooms.
- `fabric-boundary`: walks `src/` to prove Fabric is imported in `src/render/canvas/` only;
  no Fabric types exported outside canvas; no `toJSON`/`toObject` calls in `src/`;
  no raw `* 72` / `/ 72` in `src/render/`; `CanvasHost.tsx` has <= 2 `useEffect`.
- `render-page`: **the headline rebuild test passes** — render page with all element kinds,
  snapshot, dispose canvas completely, create new canvas, render same document, assert snapshots
  are byte-identical; deep-frozen document verified unchanged after rendering; elements render
  in `z` order; `hidden: true` renders nothing; puzzle produces exactly one Fabric object;
  `dispose()` cleans up all listeners.
- `thumbnail`: JPEG data URL produced on opaque white ground; `maxPx` and aspect ratio preserved.

**Verification, all run and all green:** `npm run check` (lint 0 errors 0 warnings ·
`tsc -b` clean · 14/14 suites · build passes) · `grep -rn "from 'fabric'" src/ | grep -v "src/render/canvas/"` empty ·
`grep -rn "toJSON()\|toObject()" src/` empty · `grep -rn "\* ?72\|/ ?72" src/render/` empty ·
`grep -c "useEffect" src/render/canvas/CanvasHost.tsx` <= 2.

**Invariants checked explicitly** (`architecture.md` §10). Applicable and held: 1 (the
Document is the only truth; Fabric holds no state Document does not have), 2 (data flows
one way: Document → render; no state flows back), 3 (`renderPage` does not mutate input),
4 (all conversions in `units.ts`), 5 (guides are not in canvas elements), 8 (`kind` is read,
never inferred), 14 (zero `any`, zero `!`), 15 (`render/canvas/` imports `model/` and `print/`,
nothing higher), 16 (no backend).

### Unit 04 — Storage and migrations *(17 August 2026)*

Built against `context/specs/04-storage-and-migrations.md`. Nothing renders: no project
list UI, no recovery prompt, no "download my work" button (those are later units). This
unit exposes the functions those surfaces will call, and proves a document survives
save → reload → identical and a v1 document opens under a v2 schema.

**`src/model/migrate.ts`** — the migration chain moved out of `document.ts` and given its
first real step. `CURRENT_SCHEMA_VERSION` is now **2**; the **v1→v2 step is a deliberate
no-op** that changes only `schemaVersion`, so the mechanism is exercised by a real
migration before anyone depends on it (v2 is intentionally identical to v1, recorded
here as the spec asks). A future `schemaVersion` is refused with "saved by a newer
version of Novelka" naming the version; a **missing** `schemaVersion` is refused with its
own message, never assumed to be v1 (`readSchemaVersion` now says "is missing").
Migration runs before `assertValidDocument`, and `migrate` is pure and non-mutating.

**`src/state/storage.ts`** — IndexedDB, PORTED from `legacy/novelka/src/services/storage.ts`
with exactly the spec's changes: the payload is a `Document` (not `ProjectFile`); the
legacy migration (`migrateLegacy`, `LEGACY_DB_NAME`, `DB_MIGRATED_FLAG`, the old
localStorage keys) is deleted; errors are never swallowed (`list`/`get`/`save`/`remove`
reject — the only fallback that survives is the localStorage *index cache*, which is
advisory by design); and `Date.now()` is injected (`createStorage({ now, id })` plus a
default `storage` singleton wired to the real clock). The `QuotaExceededError →
StorageFullError` mapping on both `onerror` and `onabort` is kept verbatim. Database
`novelka`, version 1, stores `projects` and `meta`; a record is
`{ id, schemaVersion, document, updatedAt }` (thumbnails arrive in Unit 05). Autosave
slot = `meta` store key `__autosave__`. `duplicate` re-mints every id (document, pages,
cover, elements) from the injected id source, and the record is keyed by the new
*document* id. `recoveryCandidate(autosave, projects)` is the pure fact for the later
recovery prompt. `downloadJSON` / `serializeProjectFile` / `readProjectFile` round-trip a
Document through the exported `.novelka.json` envelope.

**`src/state/autosave.ts`** — `createAutosave({ store, storage, delayMs, now })`, the
debounce timer's only home (the doc store is still timer-free). Subscribes to the doc
store; a change debounces **1500 ms** by default (configurable via `delayMs`), then saves
the *latest* Document. Coalescing: a save in flight never queues a second — the follow-up
picks up the latest Document, so writes to the same slot never overlap. Any failure
(including `StorageFullError`) sets `status: 'error'` and stops: no retry loop, no silent
success. Exposes `getStatus()` (`idle | pending | saving | saved | error`) and
`getLastSavedAt()`. Writes to the autosave slot, never over a named project. `stop()`
unsubscribes and flushes any save still due, so closing does not lose the last 1.5 s.

**`src/state/store.ts` + `doc-store.ts` `load`** — settles open question 4. `createDocStore`
stays a factory; `store.ts` exports **one module-level `store`** (no provider, no context —
the app edits one book at a time). `store.getState().load(doc)` runs `migrate` then
`assertValidDocument`, throws before touching the store if either fails (exactly like
`dispatch`), then replaces the Document and **clears `past` and `future`**. It is a
method, deliberately not a Command: `apply` stays pure and its union stays closed, and
undoing past the moment a book was opened is meaningless. The placeholder initial
document is an empty book (0 pages, 6×9, white, paperback), replaced by `load` before
anything is edited.

**Tests** — `migrate.test.mjs`, `storage.test.mjs`, `autosave.test.mjs`, run by plain Node
over an esbuild bundle and chained into `npm run test`. **fake-indexeddb** is the dev
dependency (chosen over a hand-written IDB double because the quota/read-failure tests
need real `onerror`/`onabort` dispatch to prove the `StorageFullError` mapping). Autosave
uses a hand-written in-memory storage double, which the spec explicitly permits.

- `migrate`: the chain holds exactly one no-op v1→v2 step; v1 → v2; v2 unchanged;
  version 99 refused naming 99; missing version refused; a doc that migrates but fails
  `assertValidDocument` throws and stores nothing; `store.load` clears history and undo
  becomes a no-op.
- `storage`: the headline save→read round-trip of a Document with one element of every
  kind; list shows name + page count; remove deletes and rename preserves every element;
  duplicate produces new ids and mutating the copy never touches the original; a
  QuotaExceededError (simulated by a failing `put` request) surfaces as
  `StorageFullError`; a read failure rejects rather than returning `[]`; the autosave
  slot writes/reads/clears; `recoveryCandidate` returns only when newer than every
  project; `serializeProjectFile` → `readProjectFile` round-trips identically and rejects
  non-JSON / non-document files.
- `autosave`: three rapid changes produce one write carrying the latest Document; `stop()`
  flushes; a save in flight never overlaps a second (max one active write); a
  `StorageFullError` sets `status: 'error'` with exactly one attempt and no retry loop.

**Verification, all run and all green:** `npm run check` (lint 0 errors 0 warnings ·
`tsc -b` clean · 10/10 suites · build passes) · `grep -rn "minipdf" src/` empty ·
`grep -rn "catch {}\|catch { }\|catch { return \[\]" src/state/` empty (no swallowed
errors) · `grep -rn "setTimeout\|setInterval" src/state/doc-store.ts` empty (the store is
still timer-free) · `grep -rn "Date.now()" src/model src/print` empty · no `any`, no
`@ts-ignore`, no non-null `!` (the only `@ts-expect-error` lines are Unit 02's four
type-test assertions).

**Invariants checked explicitly** (`architecture.md` §10). Applicable and held: 1 (the
Document is still plain serialisable data; the storage record adds no renderer state), 2
(`load` is the one deliberate non-Command writer, added by spec 04 §4; data still flows
Document → storage), 3 (`migrate` is pure and non-mutating, proved in tests), 14 (zero
`any`, zero `!`), 15 (`state/` imports only `model/`, `zustand` and `nanoid`), 16 (no
backend; IndexedDB is on the user's machine, per §8). Not yet applicable, nothing here
contradicts them: 4–13, 17.

Judgement calls recorded rather than left silent:

- **`stop()` returns a Promise**, not the spec sketch's `void` — a flush is an IndexedDB
  write, so "stop flushes" is inherently async and the test awaits it.
- **`downloadJSON`'s DOM click is not exercisable in Node.** The test round-trips through
  `serializeProjectFile`, the exact payload `downloadJSON` writes, so the file format is
  what is pinned. Noted here rather than hidden.
- **`autosave` is not wired at startup.** No UI exists to call `createAutosave` yet; the
  spec gives the factory and the wiring lands with the app bootstrap in Unit 05+.
- **`save` does not itself clear the autosave slot.** The spec puts `clearAutosave()`
  after an explicit save or an accepted recovery — a caller decision, not a side effect of
  `save`.
- **The initial singleton document is a 0-page blank book.** The store must exist before
  any UI; `load` replaces it before editing, and the New Book flow (Unit 10) will too.
- **The stored record has no `thumbnail` yet.** Architecture §8 lists one, but thumbnails
  need the renderer (Unit 05) — it is added there, not now.

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

- Nothing. Unit 06 is finished and verified; Unit 07 has not started.

---

## Next Up

**Unit 07 — Right dock: Pages** *(ported design, D17)*. The Pages tab reproduced exactly:
thumbnails, subtle insert gutters, warning dot, selected state, drag-reorder with
drop-line, duplicate, delete. IntersectionObserver + rAF-throttled live thumbnails.
Reads the Document, dispatches Commands. Done when it is indistinguishable from the
original, except it cannot desync.

The full ordered plan is `context/specs/00-build-plan.md` — 23 units in five phases.
Checkpoints: Unit 05 proved the architecture, Unit 11 is the first shippable book.

---

## Open Questions

1. ~~**Unit 04 has no spec file yet.**~~ **Resolved.** `context/specs/04-storage-and-migrations.md`
   was written and Unit 04 built against it.
2. **`PuzzleData` / `PuzzleStyle` are `Record<string, never>` until Unit 12.** The parser
   therefore *rejects* any puzzle carrying real data, with a message pointing at Unit 12.
   This is correct for now, but it means no document written between here and Unit 12 can
   contain a real puzzle. Flagging it so it is a known constraint and not a surprise.
   (Consequence now visible in Unit 04: the storage round-trip test uses puzzles with
   empty `data`/`style`, because that is all the model can represent until Unit 12.)
3. **Duplicated element ids are derived, not generated** (Unit 02). `page/duplicate`
   carries `newId` for the page; its elements get `` `${newId}-${oldId}` `` because ids must
   be unique document-wide and `apply` may not call `nanoid`. Deterministic and pure, but
   it is a shape the spec did not state. If the owner wants generated ids there instead,
   the command grows an `elementIds` field. Low cost either way.
4. ~~**Nothing reads the store yet.**~~ **Resolved by Unit 04.** `state/store.ts` exports
   one module-level `store` (no provider, no context) and `doc-store` gained
   `load(doc)`, which migrates, validates, replaces the Document and clears history.
5. **`safeAreaFor` validates the page count before computing** (Unit 03 judgement call,
   recorded in the Unit 03 section). The spec's port changes were inches-only and
   TrimId/PaperStock; validation was added so the paper parameter means something and an
   illegal book is refused loudly. Remove the single `assertPageCountFor` call in
   `safeAreaFor` if the owner prefers the legacy silently-clamping behaviour.
6. **The cover reference table is derived, not scraped from Amazon** (as the spec's
   provenance note states). It is our locked contract; if the owner ever downloads a real
   KDP cover template and a value disagrees, the table is corrected and the test follows
   the table. Nothing to do now — flagged so the provenance is never mistaken for gospel.
7. ~~**Autosave is a factory with no caller yet.**~~ **Resolved by Unit 05.**
   Wired in `src/ui/app/AppShell.tsx` at startup, flushes on unload via `stop()`.
8. ~~**The stored record has no `thumbnail`.**~~ **Resolved by Unit 05.**
   `renderThumbnail` implemented in `src/render/thumbnail.ts` and `StoredProject` /
   `storage.save` support `thumbnail`.

9. **Where `bleedOn` lives long-term** (Unit 06). Spec 06 puts the bleed toggle in
   `ui-store`, and it is there. But D9 says turning bleed on "changes page geometry,
   guides, and export together" — export (Unit 11) is derived from the Document alone
   (architecture §2 rule 4: "the Document alone is enough to render, preflight, and
   export"). If bleed must affect export, it is a fact about the book, not about the
   view, and belongs in `BookSettings` with a `book/setBleed` command and a schema
   migration. Nothing breaks today; flagging it so Unit 11 resolves it deliberately
   instead of discovering it.
10. **The spec's D15 grep is loose** (Unit 06). `grep -rni "inter\b" src/` matches the
   trailing "inter" in "pointer" and "printer" (for example `pointer-events`, which the
   guide overlays require). The intent — no Inter/Geist/Space Grotesk font — is
   verified and holds; the literal command cannot pass while `pointer-events` exists.
11. **Spine and barcode guide toggles have no rail buttons yet** (Unit 06). Both kinds
   exist in `visibleGuides` and render on the cover surface, but the editor shows only
   interior pages until Unit 10 builds the cover surface, and a toggle over a guide
   that cannot currently render would be a dead control. Their toggles ship with the
   cover surface in Unit 10.

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
