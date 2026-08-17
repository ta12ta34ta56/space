# Handwriting / alphabet tracing module

## Why a module, not templates

Same reasoning as Sudoku. A template is one static page you drop content onto.
This needs to *generate* 26–62 pages, each with computed geometry that depends
on trim size, letter width and row count. That is a generator.

Templates still matter — they are the page *designs* the generator fills, and
there will be many (see `templates.ts`).

## Architecture

```
letterforms.ts   26 upper + 26 lower + 10 digits as ordered strokes
generator.ts     letterforms -> page data (pure, no DOM, unit tested)
renderer.ts      page data -> fabric objects
templates.ts     page designs (frame, title, art slots)
build-pages.ts   assembles pages + writes page metadata
layout.ts        live re-layout when the user resizes
HandwritingPanel UI
```

## Why letters are stroke data, not a font

A font glyph is a filled outline with no stroke order. Tracing needs:

1. **Stroke order and direction.** `A` is two diagonals then a crossbar, drawn
   top-down. A font cannot express "first" and "second".
2. **A centre line, not an outline.** Rendering a font at low opacity makes a
   child trace the *edge* of a thick shape, which teaches the wrong motion.
3. **Even dots at any size.** Dash spacing must hold from 40pt to 400pt.

## Coordinate system

Normalised 0..1 box. `y` grows **downward** (screen convention).

| y | guide | letters |
|---|---|---|
| 0.00 | ascender | capitals, `b d f h k l t` |
| 0.25 | midline | top of `a c e m n o r s u v w x z` |
| 0.75 | baseline | everything sits here |
| 1.00 | descender | `g j p q y` |

Those fractions are why `b` and `p` come out right: both are stem + bowl, but
the stem runs 0→0.75 for `b` and 0.25→1.0 for `p`.

## Bugs found by the tests (all real, all fixed)

**1. Infinite loop → Node heap exhaustion.**
`dashesAlong` could compute a zero-length advance when `posInPeriod` landed
exactly on `dashLen`; `t` never moved and dashes were allocated until the
process OOM'd. The suite crashed rather than failing, which is how it surfaced.
Fixed with an epsilon-guarded minimum advance plus an iteration cap.

**2. `C` and `G` did not reach the ascender.**
Measured top = 0.068 instead of 0.000. Cause: in screen coordinates the top of
an ellipse is **270°**, not 360°. The sweep `305 → 595` never contained 270, so
the apex was outside the arc entirely. Two failed attempts (more samples, then
injecting cardinal angles) did not help because the angle simply was not in
range — the fix was the correct sweep `325 → 35`, and the arc flattener now
also forces any cardinal angle that falls inside a sweep.

**3. `E` and `F` were single polylines.**
Drawn as one continuous path, so a child would never lift the pencil. Split
into taught strokes: stem, then each arm. `E` = 4, `F` = 3.

**4. Dash count did not grow with letter size.**
Dash length was a fraction of height, so a 400pt letter got the same 95 dashes
as a 50pt one, each 8× longer — a dashed outline, not a dotted trace. Dash size
is now absolute points, clamped 0.9–3.2pt, so a bigger letter gets *more* dots.
Measured 83 → 213 across an 8× size change.

**5. Dashes split at polyline vertices.**
17 of 92 dashes on a capital `O` were fragments, because each segment emitted
its own dashes. A dash is now held open across vertices and closed only when
the pen has travelled `dashLen`. Uniformity ratio went from **3.98 → 1.00**.

## Test coverage — 57 checks

