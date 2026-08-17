# Unit 03 — KDP print truth

> **Read first:** `AGENTS.md`, then `context/architecture.md` (§3 units and coordinates,
> §6 folder boundaries, §10 invariants), `context/decisions.md` (**D7, D8, D16**),
> `context/code-standards.md`.

---

## Goal

Build `print/` — the layer that knows what Amazon will accept. Six trims, one paper
vocabulary, the safe area including gutter bands, and cover geometry rebuilt against a
locked reference table.

Nothing renders. This unit is pure math with tests.

**This is the unit the whole product rests on.** The owner's stated differentiator is
"total, precise, researched enforcement of KDP rules." Every guide, every preflight check,
every export in every later unit reads its numbers from here. If this layer is wrong,
everything downstream is confidently wrong.

---

## Design

No visual design. Guides are Unit 06; this unit only produces the numbers they draw.

---

## Implementation

### 1. `src/print/trims.ts` — the one paper vocabulary

**Six trims only** (D7). No custom sizes, no other entries:

| id | inches |
|---|---|
| `6x9` | 6 × 9 |
| `8.5x11` | 8.5 × 11 |
| `8x10` | 8 × 10 |
| `5.5x8.5` | 5.5 × 8.5 |
| `7x10` | 7 × 10 |
| `a4` | 8.27 × 11.69 |

`PaperStock` is defined **once, here**, and every other module imports it. D8 defect 4 was
two vocabularies (`bw-white`/`standard-color` vs `white`/`color-standard`) with no mapping
between them. There is now one:

| id | inches per page | min pages | max pages |
|---|---|---|---|
| `bw-white` | 0.002252 | 24 | 828 |
| `bw-cream` | 0.0025 | 24 | 776 |
| `bw-groundwood` | 0.00235 | 24 | 812 |
| `color-standard` | 0.002252 | 72 | 600 |
| `color-premium` | 0.002347 | 24 | 828 |

Note `color-standard` uses **0.002252**, not premium's 0.002347 — that is D8 defect 1.

Per-trim page limits differ from the table above and must be modelled: `8.5x11` caps at
590 (bw-white), and `a4` **does not offer `color-standard` at all** — that combination is
unavailable, not merely limited. Port the limit table from
`legacy/novelka/src/services/kdp.ts` L54–94, keeping only the six trims we ship.

`binding` is `'paperback'` only in v1 (D24.4). The type may include `'hardcover'` because
the Document model already does, but every function in this unit throws
`UnsupportedBindingError` for it rather than returning approximate numbers. **An honest
refusal beats a rejected upload.**

### 2. `src/print/margins.ts` — PORTED

This logic is correct and hard-won. **Copy it, do not rewrite it** (`ai-workflow-rules.md`).

Source: `legacy/novelka/src/services/kdp.ts`. Port `GUTTER_BY_PAGE_COUNT` (L120–126),
`gutterInchesFor`, `kdpMarginsFor`, `safeAreaFor`, and the bleed constants.

Two changes are required by the new architecture, and only these two:

1. **Return inches, not points.** The legacy version returns both (`gutter` in pt and
   `gutterInches`). Architecture §3 says Document geometry is inches everywhere and
   conversion happens only at the render boundary, so drop the point fields entirely.
2. **Take a `TrimId` and a `PaperStock`, not raw numbers.** The legacy signature takes
   `pageWidth`/`pageHeight` as bare points, which is how a caller passes the wrong units.

The gutter bands are non-negotiable and must be tested at their boundaries:

| pages ≤ | gutter |
|---|---|
| 150 | 0.375″ |
| 300 | 0.5″ |
| 500 | 0.625″ |
| 700 | 0.75″ |
| 828 | 0.875″ |

Recto/verso is the part that silently ruins books: **odd pages are right-hand (recto) and
their gutter is on the LEFT.** Keep the legacy behaviour exactly.

Export `gutterBandFor(pageCount)` returning the band's `{ maxPages, gutterIn }`, because
D16 needs to detect a band change when pages are added, and comparing bands is clearer
than comparing gutter widths.

### 3. `src/print/cover.ts` — REBUILT

Not ported. `legacy/novelka/src/services/kdp-cover.ts` has four verified defects (D8) and
is reference-only for its *shape*, not its numbers.

```
spine  = pageCount × paper.perPageIn          // NO +0.06" — see D8
width  = 0.125 + trimW + spine + trimW + 0.125
height = 0.125 + trimH + 0.125
```

- **No `+0.06″` allowance.** Sources disagree; we match Amazon's own template generator,
  which is the thing that accepts or rejects the file. D8 records why.
- **Spine text is allowed at 79 pages or more** — `>= 79`, not `> 79` (D8 defect 3).
  Below that, expose `spineTextAllowed: false` so the UI can disable the control rather
  than let the user set text that will be rejected.
- **Barcode keep-out: 2″ × 1.2″**, bottom-right of the back cover, offset 0.25″ from trim.
  Port the placement from `legacy/novelka/src/services/cover-guides.ts`.
- **Hardcover throws.** No wrap, no hinge, no board (D24.4).

### 4. `src/print/reference-table.ts` — the thing that makes this checkable

