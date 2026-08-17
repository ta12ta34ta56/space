# Locked Decisions — Novelka v2

> Decisions that are **settled**. The six context files are written FROM this file.
> Nothing here gets re-litigated without a deliberate change and a reason recorded below.
>
> Last updated: 16 August 2026.

---

## D1 — Fresh skeleton, ported brain

**Not new. Better.** We rebuild the app shell, state model, and rendering boundary. We
**port** the pure logic that already works: generator algorithms, KDP margin math, word
and clue banks, preflight, the SVG sanitiser, 130 SVG assets, and the test suites.

~25,000 of ~32,800 logic lines move by copying the file. The three months are not lost;
they are the foundation.

---

## D2 — The Document is the only source of truth

Plain, immutable, serialisable JSON. Fabric renders it and stores nothing.
`page.data = canvas.toJSON()` is **banned**. Every change is a typed Command:
`apply(doc, cmd) -> Document`, pure.

**Why:** measured in the current app — 161 direct engine calls from components, 109 store
subscriptions, 87 serialise round-trips, 97 bridging `useEffect`s. Two copies of the same
data reconciled by hand. That is the crash. One-way flow makes the bug unrepresentable.

---

## D3 — A generated puzzle is ONE semantic object ⭐

**The most important product decision in this document.** It resolves what looked like a
contradiction: *"puzzles must be grouped and tidy"* vs. *"puzzles must stay editable."*

A puzzle on a page is a single element holding three separable things:

```ts
{
  type: 'puzzle',
  kind: 'sudoku',
  frame:  { xIn, yIn, wIn, hIn },   // where it sits
  data:   { seed, givens, solution, difficulty },  // WHAT the puzzle is
  style:  { borderWidthPt, borderColor, gridColor, cellFill,
            fontFamily, fontSizePt, textColor, numbering, ... }  // HOW it looks
}
```

### The rule this creates

> **Style is a property, not an edit.** Changing how a puzzle looks changes one field and
> re-renders. It never touches individual cells.

### What this buys

| Want | How it works |
|---|---|
| "Puzzles must be tidy, not scattered" | There is nothing to scatter. One object, laid out by pure code. |
| "Users must be able to change border colour / thickness / text colour" | Set a style field. Instant, safe, undoable. |
| "Apply to all pages" | Copy the `style` object to every puzzle of that kind. **One field, one undo step.** |
| "Regenerate this one puzzle" | New seed, same frame and style. |
| "It must survive editing without crashing" | No object surgery exists to go wrong. |

### What it replaces

Today: `live-style.ts` deep-searches inside Fabric groups, patches matching objects by
hand, and replays changes off-screen across pages to implement apply-to-all. That
mechanism is the source of the editing crashes. **It is deleted, not fixed.**

### The escape hatch

A deliberate **"Break apart"** action converts a puzzle into plain shapes and text for
users who want total freedom. One-way, clearly warned, and after it the object is no
longer a puzzle (no regenerate, no apply-to-all). Power without contaminating the safe path.

---

## D4 — Style is chosen BEFORE generation, and stays live after

The user's flow, and it is the right one:

1. Open the generator. Choose the puzzle type and a few options.
2. **A live preview shows ONE real puzzle** — actual output, not a stock picture.
3. Adjust style on the preview: borders, colours, fonts, grid weight.
4. **Generate.** Every puzzle in the book is produced with that exact style.
5. Later, change the style on any puzzle → "apply to all" → the whole book updates.

**Why this is better than editing after the fact:** the user sees exactly what they are
getting before committing 50 pages, and the same `style` object drives the preview, the
page, the thumbnail, and the PDF. They cannot disagree, because there is only one of them.

### Guard rails (from the owner: "they can't go off limits")

Style options are a **fixed, validated schema per generator** — enumerated fonts, bounded
thickness ranges, a curated palette. No free-form CSS, no arbitrary values. Every
combination is guaranteed printable and inside the safe area. Sensible defaults mean a
user who touches nothing still gets a good book.

---