Alphabet completeness · no empty or degenerate forms · every stroke inside the
box · **descenders actually descend** (catches a `p` drawn like a `b`) ·
x-height letters rest on the baseline · ascenders reach the top · capitals span
ascender→baseline · stroke counts match teaching order · dash uniformity on
curves · dash scaling · row packing without overlap · narrow letters fit more
per row than wide · guides at exactly 25% / 75% · rows that would overflow are
dropped · custom character sets (a child's name) · unknown characters dropped
rather than crashing.

## Letterform audit — 2026-07-30

The unit tests all passed while several letters were visibly wrong on paper.
Rendering an atlas of all 62 glyphs with numbered strokes and direction arrows
found what assertions could not.

**The collapse bug (the big one).** A `line` stroke holds a point list, and the
renderer draws it as one polyline — but the *dash walker* joined first point to
last, so every corner in between vanished. `M N W Z z L V v w 1 4 7` all printed
as a single diagonal. Fixed by splitting every cornered letter into one stroke
per pencil stroke, which is also how the letters are taught. Guard added: no
`line` stroke may have more than two points.

**Pinched bowls.** `rx` is in normalised units and gets multiplied by the
letter's aspect on the way to the page, so a bowl that looked correct in the
source rendered 0.70–0.79 as wide as it was tall. `a b c d g o p q O Q` were all
egg-shaped. Now 0.83–0.94. Guard checks the *rendered* ratio, not the source.

**`g`** — the tail curved inward from the midline and read as a comma. Now drops
straight down the right edge, then hooks left below the baseline. Same fix for
`j`; `y`'s two diagonals now actually meet.

**`G`** — the crossbar floated 0.226 away from the arc. Now starts on the arc's
own end point.

**`f` `t`** — hooks rebuilt. **`3` `5`** — redrawn as proper bowls.

Guards added so none of these can silently return: descenders must reach below
the baseline *and* hook left (ignoring the dot on `i`/`j`), cornered letters must
keep their corners, bowls must render round.

## Page designs — 14

| id | audience | what it is |
|---|---|---|
| `classic` | school | Ruled rows, letter at the top. The default. |
| `picture-word` | preschool | Big letter + **image slot** + "A is for Apple" |
| `colour-letter` | toddler | Giant hollow letter to colour, two rows under |
| `find-letter` | preschool | Hunt grid of mixed letters to circle |
| `rainbow-write` | toddler | Trace three times in three colours, dot per row |
| `word-practice` | school | Trace a whole word — good for names |
| `count-trace` | preschool | Digits: trace, then count and colour N objects |
| `draw-it` | preschool | Two rows + a big **drawing box** |
| `big-bold` | toddler | Two enormous rows for the youngest hands |
| `journal-card` | school | Framed keepsake with name/date lines (AD) |
| `dot-to-dot` | preschool | Numbered dot-to-dot letter (PRO) |
| `minimal` | minimal | Rows only, maximum practice per page |
| `alphabet-grid` | school | Whole alphabet, one letter per row in a ruled grid with a shaded label column |
| `match-case` | preschool | Two columns of letters to join with a pencil line |

`alphabet-grid` and `match-case` are **whole-alphabet** designs: they cover the
set on one sheet, so `build-pages` emits a single page instead of 26 near
identical ones (`WHOLE_ALPHABET_DESIGNS`). Each grid row carries its own letter,
matching the label beside it — and the live re-layout applies the same rule, or
resizing would collapse every row back to the page's single character.

Four reserve **image slots** so the user drops in their own art — that is the
manual half of the module: we lay the page out, they bring the pictures.

## Word banks

`word-banks.ts` — an example word per letter, chosen against three rules:

1. **The letter must make its usual sound.** `C is for Cat`, never Circle;
   `G is for Goat`, never Giraffe. Soft C/G teaches the wrong phoneme.
2. **Concrete and drawable** — a child illustrates these.
3. **Short and common.**

`X` is handled honestly: almost nothing a child knows *starts* with X, and
xylophone actually begins with a /z/ sound. So the phrase flips to
**"Box ends with X"**. Tests assert this.

## Complete — shipped

`build-pages.ts` · `layout.ts` · `HandwritingPanel.tsx` · rail entry ·
home-screen card. Verified end-to-end in a real browser
(`npm run test:hw-browser`).

### THE TAG BUG — there are TWO allow-lists, not one

I added `hwRole`/`hwPuzzle` to `CanvasEngine.EXTRA_PROPS` up front, believing
that was the known trap. The browser test then reported **0 of 667 objects
tagged** after a save.

There is a **second** allow-list: `PUZZLE_EXTRA_PROPS` in
`shared/puzzle-utils.ts`, used by `objectsToPageData()` — which is what every
module actually calls when building pages off-canvas. The engine's list only
covers the live canvas.

Both must be updated. Anything missing from either is silently dropped, the
page still *looks* right, and live-adjust stops working after a reload.

Now: 667/667 tagged, and the same 667 survive serialisation.

### The X bug, second occurrence

`phraseFor()` correctly produces "Box ends with X", but `templates.ts` was
rebuilding the sentence itself from `char` + `word`, discarding the fix. The
context now carries a finished `phrase` and the template must not re-derive it.
TypeScript caught this as an unused import — worth heeding rather than deleting.

### Live re-layout

Template-aware from the start, per the word-search/crossword pattern. Rows are
**regenerated**, not nudged: row content depends on height (a taller row fits
fewer letters), so moving existing objects cannot give the right answer.
Measured 667 → 514 objects when shrinking. Chrome, hunt grids and dot-to-dot
dots are excluded from the rebuild so decoration survives.

## Test coverage

- `npm run test:handwriting` — 94 checks (geometry, letterform audit, word banks, all 14 designs)
- `npm run test:hw-browser` — 18 checks end-to-end in Chromium