A frozen table of known-good values. This is what turns "is the cover right?" into a
yes/no question, and it is why a future change cannot quietly break the geometry.

| Trim | Paper | Pages | Spine in | Cover W in | Cover H in |
|---|---|---|---|---|---|
| 6x9 | bw-white | 24 | 0.054048 | 12.304048 | 9.25 |
| 6x9 | bw-white | 100 | 0.225200 | 12.475200 | 9.25 |
| 6x9 | bw-cream | 200 | 0.500000 | 12.750000 | 9.25 |
| 6x9 | color-premium | 300 | 0.704100 | 12.954100 | 9.25 |
| 6x9 | bw-white | 828 | 1.864656 | 14.114656 | 9.25 |
| 5.5x8.5 | bw-white | 120 | 0.270240 | 11.520240 | 8.75 |
| 7x10 | bw-groundwood | 250 | 0.587500 | 14.837500 | 10.25 |
| 8x10 | bw-white | 60 | 0.135120 | 16.385120 | 10.25 |
| 8.5x11 | bw-white | 24 | 0.054048 | 17.304048 | 11.25 |
| 8.5x11 | bw-cream | 400 | 1.000000 | 18.250000 | 11.25 |
| a4 | bw-white | 150 | 0.337800 | 17.127800 | 11.94 |
| a4 | color-premium | 590 | 1.384730 | 18.174730 | 11.94 |

Tolerance **0.0005″**. Every value is `pages × perPageIn` under the D8 formula, computed
from this spec's own paper table — they are consistent by construction, which is what the
test is for: it pins the formula and the constants together so neither can drift alone.

> **Provenance, stated honestly.** These are *derived* values, not scraped from Amazon's
> generator — Amazon's help pages cannot be fetched programmatically, and the paper
> thicknesses come from cross-referencing several independent third-party calculators
> (recorded in D8). They are our locked contract, not gospel. **If the owner ever
> downloads a real KDP cover template and a value disagrees, the table is corrected and
> the test follows the table.** That is the whole point of having one.

### 5. `src/print/index.ts`

The barrel for this layer.

---

## Tests

`trims.test.mjs`, `margins.test.mjs`, `cover.test.mjs`.

### `trims.test.mjs`
- Exactly six trims; `TRIM_IDS` matches `model/types.ts` exactly (a mismatch is a failing
  test, not a runtime surprise)
- Exactly five paper stocks with the thicknesses above
- `color-standard` is **0.002252**, explicitly asserted (regression test for D8 defect 1)
- `a4 + color-standard` reports unavailable, not merely out of range
- Page counts below `minPages` or above the per-trim max are rejected with a message
  naming both the limit and the paper

### `margins.test.mjs`
- **Gutter band boundaries:** 150 → 0.375, 151 → 0.5, 300 → 0.5, 301 → 0.625, 500 → 0.625,
  501 → 0.75, 700 → 0.75, 701 → 0.875, 828 → 0.875
- Recto (odd) pages put the gutter on the **left**; verso (even) on the right
- Safe area is inside the trim on all four sides, at every trim × every band
- Bleed on shifts the outer minimum to 0.375″
- Ported values match `legacy/novelka/src/services/kdp.ts` for the same inputs — a
  divergence means the port went wrong

### `cover.test.mjs`
- **Every row of the reference table passes within 0.0005″.** This is the unit's headline
  test.
- Spine text: 78 → not allowed, 79 → allowed, 80 → allowed (D8 defect 3)
- No `+0.06″` appears anywhere — assert `spineIn === pages × perPageIn` exactly
- Hardcover throws `UnsupportedBindingError`, at every trim
- The barcode keep-out sits inside the back cover and never crosses the spine, at all six
  trims and at both the thinnest and thickest spine

---

## Dependencies

None. This layer is pure and imports only `model/`.

---

## Verify when done

- [ ] `npm run check` — lint 0/0, `tsc -b` clean, tests pass, build passes
- [ ] No `any`, no `@ts-ignore`, no non-null `!`
- [ ] `grep -rn "\* ?72\|/ ?72" src/print/` returns nothing — conversion lives in `units.ts`
- [ ] `grep -rn "state/\|render/\|ui/\|fabric" src/print/` returns nothing
- [ ] Every exported number is inches, suffixed `In`
- [ ] One `PaperStock` definition in the codebase — `grep -rn "0.002252" src/` hits
      `print/trims.ts` and the tests only
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

Drawing guides (Unit 06). Preflight (Unit 11). The cover **document** and its elements
(Unit 10) — this unit produces geometry, not a `Cover`. Movement clamping (Unit 09) — it
consumes `safeAreaFor`, it does not live here. Storage. Any UI.

If the spec seems to be missing something needed to finish, **it is not missing — it
belongs to a later unit.** Do not pull work forward.

---

## Note for the implementer

`legacy/novelka/src/services/kdp.ts` is **good code** — port it faithfully and resist
improving it. `legacy/novelka/src/services/kdp-cover.ts` is **not** — read it to see the
shape of the API, then write the numbers fresh from this spec.

The 16 trims in the legacy file are not a bug to preserve; v1 ships six (D7). Dropping ten
of them is the decision, not an oversight.
