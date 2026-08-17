# Build Plan — Novelka

> The whole build, broken into units in dependency order. Each unit is small enough to
> finish and verify in one session, produces something visible or provable, and ends with
> `npm run check` green.
>
> **Status: READY.** All decisions locked (D1–D24), all feature rows reviewed.
> Written 17 August 2026.

---

## How to read this

Each unit lists what it builds, what must already exist, and how you know it is done.
**Ported** means copied from `legacy/` with its tests, not rewritten.

The order obeys four rules: dependencies first, pure logic before UI, data model before
renderer, and nothing built before the thing that proves it works.

---

## Phase A — Foundations (nothing visible yet, everything depends on it)

### Unit 01 — Project skeleton and the Document model
Vite + React + TS baseline. `model/`: `Document`, `Page`, `Element`, `Frame`,
`BookSettings`, and `units.ts` (the only place inches↔pt↔px conversion exists).
No UI, no canvas.
**Done when:** types compile, `units.ts` has round-trip tests, `npm run check` green.

### Unit 02 — Commands and the document store
`apply(doc, cmd)` — pure, no I/O. The command union for pages and elements. Undo/redo as
a stack. `state/doc-store.ts` as the only writer.
**Done when:** every command has a test asserting the resulting Document; undo/redo
round-trips exactly; `apply` is provably pure.

### Unit 03 — KDP print truth *(ported + rebuilt)*
`print/trims.ts` (six trims, one paper vocabulary), `print/margins.ts` (**ported**, gutter
bands, recto/verso safe area), `print/cover.ts` (**rebuilt** against a reference table —
D8).
**Done when:** the cover reference table passes; spine, cover size and safe area are
correct for all six trims at every gutter band.

### Unit 04 — Storage and migrations
IndexedDB save/load, debounced autosave, `schemaVersion` migrations, `StorageFullError`
with "download my work".
**Done when:** a document survives save → reload → identical; a v1 document opens under a
v2 schema.

---

## Phase B — Making it visible

### Unit 05 — Canvas renderer
`render/canvas/` — the only place Fabric is imported. Document → pixels, one way. DPR-aware,
2× supersampled, capped at 4096px (**ported** rendering math).
**Done when:** destroying and recreating the canvas every frame changes nothing but speed.
This is the unit that proves the architecture.

### Unit 06 — Editor shell and guides
App shell, top bar, left rail, bottom bar (zoom, fit, **"9 of 10"** page indicator with
jump). Guide overlays as DOM above the canvas: bleed, trim, safe area, gutter, spine,
barcode. Dark UI, **grey paper surround** (D23).
**Done when:** guides are correct at all six trims recto and verso, never in export.

### Unit 07 — Right dock: Pages *(ported design — D17)*
The Pages tab reproduced exactly: thumbnails, subtle insert gutters, warning dot,
selected state, drag-reorder with drop-line, duplicate, delete. IntersectionObserver +
rAF-throttled live thumbnails. Reads the Document, dispatches commands.
**Done when:** indistinguishable from the original, except it cannot desync.

### Unit 08 — Right dock: Layers + element kinds
Layer tree with grouping, lock, hide, reorder. **Every element kind gets its own row, icon,
and label** (D18) — divider, border, pattern, sticker, icon, text, shape, puzzle.
**Done when:** a divider is visibly a divider in the panel, not a generic "sticker".

### Unit 09 — Selection, inspector, contextual toolbar
Select, move, resize — **constrained to the safe area** with snapping (D16). Per-kind
inspector controls. Contextual toolbar (**ported**): font, size, bold/italic/underline,
colours, stroke, align/distribute, duplicate, delete.
**Done when:** an element cannot be moved or resized outside the safe area; snapping works
and is tested as a pure function.

---

## Phase C — Making books

### Unit 10 — New Book flow and the cover surface
Home screen with one large "Create a book". The dialog: name, trim, paper, binding, page
count, cover on/off. The cover as an isolated surface with correct spine and phantom
guides.
**Done when:** a new book opens with a real cover whose spine matches the reference table.

