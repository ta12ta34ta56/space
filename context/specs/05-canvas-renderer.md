# Unit 05 — The canvas renderer

> **Read first:** `AGENTS.md`, then `context/architecture.md` (§4 Fabric's demotion,
> §6 folder boundaries, §9 rendering pipeline, §10 invariants),
> `context/decisions.md` (**D2, D3, D18, D23**), `context/code-standards.md`.

---

## Goal

Turn a Document into pixels. One direction only.

**This is the checkpoint unit.** Everything before it was types and math with no way to be
visibly wrong. This is where the architecture is proven or disproven, and it is the
cheapest possible moment to find out.

The legacy build failed exactly here: Fabric owned the state, the store owned the state,
and 141 direct engine calls plus 71 store subscriptions hand-bridged the two. Every crash
you spent three months on came from those two copies disagreeing.

This unit makes that class of bug **unrepresentable**, and then proves it with a test that
would be impossible in the old design.

---

## The one-sentence contract

> **The renderer is a pure function of the Document. It stores nothing. Throw it away and
> rebuild it from the same Document and you get the same pixels.**

That sentence is the unit. Everything below serves it.

---

## Design

A single page, centred on the `--workspace` grey (D23), white paper, a soft drop shadow so
the sheet reads as paper. No panels, no toolbar, no guides — those are Unit 06.

Zoom via keyboard/buttons only. **No drag-and-drop anywhere** (D21).

---

## Implementation

### 1. `src/render/canvas/` — the only place Fabric is imported

An **enforced** boundary, not an aspiration. The legacy build imports Fabric in **37
files**; that is the disease, not the symptom.

- `import 'fabric'` appears in `src/render/canvas/` **only**.
- Add a test that greps the source tree and **fails** if Fabric is imported anywhere else.
  A rule nothing enforces is a rule that will be broken in Unit 12 at 2am.
- No Fabric type may appear in any exported signature outside this folder.

### 2. `src/render/canvas/render-page.ts` — the whole idea

```ts
renderPage(canvas: Canvas, page: Page, book: BookSettings, scale: number): void
```

- Reads `page.elements` in `z` order and draws them. That is all it does.
- **Converts inches → px exactly once**, here, at the boundary. `grep "\* ?72"` in
  `render/` must hit nothing — conversion is `units.ts` only.
- **Writes nothing back.** No `canvas.toJSON()`, no `toObject()`, no reading geometry off a
  Fabric object to store it anywhere. Data flows Document → canvas and never returns
  (invariant 2).
- Fabric objects carry `{ elementId }` for hit-testing and **nothing else**. They are not a
  place to stash state.
- **A puzzle element renders as ONE Fabric object** (D3). Not a group of cells, not 81
  rectangles. Unit 12 supplies the real drawing; this unit renders a placeholder frame with
  the puzzle kind's name. `live-style.ts`, which deep-searched Fabric groups to patch
  matching objects by hand, is deleted, not ported.
- **`kind` is read from the element, never inferred** from shape or count (D18, invariant 8).

### 3. `src/render/canvas/resolution.ts` — PORTED, and it is genuinely good

Copy the resolution math from `legacy/novelka/src/engine/canvas-engine.ts` L307–348. It is
correct, hard-won, and the reason the current app is crisp. Extract it as a pure function
so it can be tested without a DOM:

```ts
pixelScaleFor({ cssW, cssH, dpr, maxPx }): { pixelScale: number; supersample: number }
```

The rules, unchanged:

1. CSS size is an **integer** — element and backing store never disagree by a fraction.
2. Backing store = CSS × `devicePixelRatio`.
3. An extra **2× supersample**, so glyphs stay crisp at fractional zoom (73%, 137%).
4. **Capped: the long side stays ≤ 4096 px**, or large pages exhaust GPU memory.
5. Zoom is a **vector transform**, never a CSS scale on the element.

Do not improve this. Port it, test it at the cap boundary, move on.

### 4. `src/render/canvas/CanvasHost.tsx` — the React seam

The one component that owns a Fabric instance.

- Creates the canvas on mount, disposes it on unmount. **`dispose()` is called, always** —
  a leaked Fabric instance is how the legacy build ended up with stale listeners.