## D5 — Generators are fine; LAYOUT is what's broken

Measured: the generator algorithms pass 250+ tests (maze 52, handwriting 94, crossword 42,
word search 30, sudoku proven-unique). **They are not the problem.**

The problem is `layout.ts` and the five hand-written generator panels (~110 KB) — scattered
elements, numbers drifting below the grid, no grouping, per-generator special cases.

**Therefore:** port the algorithms unchanged. Rewrite layout as a pure function
`(puzzle, frame, style) -> rendered geometry`. Replace five bespoke panels with **one
schema-driven panel** — a new generator ships a schema, not a UI.

---

## D6 — Auth: build-free, sign-in only at export, deferred

- Building a book requires **no account**. Zero friction, matches "a book in seconds."
- A **sign-in button exists** in the UI from the start.
- The gate lands at **export** — the moment of value, when asking is fair.
- **Not built in v1.** The gate is a single seam in the export flow that stays open until
  there is a backend. No auth provider, no server, no payments in the engine phase.

**Why gate at export, not entry:** a signup wall before the user has seen anything is the
highest-friction possible choice, and it directly contradicts the product's promise.
Gating the *output* costs nothing and converts far better.

---

## D7 — Six fixed trims

`6×9` · `5.5×8.5` · `7×10` · `8×10` · `8.5×11` · `A4 (8.27×11.69)`

No custom sizes, ever. Every template and generator must be verified at all six.

---

## D8 — Cover math is REBUILT against verified reference data

**Correction to an earlier claim.** `architecture.md` first listed cover math as
"ported, do not rewrite." That was wrong — the tests only prove the code agrees with its
own assumptions. Verified against KDP's published values, the current
`kdp-cover.ts` has four real defects:

| # | Defect | Consequence |
|---|---|---|
| 1 | Standard Color uses premium's `0.002347"` per page | Wrong spine width → rejected cover |
| 2 | Hardcover modelled as `pages × perPage + 0.06` with a flat `0.75"` wrap | **No hinge, no board thickness, no board overhang.** Hardcover covers are wrong. |
| 3 | Spine text allowed at `> 79` pages | KDP allows **79+**. Off by one. |
| 4 | Two paper vocabularies: `kdp.ts` uses `bw-white`/`standard-color`, `kdp-cover.ts` uses `white`/`color-standard`, with no mapping | The exact "imprecise measurements" the owner reported |

### The decision

**Paperback spine = page count × paper thickness. No `+0.06"` allowance.**

Sources genuinely disagree — some calculators add `0.06"`. We match **Amazon's own cover
template generator**, which is the thing that actually accepts or rejects the file. A
safety allowance that Amazon does not apply produces a spine that is too wide and text
that sits off-centre on the printed book.

| Paper | Inches per page |
|---|---|
| B&W white | 0.002252 |
| B&W cream | 0.0025 |
| B&W groundwood | 0.00235 |
| Standard colour | 0.002252 |
| Premium colour | 0.002347 |

```
spine   = pages × thickness
width   = 0.125 + trimW + spine + trimW + 0.125
height  = 0.125 + trimH + 0.125
```

Hardcover is a **separate geometry**, not paperback plus a fudge: wrap ≈ 0.591" all round,
hinge 0.197" each side of the spine, board thickness added to the spine, board overhang on
height, page range 75–550. **If we cannot verify hardcover to this standard, v1 ships
paperback only** — an honest "paperback for now" beats a rejected upload.

### How this stops being an opinion

The spec carries a **reference table** — known (trim × pages × paper) → expected spine and
cover size, taken from Amazon's own generated templates. A test asserts we match it. Any
future change that breaks a reference value fails the build. "Is the cover right?" becomes
a question with a yes/no answer.

**One paper vocabulary** across the whole codebase, defined once in `print/trims.ts`.

---

## D9 — Bleed is a toggle, not a create-time decision

The owner's existing design, and it is correct. Bleed is a book-level switch in the editor;
turning it on adjusts guides, page geometry, and export. It is not a question asked in the
New Book dialog, because at that moment the user does not yet know the answer.

