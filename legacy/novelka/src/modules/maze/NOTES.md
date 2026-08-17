# Maze module

## Status

**Complete and shipped.** 52 generator/template checks + 22 browser checks.

| file | role |
|---|---|
| `generator.ts` | graph, carving, solver, difficulty analysis |
| `renderer.ts` | walls/solution/markers as tagged fabric objects |
| `templates.ts` | 7 page designs |
| `build-pages.ts` | pages, numbering, answer-key section |
| `layout.ts` | template-aware live re-layout |
| `MazePanel.tsx` | UI |

Wired into the rail (**Mazes**) and the home screen.

## Design: one graph, four shapes

Rectangular, circular, triangular and hexagonal are all the same thing
underneath — cells joined by walls. Modelling that as a general graph means one
carving algorithm, one solver and one difficulty metric serve every shape.
Four separate implementations would need four of each and would drift apart.

Carving is **iterative** randomised DFS. Recursive would blow the call stack at
40,000 cells; a 120×120 maze builds in 138 ms.

## Guarantees, asserted not assumed

An unsolvable maze printed in a book cannot be fixed after the fact, so:

- 64 mazes across every shape × difficulty × size all solve
- every step of the solution follows an actual open wall
- no walled-off cells in any shape
- unbraided mazes are perfect: exactly `cells − 1` links, one unique route
- braided mazes are re-solved after the loops are cut

## Difficulty is measured, not declared

Size is not difficulty. A 40×40 with long corridors is easier than a 15×15 that
branches constantly. What matters is how often you must choose and how far a
wrong choice takes you, so `analyse()` reports decisions, dead ends and the
worst detour, and the tests assert the progression.

| level | decisions | path length |
|---|---|---|
| easy | 3.7 | 61 |
| medium | 11.7 | 123 |
| hard | 14.9 | 196 |
| expert | 25.6 | 274 |

### The surprise: random is not hardest

`straightness` biases the carver toward continuing in one direction. Expert was
originally 0.0 — fully random — and measured **easier than hard**. Sweeping the
value on 22×22 mazes, 12 seeds each:

```
0.00 -> 12.1 decisions     0.30 ->  9.7
0.08 -> 13.9  (peak)       0.45 ->  9.5
0.15 -> 13.0               0.60 ->  8.0
0.22 -> 12.6               0.80 ->  3.8
```

With no bias the carver backtracks more and leaves long unbranched corridors.
Expert now earns its difficulty **structurally** instead: `farthestPair()` finds
the graph diameter by double BFS, so the solution is the longest route the maze
can offer. That took it from 11.7 to 25.6 decisions.

## Bugs found by rendering, not by tests

Three shapes passed every solvability test while printing as **solid grids** —
the graph was correct, the drawing was not.

**Root cause.** `buildWalls` matched shared edges by exact floating-point string
key. Rectangular corners are computed identically from both sides so it worked;
everything else differed in the final bits, nothing matched, and no wall was
ever removed.

- **Triangular** — `Math.floor(i / 2)` over a per-row width drifted, so
  **0 of 63** linked pairs shared an edge. Rewritten so every corner is a
  multiple of one half-step.
- **Hexagonal** — column pitch was chosen independently of hexagon size, leaving
  a **0.0298** gap between neighbours. Now derived from a single circumradius:
  gap is 5.55e-17.
- **Circular** — cells are bounded by *sampled arcs*, so they can never share an
  identical corner pair. Given its own polar wall model
  (`buildCircularWalls`) rather than being forced through polygon matching.

Walls are now derived from the **graph**, which is always right, rather than
from geometry.

### Guard added

`geometry agrees with the graph` — for every linked pair on a straight-edged
shape, the two cells must genuinely share an edge, and wall count must be well
below the solid-grid ceiling. This is what would have caught all three
immediately.

## Serialisation

`mzRole` / `mzPuzzle` added to **both** allow-lists up front —
`CanvasEngine.EXTRA_PROPS` and `PUZZLE_EXTRA_PROPS` in `shared/puzzle-utils.ts`.
Missing either silently drops the tags on save; the handwriting module lost
667/667 tags to exactly that.

## Page designs — 7

| id | per page | notes |
|---|---|---|
| `classic` | 1 | Title + difficulty line. Default. |
| `two-up` | 2 | Stacked, each numbered |
| `four-up` | 4 | 2x2 grid, travel-book density |
| `kids-big` | 1 | Huge maze, thick walls, friendly copy |
| `framed` | 1 | Name/time lines, keepsake feel (AD) |
| `minimal` | 1 | Edge to edge, no ink wasted |
| `answers` | 4/6/9 | Small solved mazes for the back of the book |

Slots are always **square** — a stretched maze distorts its cells. The layout
picks the column count that maximises square size rather than filling the box,
which is why a portrait page leaves some vertical room. Guard added: slots must
be square, inside the page, and never overlap. Sabotage-tested.

## Why re-layout regenerates instead of moving

Wall geometry is a pure function of `(seed, shape, difficulty, size)`, so
rebuilding from the stored seed is exact and cannot drift the way repeated
nudging does. It is also the only correct answer when the slot size changes,
because wall thickness and marker radius scale with it. Pages therefore store
**seeds, not geometry**.

## Verified in the browser

`npm run test:hw-browser`-style E2E (`test/browser/maze.test.mjs`), 22 checks:
4 puzzle pages + 1 answer key, 434 wall objects, start/end markers present,
**the puzzle page does not leak the solution**, the answer page draws all four,
and **440/440 objects keep their tags through serialisation**.