- Subscribes to the store; on Document change, re-renders the page.
- **No `useEffect` chains.** One effect creates and destroys the canvas; one subscription
  drives re-render. If a third effect appears, the design is wrong — stop and raise it.
  The legacy build had **97** `useEffect` hooks.
- Uses the structural sharing from Unit 02: if `page` is the same object reference, skip
  the repaint. That is what the reference-equality guarantee was for.

### 5. `src/render/thumbnail.ts`

`renderThumbnail(page, book, maxPx): Promise<string>` — a data URL.

- **Same code path** as the main renderer (invariant: one definition of where things are).
- **Opaque white ground painted before `toDataURL`.** This is the D17 fix — without it,
  JPEG thumbnails of transparent canvases come out black. Keep it.
- JPEG, quality 0.6, `multiplier: min(1, maxPx / pageWidthPx)`.
- Guides are always stripped from thumbnails.

This also closes tracker open question 8 — the storage record's `thumbnail` field gets
filled here.

### 6. `src/ui/app/` — the minimum shell

Enough to see a page: a workspace area, one page centred, zoom in/out/fit buttons.

Wire the Unit 04 autosave here — `createAutosave` at startup, `stop()` on unload. That
closes tracker open question 7.

---

## Tests

### `resolution.test.mjs` — pure, no DOM
- 2× supersample applied below the cap
- The cap engages: a 3000×3000 CSS page at dpr 2 yields a long side of exactly 4096
- `pixelScale` never drops below 1
- dpr 1, 2, 3 and fractional 1.5 all produce integer CSS dimensions

### `fabric-boundary.test.mjs` — the enforcement test
- Walk `src/`, fail if `from 'fabric'` appears outside `src/render/canvas/`
- Fail if any file outside that folder exports a Fabric type

### `render-page.test.mjs` — jsdom
**The rebuild test is the headline, and it is the one the legacy architecture could not
have passed:**

- Render a Document with one element of every kind. Snapshot the canvas.
- **Dispose the canvas entirely. Create a new one. Render the same Document.**
- **The two snapshots must be byte-identical.**

If that passes, the renderer holds no state and D2 is real. If it fails, the architecture
is wrong and we find out now, at Unit 05, instead of at Unit 17.

Also:
- Elements render in `z` order; changing `z` changes the order
- `hidden: true` renders nothing
- A puzzle element produces **exactly one** Fabric object (D3)
- After rendering, the Document is **byte-identical** to before — deep-freeze it and prove
  the renderer never writes back
- `dispose()` leaves no listeners attached

### `thumbnail.test.mjs`
- A page with white content on a transparent canvas produces a thumbnail that is **not
  black** (the D17 regression)
- Respects `maxPx`; aspect ratio preserved

---

## Dependencies

- `fabric` 6 — first use, this unit.
- `jsdom` (dev) — canvas tests.

---

## Verify when done

- [ ] `npm run check` — lint 0/0, `tsc -b` clean, tests pass, build passes
- [ ] `grep -rn "from 'fabric'" src/ | grep -v "src/render/canvas/"` returns nothing
- [ ] `grep -rn "toJSON()\|toObject()" src/` returns nothing
- [ ] `grep -rn "\* ?72\|/ ?72" src/render/` returns nothing
- [ ] `grep -c "useEffect" src/render/canvas/CanvasHost.tsx` is **at most 2**
- [ ] The rebuild test passes — dispose, recreate, identical pixels
- [ ] A page appears on grey, crisp at 50%, 100% and 173% zoom, no console errors
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

Guides, bleed, gutter overlays — Unit 06. Panels, dock, layers — Units 07/08. Selection,
inspector, movement clamping — Unit 09. Real puzzle drawing — Unit 12. Export — Unit 11.
Editing of any kind: **this unit displays, it does not edit.**

If the spec seems to be missing something needed to finish, **it is not missing — it
belongs to a later unit.** Do not pull work forward.

---

## Note for the implementer

`legacy/novelka/src/engine/canvas-engine.ts` is 1,446 lines. **Two things in it are worth
having:** the resolution math (§3 above) and the thumbnail white-ground fix (§5).

Everything else in that file exists because Fabric was the source of truth. It is not a
template. If you find yourself porting a third thing from it, stop and ask why.
