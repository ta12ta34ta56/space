# Sudoku module — progress notes

## Done: the generator (`generator.ts`)

Pure TypeScript, no DOM, so it runs in Node and in a web worker.
Run the test suite with:

```bash
npm run test:sudoku
```

### Guarantees

Every generated puzzle is **proven to have exactly one solution** — the tests
verify this independently, by running a fresh solution counter over the finished
puzzle rather than trusting the generator's own bookkeeping.

Also verified: valid complete solutions, clues always agreeing with the
solution, removal counts inside the spec'd difficulty bands, no duplicate
puzzles within one book, 180° rotational symmetry, and seeded determinism
(same seed → same book).

### Measured performance

| Grid | easy | medium | hard | expert |
|---|---|---|---|---|
| 4×4 | <1 ms | <1 ms | <1 ms | ~3 ms |
| 9×9 | ~4 ms | ~2 ms | ~4 ms | ~6 ms |
| 16×16 | ~4 ms | ~3 ms | ~2.1 s | ~4.0 s |

### How 16×16 was made viable

First working version took **~20 s per hard 16×16 puzzle** — unusable. Three
changes, in order of impact:

1. **Constraint propagation.** Repeatedly fill cells with exactly one candidate
   before branching. Collapses the search tree; this was the big one.
2. **Incremental masks.** `removable()` used to rebuild all row/col/box masks
   from scratch and try every alternative digit with its own full solve (up to
   15 solves per cell). Now it blanks once, counts solutions with an early exit
   at 2, and borrows caller-owned masks.
3. **Time budget** (`budgetMs`, default 4 s for 16×16). Digging 160+ of 256
   cells while proving uniqueness can genuinely take minutes, so we stop when
   the budget runs out and return what we have.

**Degradation is graceful and honest.** A budget-limited puzzle is still 100%
valid with a unique solution — just slightly easier than requested. Each puzzle
reports `hitTarget` and `targetRemoved`, so the UI can say "expert puzzles were
generated at ~145 removals instead of ~170" rather than silently lying.

16×16 hard/expert should run in a **web worker** with a progress bar.

## Done: worker, renderer, layout, panel

- **`worker.ts`** — generation runs off the main thread with per-puzzle progress
  and a cancel button, so 16x16 never freezes the UI.
- **`renderer.ts`** — puzzle to plain fabric objects: thin cell rules, thick box
  borders, clues as Textboxes in the user's font. Every object is tagged
  (`moduleId`, `sudokuRole`, `sudokuPuzzle`) so a later pass can find and
  restyle them.
- **`build-pages.ts`** — flows puzzles onto pages inside the KDP safe area,
  packs the solutions section, and stamps page metadata for "apply to all".
- **`SudokuPanel.tsx`** — size, difficulty, count, puzzles-per-page,
  solutions placement, and full styling (font, colours, border weight, number
  size, labels, A-G for 16x16).