---

## D10 — Drag-and-drop boundary

- **Yes:** drag to reorder pages, drag to restack layers.
- **Yes:** select an element; nudge, resize, restyle it via panels and the contextual bar.
- **No:** free-form canvas composition as a headline feature. Novelka is a book producer,
  not a design tool.

---

## D11 — Build order: engine → generators → templates

Templates come **after** generators, and are designed *around* real generator output rather
than guessed at in advance.

**Caveat recorded:** the core flow is *create book → pick template → generate into it*, so
the template **system** (a template is `(frame, params) -> elements`) must exist early
enough for that flow to be testable end-to-end. Two or three plain templates early; the
beautiful library last, when nothing underneath can still move.

---

## D13 — Templates are KEPT (measured, not assumed)

The owner feared the existing templates were hardcoded for 6×9 and drift outside the safe
area at other trims. **Measured: that fear is unfounded, and the opposite is true.**

`npm run test:templates` runs **95,677 checks, all passing**. It builds all 20 templates at
**every trim size, recto and verso**, plus gutter extremes (24-page and 600-page books), and
asserts that *every object produced* lies inside the KDP safe area for that exact
combination. 18 of 20 templates derive their bounds from
`safeAreaFor(w, h, pageNumber, kdpMarginsFor(pageCount))` — genuinely parametric. Ratio
values (`w * 0.6`) are proportions *within* that computed box, which is correct adaptation.
`boldCover` is exempt by design: covers bleed deliberately, and the test knows it.

**The templates are the second-best asset in the repo after the generator algorithms.**
They are ported, not rebuilt.

### The real defect (different from the one feared)

`kdpSafe` is an **opt-in flag**. A template that omits it silently skips the safe-area
assertion. Safety by discipline, which eventually fails.

**Fix — make it structural.** A template's signature becomes:

```ts
(safeArea: Frame, params: TemplateParams) => Element[]
```

The template **never receives the full page** — only the rectangle it is permitted to draw
in. Drawing outside the safe area becomes unrepresentable rather than merely forbidden.
Bleed-intent templates (covers) request the bleed box explicitly and are audited separately.

### Consequences