### Unit 11 — Export
PDF only. Interior and cover **auto-download as two files** (D21). Real embedded fonts,
selectable text. Preflight report with plain-language fixes.
**Done when:** an exported PDF opens correctly and preflight catches every seeded defect.

*At the end of Unit 11 the app can make and export a real, valid, empty book. That is the
first genuinely shippable moment.*

---

## Phase D — Content

### Unit 12 — Generator framework + Word Search *(algorithm ported)*
One **schema-driven** panel (D5). Live style preview before generating (D4). A puzzle is
**one semantic object** (D3). Generation **fills existing pages** and only adds pages when
needed (D19). Layout returns a result, never overflows (D14).
**Done when:** word search generates into existing pages, restyles in one action, and
passes a layout audit at all six trims.

### Unit 13 — Sudoku *(ported)*
### Unit 14 — Maze *(ported)*
### Unit 15 — Crossword *(ported)* — includes the clue-overflow fix (D14)
### Unit 16 — Handwriting *(ported)*
Each: algorithm and banks copied, layout rebuilt, schema written, panel comes free.
**Done when:** each passes the same layout audit. **Zero UI files change** — that is the
test of the framework (architecture §7).

### Unit 17 — Templates *(ported — D13)*
Port all 20 with their 95,677-check safe-area audit, re-verified at six trims. Signature
becomes `(safeArea, params) => Element[]` so drawing outside the safe area is impossible.
True-to-print previews, a preview action, variants, thinner panel chrome (D22).

### Unit 18 — History panel
Read-only view of the undo stack with jump-to-state.

---

## Phase E — Finishing

### Unit 19 — Fonts
Five families with all four real faces (D24.3). Missing styles disabled, never synthesised
(D20). Build check fails on a missing advertised face.

### Unit 20 — Book preview
A true book preview modelled on KDP's: real spread, page turns, genuine full-screen (D21).

### Unit 21 — Quick create
"Create a puzzle" and "Create letters" producing a complete, exportable interior from
defaults (D24.5).

### Unit 22 — Polish and hardening
Custom 404, page titles, robots.txt, alt text, skeleton loaders, privacy policy and terms,
error boundary with "download my work", input validation everywhere (D15). Full audit: no
dead controls, no console errors.

### Unit 23 — Delete `legacy/`
One commit, after every port is verified (D24.7).

---

## Dependency map

```
01 model ──► 02 commands ──► 04 storage
   │              │
   ▼              ▼
03 print ──► 05 renderer ──► 06 shell ──► 07 pages ──► 08 layers ──► 09 selection
                                                                          │
                                          10 new book + cover ◄───────────┘
                                                  │
                                          11 export  ◄── first shippable
                                                  │
                                          12 generator framework
                                            ├── 13 sudoku
                                            ├── 14 maze
                                            ├── 15 crossword
                                            └── 16 handwriting
                                                  │
                                          17 templates ──► 18 history
                                                  │
                              19 fonts ─► 20 preview ─► 21 quick ─► 22 polish ─► 23 delete legacy
```

---

## What "done" means for every unit

1. Works end to end within its scope
2. No invariant in `architecture.md` violated
3. `npm run lint` — 0 errors, 0 warnings
4. `npx tsc -b` — clean, no `any`
5. `npm run test` — all suites green, including ported ones
6. `npm run build` — passes
7. No console errors
8. No dead controls
9. `progress-tracker.md` updated

**If any check fails, the unit is not done.**

---

## Checkpoints

- **After Unit 05** — the architecture is proven or it is not. Cheapest possible moment to
  find out.
- **After Unit 11** — a real, valid, exportable book exists. Shippable in principle.
- **After Unit 12** — the generator framework is proven; units 13–16 should be fast.
- **After Unit 17** — feature-complete against v1 scope.