Puzzles-per-page and solutions-per-page choices are **computed from the trim
size**, so 4 puzzles per page is offered on 8.5x11 but not on 5x8. Font follows
the document font by default (CRITICAL RULE #3).

### Verified end-to-end

A 10-puzzle 9x9 book on 6x9 produced 13 pages (10 puzzle + 2 solutions at 6 per
page) and exported to PDF at exactly 6.000" x 9.000" with **329 selectable
digits** on the solutions page — real searchable text, not raster.

## Done: mixed difficulty + live editing (`restyle.ts`)

- **Multi-difficulty selection.** Levels are checkboxes, not a single choice, so
  a book can be Easy-only, Easy+Medium, or any mix. Puzzles round-robin through
  the chosen levels so a mixed book is evenly spread.
- **Solutions are optional** — Back of book / After each / No solutions.
- **Live adjust panel**, shown only when the open page is a generated Sudoku
  page. Puzzle size, number colour, grid colour, border weight and number size
  all update the canvas **in real time**; the size slider is capped so the grid
  can never grow outside the KDP safe area.
- **Apply to all Sudoku pages** — replays the current page's geometry and style
  onto every sibling page while each keeps its own puzzle. Only pages of the
  same kind and density are touched, so puzzle pages don't overwrite solution
  pages.
- **Delete key removes a page** when a thumbnail is hovered/focused and nothing
  is selected on the canvas.

### Bugs found and fixed along the way

**Resize tore the grid apart.** A fabric `Line` keeps `x1/y1/x2/y2` in local
space and derives `left/top` from them, so setting both applied the transform
twice — numbers scaled about one origin and rules about another. The transform
now maps line endpoints through absolute page coordinates and lets fabric
recompute the origin.


`syncActivePage` rebuilt page data from `engine.toJSON()`, which silently
dropped the module's page-level metadata (`novelka:sudoku-page`, formerly `minipdf:`) the first time
you navigated away. The live panel then never appeared. The store now carries
over any namespaced custom keys Fabric doesn't know about.

## Rewrite: deterministic layout (`layout.ts`)

The first live-adjust attempt was measure-then-nudge: read the canvas, apply a
delta, write it back. It was genuinely broken.

1. **Drift.** Each resize measured its own previous output, so rounding
   compounded and puzzles crept out of position.
2. **No re-centring.** Shrinking scaled each puzzle about its own top-left, so
   the block drifted to the corner and left a pool of blank space.
3. **"Apply to all" did nothing.** It read the source page from the *store*, but
   a live drag only mutates the *canvas* — so it copied the stale pre-edit
   layout onto every page. Silent no-op.

`layout.ts` replaces it with a pure function:

    (page, spec) -> exact slot for every puzzle

Nothing is derived from the previous render, so dragging the slider a hundred
times lands in exactly the same place. Verified: 40% -> 90% -> 40% returns
151pt -> 151pt, and a sibling page went 380pt -> 153pt after "apply to all".

The panel now exposes size (capped live by the KDP safe area), a vertical
offset, colours, border weight, number size, a safe-area toggle, an explicit
**Apply to all** button and **Reset**.

## The actual root cause: stripped tags

Even after the deterministic rewrite the panel was still "only numbers work".
Instrumenting the canvas showed why:

    BEFORE resize -> { 'sudoku-rule-major': 8, 'sudoku-rule': 12, 'sudoku-clue': 41 }
    AFTER  resize -> { line: 20, textbox: 42 }        // every tag gone

`CanvasEngine.EXTRA_PROPS` — the allow-list fabric uses when serializing —
never contained `sudokuRole` or `sudokuPuzzle`. Every page save silently dropped
them, so after one edit the module could no longer tell a grid rule from a clue.
Text still moved (it is repositioned by cell arithmetic) which is exactly why
**numbers appeared to work while the grid did not**.

Two further fixes landed with it:

- **Line coordinates.** Fabric stores `x1/y1/x2/y2` relative to the object's own
  centre (a 380pt rule reads `x1:-189 … x2:189`), never in page space. The old
  code mixed the two. Rules are now rebuilt from `slot.size` and snapped to
  their exact grid index, so they can never drift off the numbers.
- **Reset** rebuilds from `DEFAULT_SPEC` at the natural maximum size instead of
  only resetting the size slider. Verified to return to the generated
  position (25.9, 146.9).

`offsetX` was added alongside `offsetY`, both clamped so the block can never
leave the safe area.

### Verified

    generated  : ALIGNED   grid 380.2 square, clue padding 0.6 / 0.6
    size 35%   : ALIGNED   184.3 square
    size 85%   : ALIGNED   344.3 square
    size 50%   : ALIGNED   232.3 square
    nudge X    : ALIGNED
    nudge Y    : ALIGNED
    after reset: ALIGNED   back to 25.9, 146.9

## Done: page templates (`templates.ts`)

A template is a **frame**, not a picture: title, decoration, instruction line,
footer — plus the exact rectangles where grids belong. `build-pages.ts` asks the
template for its slots and draws each puzzle to fill one precisely, so the
puzzle always lands inside the design whatever the trim size, grid size or
puzzles-per-page.

| Template | For | Per page |
|---|---|---|
| Classic book | 9×9, 16×16 | 1, 2 |
| Two per page | 9×9 | 2 |
| Kids — big & friendly | 4×4, 9×9 | 1, 2 |
| Kids — playtime | 4×4, 9×9 | 2, 4 |
| Advanced 16×16 | 16×16 | 1 |
| With notes | 9×9 | 1 |
| Solutions grid | all | 2, 4, 6, 9 |

The picker only offers designs that fit the current grid size *and*
puzzles-per-page, and auto-switches if the current pick becomes invalid. Book
title and page-number toggle are exposed alongside it.

### Verified

    kids 4x4        tpl="Kids — big & friendly"  OK  grid 380.2 square
    classic 9x9     tpl="Classic book"           OK  grid 380.2 square
    two-up 9x9      tpl="Two per page"           OK  two grids + divider
    advanced 16x16  tpl="Classic book"           OK  A–G labels, thick 4×4 boxes

## Next steps

1. **Same-page-bottom solutions** placement.
2. Word Search and Crossword modules.

---

## Journal / low-content page designs (added)

Six designs modelled on the owner's reference art, in `journal-templates.ts`
(kept separate so `templates.ts` stays readable; the registry imports them):

| id | name | access | notes |
|---|---|---|---|
| `journal-worksheet` | Worksheet — framed | free | Page border, date box, star difficulty, start/end timer, **A–I / 1–9 grid references**, dotted notes, closing quote |
| `journal-botanical` | Daily — botanical | free | Cream page, botanical sprigs, date + day-of-week, boxed difficulty card, start/end/total timer |
| `journal-band` | Header band | free | Tinted header strip with date & time, EASY/MED/HARD star scale, big grid |
| `journal-typewriter` | Typewriter | free | Bare cream page, DATE/DIFF/NO, timer lines. Largest grid of the six |
| `journal-elegant` | Daily — elegant | ad_unlock | Leaf-flanked title, pencil date field, stars + tick boxes, ornament rule, folio |
| `journal-card` | Numbered card | premium_only | Reference numbers on **all four sides**, 3-line time log, QUOTE panel |

### New shared furniture — `furniture.ts`

`starRow` (filled/outline rating), `writeLine` (solid/dotted/dashed rules),
`fieldLine`, `clockIcon`, `calendarIcon`, `pencilIcon`, `checkbox`, `sprig`
(curved stem with teardrop leaves placed along the tangent), `sparkle`,
`ornamentRule`, and `coordLabels` / `parseCoordRole`.

Difficulty is read from the puzzle subtitle, so the star rating and the
Easy/Medium/Hard marks reflect the puzzle actually on the page.

### Grid reference labels are live

`coordLabels` tags each label `sudoku-coord:<side>:<index>`. `layout.ts` parses
that role and re-places the labels onto their rail whenever the grid is
resized, so they track the puzzle instead of being frozen chrome.
`build-pages.ts` stamps the puzzle id onto them after the template builds.

`soloSlot` takes a `rail` option reserving space outside the grid for those
labels, so a rail never eats into the header or footer.

### Bugs found and fixed by testing

1. **Coord labels were untagged.** `coordLabels` only tagged when a `puzzleId`
   was supplied, and templates don't have one at build time — so the labels
   were invisible to relayout. Now always tagged; id stamped later.
2. **Stars collided with "Easy / Medium / Hard"** on Worksheet, and the 1–9
   rail overlapped the timer row. Fixed by measuring the star block width and
   by reserving a proper label rail.
3. **Numbered card's QUOTE rule struck through "TOTAL TIME"** — the quote was
   pinned to the page bottom instead of flowing below the time log.
4. **Small stars read as one grey smudge** — a fixed 1.4pt outline is ~20% of a
   7pt star. Stroke now scales with star size.
5. **Botanical sprigs were flat loops** and one overlapped the difficulty card.
   Rewritten as a curved stem with leaves placed along the tangent, repositioned
   into the margins.

### Verification

`/tmp/t/sud-tpl.mjs` — **ALL PASSED** for all six. Per design it checks the grid
is square, everything is inside the page, clues sit on the lattice, coord labels
sit outside the grid, **no two printed text runs overlap**, **no decoration sits
on text**, and the grid is unobstructed by chrome; then resizes to 60% and
re-checks all of it.

The overlap detector measures *inked* glyph width (`calcTextWidth`), not the
Textbox column width — comparing declared boxes reports overlaps that do not
exist on paper.

`/tmp/t/render.mjs <id...>` exports any design straight off the fabric canvas at
2× for visual review.

### Environment note

The 2GB sandbox will OOM and crash the browser if vite/chrome processes are left
running between test rounds — 28 orphaned servers once made the app look broken
when nothing was wrong. Clean up first:
`pkill -f "[v]ite.*preview"; pkill -f "[h]eadless_shell"`
(bracket the first char so pkill doesn't match its own command line).
Tests also `localStorage.clear()` on boot, since a persisted 100+ page project
reloads on every run.

---

## Template-aware layout (2026-07-27)

`layout.ts` used to re-centre puzzles with its own generic algorithm
(`columnsFor` + block-centring), completely ignoring the rectangles the chosen
template had declared. Consequences:

- the size slider's cap came from a generic formula, so on a decorated page the
  top of the slider did nothing (the same bug that was fixed in word search)
- resizing moved the grid out from under the design's frame/labels
- `slot.top` was ambiguous: the generic code treated it as the top of the
  *caption*, the templates as the top of the *grid*

Now ported from `word-search/layout.ts`:

- `templateSlots()` calls `tpl.build()` and returns the design's own slots
- `maxBoxSize(..., templateId?, gridSize?)` uses the template slot as the cap
- `slotsFor(..., templateId?, gridSize?)` scales *inside* the template slot,
  keeping the slot's centre in both axes
- `Slot` gained `captionTop`; `slot.top` now unambiguously means the top of the
  grid, matching `PuzzleSlot` in `templates.ts`
- `relayoutCanvas()` and `applySpecToPages()` pass the page's stored
  `meta.templateId` through; `SudokuPanel` passes `meta?.templateId`

### Verified (`/tmp/t/sudoku-tpl.mjs`, 6×9, "Worksheet — framed", 9×9)

| check | result |
|---|---|
| slider cap == template slot | cap 337 vs built 340.1 (Δ3.1, rounding) |
| at max, grid returns to slot position | dx 0.0, dy 0.0 |
| at max, size matches slot | 340.14 == 340.14 |
| shrink honours requested size | 205.3 for 202 asked |
| shrunk grid stays centred in slot | dx 0.6, dy 0.6 |
| repeated apply does not drift | (0.00, 0.00, 0.00) |
| decoration survives | 108 objects, 83 puzzle, 25 chrome |

Before the fix the cap was the generic formula, not the slot, and the grid
walked out of the frame on every resize.
