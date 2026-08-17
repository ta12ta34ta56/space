# Crossword module — progress & findings

Same contract as `sudoku-maker` and `word-search`: pure generator → worker →
renderer → templates → deterministic template-aware layout → panel. Every
emitted object is a plain fabric object (CRITICAL RULE #4).

## Files

| File | Role |
|---|---|
| `generator.ts` | Freeform placement engine + numbering. Pure TS, no DOM. |
| `generator.test.mjs` | `npm run test:crossword` — 42 checks. |
| `clue-banks.ts` | 10 themed banks, **260 ready-written clue pairs**. |
| `worker.ts` | Off-thread batch generation, multi-difficulty + multi-theme. |
| `renderer.ts` | Puzzle → tagged fabric objects (cells, numbers, clue lists). |
| `templates.ts` | 7 page designs; each declares grid slot + clue slot. |
| `layout.ts` | Deterministic `(page, spec) → slots`, **template-aware**. |
| `build-pages.ts` | Page flow: puzzle pages + answer section. |
| `CrosswordPanel.tsx` | Config + live-adjust UI. |

## Why freeform, not dense American-style

A dense grid (every white cell in both an across and a down answer, 180°
symmetric blocks) needs a large curated dictionary and heavy backtracking, and
it takes clue-writing away from the author. KDP crossword and activity books are
overwhelmingly **freeform**: the author supplies word+clue pairs on a theme and
the generator interlocks as many as it can, reporting honestly any it could not
place. That is what this builds.

## Guarantees (all asserted in the test suite)

- every placed word reads correctly in the finished grid
- crossing cells always agree on their letter
- words never run flush alongside each other (no unintended letter pairs)
- words never touch end-to-end — always a gap or the edge
- **every maximal run of 2+ letters is a declared answer** (no stray words)
- numbering follows convention: reading order, 1..n with no gaps, one shared
  number where an across and a down start in the same cell
- no isolated letters; the whole puzzle is one connected shape

## Verified

Generator — `npm run test:crossword`: **ALL TESTS PASSED (42 checks)**
```
expert, 25 words: 1.0ms average, 25.0 words placed
```
Covers clue parsing (4 separator styles), structural validity across 100
puzzles, crossing agreement, stray-run detection over 40 dense grids, numbering
convention, clue↔answer attachment, tight cropping, auto-grow, honest reporting
of impossible input, determinism, and 30 distinct puzzles per book.

Canvas geometry (`/tmp/t/cw.mjs`) — **ALL CHECKS PASSED**: cells on a true
lattice with no duplicates, all square, clue numbers inside their own cell,
clue block clear of the grid, no clue overlaps, nothing off the page. Checked
as generated, through every live control, and after reset. Tags survive a
save/reload round trip. Answer pages carry real filled letters.

Live panel (`/tmp/t/cw-live.mjs`) — every control verified to actually change
the canvas and keep the page in bounds, including all three colour pickers.

## Bugs found and fixed during verification

1. **Cell pitch was taken from the bounding box**, which includes the stroke —
   a 24pt cell with a 0.8pt rule measures 24.8. Columns mis-rounded and cells
   landed on the same lattice position. Pitch is now the smallest positive gap
   between distinct cell edges, and cells are written inset by half a stroke.
2. **Grid drifted up to 96pt off-centre when resized.** A freeform shape is
   narrower than the square slot it is laid out in, so centring the slot did
   not centre the art. Both renderer and layout now centre the *inked* extent.
3. **Clue heights were estimated from character counts**, which under-reports
   wrapped lines — clues printed on top of each other in the beside layout.
   Now measured by asking fabric for the real wrapped height.
4. **Last ACROSS clue stranded above the DOWN heading.** With two columns the
   lists now split ACROSS-left / DOWN-right, the conventional print layout;
   otherwise a heading is never left at the foot of a column.
5. **One-column clues ran off the page.** The reflow now steps the type size
   down until the tallest column fits.
6. **Empty outer frame** boxed in large areas of white space on freeform grids.
   Frame now defaults off (`frameWidth: 0`).
7. **Duplicate grids inside a book** — the seed word was always the single
   longest, so different seeds converged. Now picks randomly among the longest
   and jitters the seed row.
8. **"Clues beside" wasted the bottom half** of a portrait page. The grid now
   takes all available height; the block is centred vertically, and the
   description says the design suits wide trims.

## Serialization

`cwRole` and `cwPuzzle` added to `CanvasEngine.EXTRA_PROPS`. Without them every
tag is dropped on the first page save — the bug that broke Sudoku's live-adjust.
Verified by round-trip test.

## Not done yet

- **Template chrome is not re-laid on resize** (same open item as the other two
  modules): chrome objects are untagged so the layout engine ignores them.
- Dense American-style grids with symmetric blocks.
- Cryptic clue helpers.
- Same-page-bottom answers (only `back_of_book`, `next_page`, `none`).

## Environment note

The 2GB sandbox OOMs and crashes the browser if vite/chrome are left running
between rounds. Always clean up first:
`pkill -f "[v]ite.*preview"; pkill -f "[h]eadless_shell"`
(bracket the first character so pkill does not match its own command line).
Tests `localStorage.clear()` on boot, since a persisted 100+ page project
reloads every run. Sudoku's puzzle count is a **number input**, not a slider.

---

## Update — answers UI, hint styles, cleanup

### "Answers didn't work"

Generation was in fact correct at every setting. The real problem was the
**control**: the Answers placement used a `<select>` dropdown while Sudoku uses
three obvious buttons, so in the dark panel it didn't read as clickable. It is
now an `opt-grid` of buttons — **Back of book / After each / No answers** —
matching Sudoku exactly. Verified all three produce the right pages:

```
"Back of book": 2 puzzle pages, 1 answer page
"After each"  : 2 puzzle pages, 2 answer pages
"No answers"  : 2 puzzle pages, 0 answer pages
```

Answer grids per page (1 / 2 / 4 / 6) also verified to change the output, and
answer pages carry a filled letter in **every** cell.

### Clues vs words — now the author's choice

New `hintStyle` on `CrosswordStyle`, exposed as **What the solver gets**:

| Mode | What prints | Grid numbers |
|---|---|---|
| `clues` | Classic numbered ACROSS / DOWN clues | yes |
| `words` | **Word-fit puzzle** — plain answer list, no clues | **no** |
| `both` | `3. Largest land mammal (8) — ELEPHANT` | yes |

`words` mode is a genuinely different puzzle type, so it behaves like one: a
single **WORDS** heading instead of an across/down split, answers sorted
shortest-first then alphabetically (the word-fit convention, since solvers place
unusual lengths first), and **clue numbers are suppressed** because there are no
numbered clues to refer to.

All three verified: correct headings, no overlaps, nothing off-page, grid
centred, and `words` mode confirmed to render 0 clue numbers.

### Cleanup — 322 lines removed, nothing broken

Deleted after confirming zero imports:
- `sudoku-maker/restyle.ts` — superseded by `layout.ts`
- `find-bad-postcss.ps1` — one-off Windows script, unreferenced
- 3x `generator.built.mjs` — esbuild output, regenerated by the test scripts
  (now gitignored)

Removed dead code:
- `suggestCwPerPage()` — never called; a crossword is always one per page
- `cluePosition` — set but never read; templates decide clue placement
- de-exported `renderWordBank` in both modules (internal only)

**New `src/modules/shared/puzzle-utils.ts`** holds what was duplicated three
times over: `makeRng`, `shuffle`, `chunk`, `cleanWord`, `objectsToPageData` and
`PUZZLE_EXTRA_PROPS`. The serialization allow-list especially — having three
copies meant a fix could land in one module and be silently missed in the
others, which is how the original tag-dropping bug spread.

Kept deliberately: `verifyCrossword` and `isConnected` look unused but are the
backbone of the generator test suite.

Verified after cleanup: tsc clean, lint 0 warnings, **42 + 30 + Sudoku generator
tests all pass**, and a full browser pass over all three modules including tag
persistence through a save/reload.