- Port all 20 templates; re-verify at the **six** trims (less surface than today's 16).
- Keep the safe-area audit as the permanent regression net; extend it to every new template.
- **Do not author a large new template library yet.** Port what exists, prove the pipeline,
  add the beautiful designs last (D11).

---

## D14 — Layout must fail loudly, never silently overflow

**Root cause of the crossword overlap bug, found in `src/modules/crossword/layout.ts`
(~line 484):**

```ts
let fs = spec.clueFontSize;
let m = measure(fs);
while (m.tallest > room && fs > 5.5) {   // floor at 5.5pt
  fs = Math.round((fs - 0.5) * 2) / 2;
  m = measure(fs);
}
// clues are then placed REGARDLESS of whether they fit
```

The loop shrinks the clue type trying to fit the column. On hitting the 5.5pt floor with
the clues still too tall, it exits and places them anyway. No error, no warning, no
reflow. Lines stack past the bottom of the safe area and pile onto each other — the
owner's reported "overlapped, unreadable black mass where the words are packed".

**It is not the templates and not the generator.** It is a fitting loop with no failure
branch.

**Why it was never caught:** the crossword suite has 42 checks and **not one tests layout**
— they all verify the puzzle (crossings agree, numbering order, clues attached). Templates
get 95,677 safe-area assertions; generator layout gets zero.

### The rules this creates

1. **A layout function returns a result, not a guess.**
   `layout(puzzle, frame, style) -> { elements } | { error: 'DoesNotFit', detail }`.
   Silent overflow is banned. If it does not fit, say so.
2. **Minimum legible size is a hard floor, not a target.** Below ~7pt for clues, do not
   shrink further — report failure instead. A 5.5pt clue is unreadable in print even when
   it technically fits.
3. **Fit-sensing happens BEFORE generation.** The generator panel computes what fits at
   the chosen trim and tells the user in the preview: *"14 clues will not fit at 6×9. Use
   10 clues, or place clues on the facing page."* Options that cannot fit are not offered.
4. **Overflow has a real strategy**, chosen explicitly — smaller puzzle, fewer clues per
   page, or clues on a facing page. Never "shrink until it breaks".
5. **Every generator gets a layout audit** matching the template audit: no element outside
   the safe area, no two elements overlapping, at all six trims, recto and verso.

---

## D15 — Anti-vibecoded visual identity

The owner supplied a list of tells that mark a UI as AI-generated. **The current app trips
the two loudest ones**: it uses Inter, and a purple/indigo accent (`#6366f1`, `#a78bfa`).

Full rules live in `ui-context.md`. The decisions:

- **Not Inter / Geist / Space Grotesk.** A grotesque with character (IBM Plex Sans or
  similar), plus IBM Plex Mono with tabular figures for every measurement.
- **Not purple-and-black.** Accent is **burnt orange `#c2410c`** — a press/ink colour.
  Purple survives in exactly one place: the gutter guide, where it is an instrument
  marking with a fixed meaning.
- **Not Lucide icons.** A ~30-icon hand-drawn set built for this app's actual vocabulary
  (bleed, trim, spine, verso).
- **No gradients, orbs, glass, bento grids, emojis, sparkles, drop-shadow hierarchy, large
  radii, decorative motion, or em dashes in copy.**
- **Feel:** a print-shop instrument. Dense, calm, quiet. The paper is the star; the UI is
  the dark room around it.
- **Required and genuinely applicable:** custom 404, unique page titles, meta + real
  screenshot share image, robots.txt, alt text and real labels on every icon button,
  skeleton loaders (never spinners where the shape is known), privacy policy and terms
  (the app stores user work, even with no accounts), and the app itself as its own demo —
  no mockups.

### Security items from the owner's list — status under this architecture

Most are structurally impossible in v1, and that is a direct benefit of D12 (no backend):

| Risk | Status |
|---|---|
| `.env` in Git, API keys in frontend | **No keys exist.** No backend, no third-party services. |
| No RLS, SQL injection, frontend permissions | **No database.** |
| Plain-text passwords, auth in localStorage, no email verification | **No accounts in v1.** When auth arrives it is provider-hosted; Novelka never sees a password. |
| CORS `*`, no rate limiting, webhook signatures | **No server, no webhooks.** |
| Predictable IDs | Ids are `nanoid`, not sequential integers. |
| **No input validation** | **APPLIES.** Word lists, custom clues, titles and imported PDFs are user input. Validate and bound every one. |
| **User content as raw HTML** | **APPLIES.** Never `dangerouslySetInnerHTML`. Uploaded SVGs go through the existing sanitiser (51 checks) — that file is ported. |
| **File upload validation** | **APPLIES.** SVG/PDF/image imports: check type, size cap, and structure before use. |
| **Production stack traces** | **APPLIES.** The ErrorBoundary shows a human message plus "download my work". Never a raw trace. |
| **Outdated dependencies** | **APPLIES.** Small dependency list (D-stack) exists partly to make this tractable. |

The five that apply are real and go into `code-standards.md` as hard rules.

---

## D16 — The gutter band trap, and constrained movement

### The trap

KDP's inside (gutter) margin widens in **bands** driven by page count:

| Printed pages | Gutter |
|---|---|
| ≤ 150 | 0.375 in |
| 151–300 | 0.500 in |
| 301–500 | 0.625 in |
| 501–700 | 0.750 in |
| 701–828 | 0.875 in |

The user is asked for page count at creation. **Adding pages later can cross a band**, and
when it does, the safe area of *every page in the book* shrinks by up to 0.125 in.
Content that was legal silently becomes content that will be swallowed by the spine.
Page count also drives spine width, so the cover shifts at the same time.

This is a whole class of silent corruption, and neither the current app nor the original
plan handles it.

### Decision

**Lock the gutter band at creation; warn and offer re-flow when a change would cross it.**

- The book records the band it was designed for.
- Adding or deleting pages across a band boundary raises a **blocking, explicit** prompt:
  what changed, which pages are affected, and two choices — *re-flow the book to the new
  safe area* or *stay under the limit*.
- Never silently re-position a user's work. Never silently leave it invalid.
- Preflight independently re-checks the real page count, so an ignored warning is still
  caught before export.

Rejected alternatives: automatic reflow (moves work the user placed by hand, without
consent) and always-worst-case gutter (wastes 0.5 in on every short book, which is most
low-content books).

### Movement is constrained, and that is the product

The owner proposed free movability as the differentiator. **Pushback, recorded:
movability is what Canva already has.** If free movement lets a user drag a puzzle into
the gutter, Novelka becomes a worse Canva and loses its only real advantage.

> **The advantage is that a mistake cannot be made.**

Therefore:

- Elements move freely **inside the safe area**, and snap to it. They **cannot be dragged
  outside it** — the constraint is enforced by the move command, not by a warning.
- Resize stops at the safe edge.
- Deliberate bleed elements (backgrounds, cover art) are a separate, explicitly-marked
  case allowed to reach the bleed box.
- Snapping targets: safe area, trim, gutter, spine fold, page centre, other elements, grid.

Freedom inside guaranteed-correct bounds. That is a feature to advertise, not a limitation
to apologise for.

### Guides are above everything

The owner's observation is correct and becomes a rule: on the cover especially, artwork is
a full-bleed background, so a user cannot tell they have crossed a line. Guides therefore
render as **DOM overlays above all content**, toggleable, never exported, identical in both
themes. Snapping makes them active rather than advisory.

---

## D17 — The editor UI layout is PRESERVED, not redesigned ⭐

**Correction to an over-broad earlier statement.** D1 said "rebuild the shell, port the
brain," which implied the entire UI was disposable. **That is wrong and would destroy
proven work.** The interaction design of the editor — especially the right dock — is a
hard-won asset and is preserved.

### What was measured in `src/components/editor/RightDock.tsx`

This is not rough work. It contains solutions that are only discovered by shipping:

- `role="tablist"`, `aria-pressed`, `aria-label` on every control — real accessibility
- **IntersectionObserver** so only on-screen page thumbnails render
- **rAF-throttled live snapshots** — the thumbnail updates while you draw, at most once
  per frame, cached per page with only the active page invalidated
- Drag-reorder with a **drop-line indicator** and **insert gutters** between pages
- A layer **tree**: grouping, expand/collapse, lock, hide, per-node semantic labels
  ("Puzzle", "Solution", "Sticker", "Word search")
- The cover rendered with its **spine width shown** beneath a wider flat thumbnail
- A specific fix worth quoting: the capture temporarily paints an opaque white ground,
  because a page stored as `transparent` would otherwise encode as **black** in JPEG.
  That bug is found by shipping, never by planning.

### The decision

**The v2 editor reproduces this layout and these behaviours.** The dock, the tabs, the
page list with insert gutters and drop-line, the layer tree with its semantic labels, the
contextual toolbar, the left rail toggles, the bottom bar — all preserved as *interaction
design*.

What changes is only **what sits underneath**:

| Preserved (the design) | Rebuilt (the plumbing) |
|---|---|
| Dock layout, tabs, panel structure | Reads the Document instead of the Fabric canvas |
| Page list, insert gutters, drop-line | `page/reorder` command on immutable data |
| Layer tree, grouping, lock, hide, labels | Element `z` order in the Document, not Fabric z-index |
| Live thumbnails, IntersectionObserver, rAF throttle | Renders from `page.elements`, not `canvas.toDataURL` |
| Contextual toolbar, left rail, bottom bar | Dispatch commands instead of mutating Fabric |
| Every `aria-*` attribute and keyboard behaviour | Unchanged — copied |

**The user should not be able to tell the dock was rewritten**, except that it stops
desyncing. The tree-reading logic (`useLayerTree`, `kindOf`, `labelFor`, `isPuzzleish`)
gets simpler, because a puzzle is already one labelled object (D3) instead of something to
be inferred from a pile of Fabric shapes.

### Rule for the agent

> **Porting a UI component means reproducing its structure, its accessibility attributes,
> and its interaction behaviour, then swapping its data source.** It does not mean
> designing a new one. Redesigning a preserved component requires an explicit instruction
> from the owner, recorded here.

`ui-context.md` governs **visual tokens** — colour, type, spacing, icons. It does not
authorise re-architecting a layout that already works.

---

## D18 — Every element type keeps its own identity

### The bug (owner-reported, confirmed in the code)

> *"For elements, they are different types, their display should be exactly as it is.
> This is like bug-for-bug — one rectangle for dividers."*

Confirmed. In `RightDock.tsx`:

```ts
type LayerKind = 'puzzle' | 'solution' | 'template' | 'text' | 'image' | 'shape';

function labelFor(o) {
  ...
  default: return o.elementType ?? o.type ?? 'Object';   // ← everything collapses here
}
```

The app can insert **six visually distinct asset families** — 31 dividers, 58 stickers,
20 icons, 12 borders/frames, 8 patterns, plus geometric shapes (rect, circle, ellipse,
triangle, polygon, star, arrow, line). `ElementsPanel` inserts *all* of them with
`elementType: asset.kind === 'icon' ? 'icon' : 'sticker'`, so a decorative divider, a
page border, and a background pattern all arrive tagged **"sticker"**.

Consequences the owner sees:
- The Layers panel shows a generic row for things that are visually nothing alike.
- A divider (a 1400×41 wide ornament) is treated identically to a square sticker.
- Selecting a divider offers sticker controls, not divider controls.
- Nothing can behave differently per family, because the type information was thrown away
  at insertion.

### The decision

**Element identity is explicit, preserved in the Document, and never inferred.**

```ts
type ElementKind =
  | 'text' | 'shape' | 'image'
  | 'divider' | 'border' | 'pattern' | 'sticker' | 'icon'
  | 'puzzle' | 'solution' | 'template';
```

Rules:

1. **Kind is assigned at insertion and stored.** Never derived later from `type`,
   dimensions, or object count.
2. **Each kind has its own row presentation** in the Layers panel: its own icon, its own
   label ("Divider", "Border", "Pattern"), its own thumbnail treatment. A divider row must
   be recognisable as a divider at a glance.
3. **Each kind declares its own inspector controls.** A divider exposes width, thickness,
   colour, and flip. A pattern exposes scale, tile, and opacity. A border exposes inset and
   weight. They are not all given the same generic box.
4. **Each kind declares its own default behaviour on insert** — a divider spans the safe-area
   width at its natural aspect ratio; a border insets to the safe area; a pattern fills.
   Dropping a 1400×41 divider into a square bounding box is a defect.
5. **Aspect-ratio-locked kinds are marked as such.** Dividers, icons, and stickers keep
   their proportions on resize by default.

### Why this matters beyond cosmetics

This is the same failure as D3 (a puzzle collapsing into 81 loose cells) and the same fix:
**preserve semantic identity in the data instead of reconstructing it from appearance.**
Once the kind is in the Document, the Layers panel, the inspector, apply-to-all, and
preflight can all behave correctly per family without a single `if (looksLike...)` guess.

---

## D19 — Generation targets existing pages

**Owner-reported, confirmed.** Create a 15-page book, generate puzzles, and you get **30
pages** — 15 puzzles appended after 15 blanks.

`canvas-store` exposes only two operations: `appendPages()` and `replaceAllPages()`. The
panels call `appendPages(built.pages)`. **There is no "fill the existing pages" operation
at all** — a missing capability, not a bug in an existing one.

**Decision.** Generation takes a **target range** and fills existing pages first, adding
pages only when there are not enough. The panel states the outcome before the user
commits:

> *"12 puzzles → fills pages 3–14 (existing)"*
> *"20 puzzles → fills pages 3–15, then adds 5 new pages"*

Commands: `generate/fillRange` (default) and `generate/append` (explicit). Never append
silently.

---

## D20 — Real font faces only; missing styles are disabled, never synthesised

**Owner-reported as "italic doesn't work". The code is correct; the assets are missing.**

The scanner correctly detects `The Seasons Italic.ttf` and registers `style: 'italic'`;
the loader registers each face as its own `FontFace`. But of **22 font files, exactly one
is italic**. Cormorant, Lato, Merriweather, Montserrat Alternates and Playfair Display
ship Regular + Bold only.

With no italic file the browser **synthesises** one by slanting the regular. It looks
wrong on screen and does not embed honestly in a PDF — a direct violation of architecture
invariant 12.

**Decision.**
1. Ship **4–6 curated families with all four real faces** (Regular, Bold, Italic, Bold
   Italic).
2. **Disable, never fake.** If a face has no file, the control is greyed out with a reason.
   Browser synthesis is banned.
3. A **build check fails** when a registered family advertises a face it has no file for.

*(Third instance of the same pattern: the owner blamed the code, the code was fine, the
real defect was elsewhere. Measure first — always.)*

---

## D21 — Simplifications locked by the owner

| Area | Decision |
|---|---|
| Drag-and-drop | Removed everywhere, including PDF import. Use a file picker. |
| PDF import | Kept. Accepts any PDF, not only low-content. |
| Export format | **PDF only.** No PNG/JPG, no format picker. |
| Export behaviour | Export **downloads interior and cover automatically as two files**. Interior-only / cover-only become secondary options in a drawer. |
| Export options | Remove "transparent background". Keep print quality. Keep selectable/searchable text — it is what makes the PDF professional and it costs nothing. |
| Theme | **One theme for v1** (owner to pick dark or light). Halves visual QA. |
| Templates panel | Thin the panel, search bar, top bar and sidebar so previews are larger. |
| Page indicator | Reads **"9 of 10"** and opens a jump-to-page control when clicked. |
| Preview | A **true book preview** modelled on KDP's previewer: real spread, page turns, and full-screen that fills the screen with the book — not merely hidden browser chrome. |

---

## D22 — Template previews must be true to print

Owner-reported: templates authored early — daily planners and calendars especially —
preview as abstract shapes rather than what the printed page will look like.

**Decision.**
1. **Previews render the real template output** at small scale, through the same layout
   code as the page. Not a hand-drawn SVG approximation. (This falls out of the
   single-geometry rule: screen, thumbnail and PDF read the same elements.)
2. **A preview action** on every template, supporting single-page and **double-page
   (recto/verso) spreads**.
3. **Variants.** A template may declare variants — a lined template offering thinner or
   thicker rules — revealed on selection.
4. Thumbnails get smaller and denser; the panel chrome gets thinner to give them room.

---

## D23 — Dark only, with a neutral grey paper surround

**Owner's choice: dark.** There is no light theme in v1 — one theme halves the visual QA
surface and removes an entire class of "wrong in the other mode" defects.

### The correction that comes with it

**The workspace immediately around the paper is neutral mid-grey (`#4a4a4c`), not
near-black.**

Simultaneous contrast means a white page on a near-black field reads brighter and colder
than the same page on grey. The user would be misjudging the exact thing they are
producing. Every professional print and photo tool — InDesign, Affinity Publisher,
Lightroom, Photoshop — surrounds the artboard with neutral grey for this reason.

So the theme is layered:

| Zone | Colour | Reason |
|---|---|---|
| Panels, docks, bars | Dark (`#191a1c`) | Easy on the eyes over long sessions |
| Workspace around the paper | **Neutral grey (`#4a4a4c`)** | Accurate judgement of the printed page |
| The paper | Pure white, never tinted | It is a print preview and must not lie |

**This is a correctness requirement, not a style preference.** It must not be "tidied up"
to match the panels. Novelka is judged on printed output; the surround must be neutral.

Keeping: the existing inline no-flash script in `index.html`, so there is never a flash of
the wrong background before first paint.

A light theme may return post-v1. Tokens are already semantic, so it stays cheap.

---

## D24 — The remaining open questions, decided

Owner directed: *"History yes, import no, keep the fonts, and others you decide."* These
are agent calls made on the owner's authority. **Any of them can be overruled later at low
cost** — that is why the reasoning is recorded.

### 24.1 History panel — KEEP (owner)
The undo history list stays. Under the Command model it is nearly free: the history stack
already exists, and the panel is a read-only view of it with a jump-to-state action.

### 24.2 PDF import — CUT (owner)
Removed entirely. This also removes **pdfjs-dist (~1.3 MB)** from the dependency list and
deletes a whole file-parsing attack surface (D15). Importing arbitrary PDFs never fitted a
low-content book producer.

### 24.3 Fonts — KEEP, but real faces only (owner)
The local font scanner stays. Under D20 every shipped family must have **all four real
faces** (Regular, Bold, Italic, Bold Italic) or the missing style is disabled rather than
faked.

**Decision: ship 5 families.**

| Family | Role |
|---|---|
| A workhorse serif | Body text, classic interiors |
| A workhorse sans | Modern interiors, planners |
| A display/title face | Covers and title pages |
| A rounded/friendly face | Kids' and activity books |
| A handwriting/practice face | Handwriting generator |

Five covers every book type Novelka makes, and 20 font files is a set that can actually be
verified. The existing library is Regular+Bold only, so **the missing italic files must be
sourced before this ships.** That is an asset task, not a code task, and it belongs to the
owner.

### 24.4 Hardcover — CUT from v1
Paperback only. KDP hardcover needs wrap (~0.591"), hinge (0.197" each side), board
thickness in the spine, board overhang on height, and a 75–550 page range. The current
code models none of it (D8). **A rejected upload is worse than an absent feature.**
Hardcover returns when its geometry can be verified against reference values.

### 24.5 Quick create — produces a COMPLETE interior
"Create a puzzle" and "Create letters" generate a **finished, exportable interior** using
defaults — not a sample to extend. Reasoning: the product promise is *a book in seconds*.
A teaser that requires more work breaks that promise at the exact moment it was made. The
book opens in the editor afterwards, fully editable, so nothing is lost.

Defaults: 6×9, white paper, paperback, 24 pages (KDP's minimum), no cover.

### 24.6 Double-page spread templates — model support now, feature later
The Document already carries recto/verso per page, which is all a spread template needs.
No further model work now. Spread templates ship after the single-page library is proven.

### 24.7 Old code — moved to `legacy/`, deleted after unit 12
The previous build moves to `legacy/` (untouched, not compiled, not linted) and stays there
as the porting source until the last generator is ported. It is deleted in one commit at
the end. **Nothing is deleted while it is still being copied from.**

### 24.8 Success criterion #2 — stands as written
*"Zero invalid interiors are reachable through normal use."* This is deliberately a
prevention standard, not a reporting standard, and it is the entire competitive argument
against doing this manually in Canva. It stays.

---

## D12 — Out of scope for v1

Payments, subscriptions, pricing tiers, admin back-office, marketplace, collaboration,
cloud sync, mobile-first, AI content generation, custom trim sizes, and any backend.

**v1 is the engine.** It ships as a static site with no servers to operate.

---

## Open — still to settle

1. **Double-page-spread templates.** The owner wants left/right paired templates
   (planner/journal spreads). Not v1, but the Document model must not make it impossible —
   pages need a recto/verso notion from day one so a spread template can exist later.
2. **Font library size.** Start with a small curated set of real font files (with genuine
   bold/italic). How many, and which?
3. **Hardcover in v1?** Depends on whether we can verify the geometry to reference-table
   standard. Default: paperback only.
4. **"Quick create" scope.** The home screen offers a fast path ("Sudoku book in seconds").
   Does it produce a full book with defaults, or a short sample the user then extends?
