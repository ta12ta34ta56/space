# Word Search module — progress & findings

Built to the same contract as `sudoku-maker`: pure generator → worker → renderer
→ templates → deterministic layout → panel. Every emitted object is a plain
fabric object (CRITICAL RULE #4).

## Files

| File | Role |
|---|---|
| `generator.ts` | Placement engine. Pure TS, no DOM. |
| `generator.test.mjs` | `npm run test:wordsearch` — 30 checks. |
| `word-banks.ts` | 16 themed lists, 26 words each. |
| `worker.ts` | Off-thread batch generation, multi-difficulty + multi-theme. |
| `renderer.ts` | Puzzle → tagged fabric objects (grid, word bank, answer marks). |
| `templates.ts` | 7 page designs; each declares the exact slots a puzzle fills. |
| `layout.ts` | Deterministic `(page, spec) → slots`, **template-aware**. |
| `build-pages.ts` | Page flow: puzzle pages + answer section. |
| `WordSearchPanel.tsx` | Config + live-adjust UI. |

## Design decisions

**Difficulty = direction set + density**, not solver effort. `WS_PROFILES` maps
each level to legal directions, a suggested grid size and a word count:

| Level | Directions | Grid | Words |
|---|---|---|---|
| Easy | E, S | 10 | 8 |
| Medium | + SE, NE | 13 | 12 |
| Hard | + W, N | 15 | 16 |
| Expert | all 8 | 18 | 22 |

Directions can be overridden independently of the level in the panel.

**Auto-grow rather than drop words.** If the board cannot hold everything the
generator enlarges it (every quarter of the attempt budget) instead of silently
losing a word. A 5×5 request containing `EXTRAORDINARILY` returns a 15×15 board.

**Overlap is preferred, not merely allowed.** Candidate placements are scored by
how many letters they share with words already placed, so grids come out dense
and professional-looking. A word lying entirely on existing letters is rejected —
that is a duplicate, not a placement.

**Filler letters follow English frequency**, so blanks do not read as obvious
noise next to the real words.

**Secret message**: leftover cells are filled in reading order with a message
before random filler kicks in.

## Verified (real browser measurements, not claims)

Generator — `npm run test:wordsearch`: **ALL TESTS PASSED (30 checks)**
```
18x18 expert, 22 words: 0.6ms average
25x25, 44 words:        1.9ms average
```
Covers: placement/grid agreement, direction rules honoured, no duplicate words,
auto-grow, secret message read-out, seeded determinism, 50 distinct puzzles per
book, punctuation/accent handling.

Canvas geometry (Playwright, `/tmp/t/ws.mjs`) — **ALL PASSED**
```
as generated    ALIGNED  13x13 grid 378pt   pitch 29.1/29.1  lattice 13x13  bank 4r x 3c
size 60%        ALIGNED  227pt  pitch 17.5/17.5
size 95%        ALIGNED  359pt  pitch 27.6/27.6
nudge X / Y     ALIGNED
letter 70%      ALIGNED
bank 14pt       ALIGNED
bank 2 columns  ALIGNED  bank reflowed to 6r x 2c
after reset     ALIGNED  back to 378pt
```
Also verified: `ws-*` tags survive a page save/reload round trip, and answer
pages carry real marks (4 puzzles, 676 letters, 48 marks).

Templates (`/tmp/t/ws2.mjs`) — **ALL PASSED**. For each design: every puzzle is
square, on-lattice, inside the page, word list below the grid, no overlap
between puzzles; then resized to 55% and re-checked for shrink, staying inside
the template frame, and keeping the same centre axis.
```
Classic book  1/page   378pt → 208pt
Themed        1/page   378pt → 208pt
Minimal       1/page   378pt → 208pt
Kids          1/page   378pt → 208pt
Two per page  2/page   178.8pt → 101pt (both grids)
```

Custom list + export (`/tmp/t/ws3.mjs`): printed list keeps spaces, accents and
punctuation (`ICE CREAM`, `ST. JOHN`, `CAFÉ`) while hiding the stripped form;
PDF export produced a valid 211KB `%PDF-`.

## Bugs found and fixed during verification

1. **Size slider dead above ~50% on templated multi-puzzle pages.**
   `wsMaxBoxSize` used a generic formula while the real ceiling was the
   template's slot, so dragging past the slot size changed nothing. The cap is
   now template-aware (`templateSlots()`).

2. **Two-up pages measured as one puzzle.** The panel read the canvas while it
   was still loading and saw a single group, which doubled the computed cap.
   The page's own metadata (`meta.puzzleIds.length`) is now the authority, and
   the poll waits until the canvas actually holds that many puzzles.

3. **Two-up never offered.** `suggestWsPerPage` was too strict; loosened so
   small grids get a 2-up option on a 6×9 trim.

## Serialization

`wsRole` and `wsPuzzle` were added to `CanvasEngine.EXTRA_PROPS`. Without them
every tag is silently dropped on the first page save — the exact bug that broke
Sudoku's live-adjust ("only numbers work"). Verified by round-trip test above.

## Template-awareness (better than Sudoku's current state)

`wsSlotsFor(..., templateId)` asks the template for its slots and scales the
grid *inside* them, rather than re-centring with an independent algorithm. This
is the fix direction that is still outstanding for `sudoku-maker/layout.ts`.

## Not done yet

- **Template chrome is not re-laid on resize.** Chrome objects are untagged, so
  `wsGroupsOf()` ignores them. The grid moves within the frame correctly, but
  the frame itself does not adapt. Same open item as Sudoku.
- Word-shape / "words may bend" variants (snake word search).
- Per-puzzle theme override in the UI (themes currently rotate automatically).
- Same-page-bottom answers (only `back_of_book`, `next_page`, `none`).

---

## Shrink now centres the block (2026-07-27)

Templated pages anchored the grid+bank block to the **top** of the template's
slot, so every time the user shrank the grid a dead void opened under the word
list — measured on "Kids — big & friendly" at 6×9, the puzzle bbox ended at
y=394 on a 648pt page with nothing below it but the footer.

`wsSlotsFor()` now computes the block height the design reserved
(`origBankTop - s.top + bank`), the height it actually needs after scaling, and
shifts by half the difference. The grid and the bank move together, so the pair
stays optically centred in the space the template set aside.

After the fix the same page centres at y=201..479 with balanced space above and
below. Grid and bank keep their relative spacing; page-level chrome (background,
frame, title, footer) correctly stays put.

### On "template chrome does not re-lay"

Investigated with `/tmp/t/chrome-drift.mjs`, which snapshots every object's
bounding box before and after a resize. On all five word search designs **every
untagged object that stayed still was page-level decoration** — page background,
outer frame, title, theme line, footer rule. Those *should* be fixed; they are
page furniture, not puzzle furniture.

The genuinely slot-relative chrome (the boxed frame behind the word bank in
"With notes", the divider rule between two-up puzzles) is worth tagging, but it
is a much smaller problem than the note originally implied. Anything drawn from
`a.left`/`a.width` is page-anchored by design.
