# Unit 06 — Editor shell and print guides

> **Read first:** `AGENTS.md`, then `context/ui-context.md` (**§2 tokens and guide
> colours, §7 layout, §8 copy, §9 honesty rules**), `context/architecture.md` (§9 rendering
> pipeline, §10 invariants), `context/decisions.md` (**D9, D15, D17, D21, D23**).

---

## Goal

Build the frame the editor lives in, and the guides that make Novelka worth using.

Unit 05 put a page on screen. This unit surrounds it with the real shell — top bar, left
rail, bottom bar — and overlays the print guides: bleed, trim, safe area, gutter, spine,
barcode.

**The guides are the product.** The owner's words: the app is "a spy watching 24/7 for
anything wrong," and the safe area "must not let you go out of bounds." This unit draws
what the spy sees. Unit 09 makes it enforce.

Still no editing. No selection, no dragging, no panels.

---

## Design

`ui-context.md` §7 is the layout, exactly:

```
┌──────────────────────────────────────────────────────────┐
│ Top bar — book name · trim · page count · Preflight · Export │  48px
├────┬────────────────────────────────────────┬────────────┤
│ L  │                                        │  Right     │
│ e  │            WORKSPACE                   │  dock      │
│ f  │     (paper, centred, guides overlaid)  │  (Unit 07) │  fluid
│ 56 │                                        │  280px     │
├────┴────────────────────────────────────────┴────────────┤
│ Bottom bar — zoom · fit · page nav · bleed · guides       │  36px
└──────────────────────────────────────────────────────────┘
```

The right dock is **reserved space only** in this unit — an empty 280px column. Unit 07
fills it with the ported Pages tab (D17).

Dark UI, `--surface #191a1c`. Paper white on `--workspace #4a4a4c` neutral grey (D23) —
never near-black, because simultaneous contrast makes white paper on black look
misleadingly bright and the user misjudges the print.

Accent `--accent #c2410c` on the primary action and current selection **only**. Nowhere
else (D15).

---

## Implementation

### 1. `src/print/guides.ts` — the geometry, pure

Guides are **computed in `print/`, drawn in `ui/`**. A React component may not compute a
margin (architecture §6 rule 4).

```ts
guidesFor(book, pageIndex, pageCount, opts): readonly Guide[]
type Guide = { kind: GuideKind; rectIn: Frame; label: string }
```

Everything comes from Unit 03 — `safeAreaFor`, `gutterBandFor`, `coverSpecFor`. **No new
KDP math is written in this unit.** If a number is needed that Unit 03 does not provide,
stop and raise it rather than inventing it here.

Recto/verso matters: odd pages are right-hand and their gutter is on the **left**. Get this
wrong and every guide is mirrored on half the book.

### 2. `src/ui/canvas/GuideOverlay.tsx` — DOM, above the canvas

**Guides are DOM overlays, never Fabric objects** (architecture §9 rule 4). Three reasons,
all load-bearing:

1. They can never be selected, moved, or exported by accident.
2. They cannot end up in the Document.
3. `pointer-events: none` means they never intercept a click.

The six colours are fixed instrument markings and **never themed** (`ui-context.md` §2):

| Guide | Colour | Meaning |
|---|---|---|
| Bleed | `#dc2626` | Content here may be cut off |
| Trim | `#111827` | The physical cut line |
| Safe area | `#2563eb` | Keep all content inside |
| Gutter | `#7c3aed` | Lost in the spine |
| Spine fold | `#059669` | Cover fold |
| Barcode keep-out | `#d97706` | Amazon prints here |

**Guides render on top of all content**, on interior pages **and** the cover. That is an
explicit owner requirement, not a default.

Each guide is individually toggleable. State lives in `ui-store`, **never in the Document**
(architecture §2 — guide visibility in the Document would make "show gutter" an undoable,
autosaved edit).

### 3. `src/state/ui-store.ts` — the ephemeral store

The second store, deliberately separate from `doc-store` (architecture §6). Different
lifetime: none of this is ever persisted or undone.

Holds: `zoom`, `currentPageIndex`, `visibleGuides`, `bleedOn`, `activePanel`, `selection`
(declared here, populated in Unit 09).

**Nothing in this store is ever written to the Document.** A test asserts the two stores
share no keys.

### 4. `src/ui/app/TopBar.tsx`

Book name (editable inline), trim, page count, Preflight and Export buttons.

Preflight and Export belong to Unit 11. **Per honesty rule 3, a control that is not
implemented is not rendered** — so they are absent in this unit, not greyed out. No dead
controls, ever.

### 5. `src/ui/app/LeftRail.tsx` — 56px

View toggles: KDP guides, bleed, rulers, grid, snap, margins.

Rulers, grid and snap have no behaviour until Unit 09 — so **they are not rendered yet**.
Same rule. The rail ships with the toggles that work.

Hand-drawn icons, **never Lucide** (D15). Text labels under icons where space allows —
words teach, glyphs do not (`ui-context.md` §6).

### 6. `src/ui/app/BottomBar.tsx` — 36px

Zoom out / level / in, Fit, page nav showing **"9 of 10"** with jump-to-page, and the
**bleed toggle**.

**Bleed lives here, not in New Book** (D9). At creation the user does not yet know whether
they want bleed; in the editor with the page in front of them, they do. Turning it on
changes page geometry, guides, and export together.

### 7. `src/ui/kit/` — the primitives

`Button`, `Field`, `Select`, `Toggle`, `Tooltip`. Small, tokenised, no library.

`ui-context.md` §5 governs. Note the tooltip: print terms (gutter, bleed, recto, trim) get
a **real explanatory tooltip on first use** — the user is becoming a publisher, so the
terms are used correctly and explained, never dumbed down.

### 8. Copy rules apply to every string in this unit

Plain and concrete. **No em dashes.** No "seamlessly" or "effortlessly". **Every number
carries a unit** — `0.375 in`, never `0.375` (`ui-context.md` §8).

---

## Tests

### `guides.test.mjs` — pure, no DOM
- Every guide rect sits inside the page at all six trims
- **Recto/verso:** gutter is on the left for odd pages, right for even
- Bleed on/off changes the bleed rect and nothing else
- Guides for a **cover** include spine fold and barcode keep-out; interior pages include
  neither
- Crossing a gutter band (150 → 151 pages) moves the gutter guide

### `ui-store.test.mjs`
- Guide visibility, zoom and selection are in `ui-store`, **not** in the Document — assert
  the key sets are disjoint
- Toggling a guide does not touch `doc`, `past` or `future` (assert by reference)

### `overlay.test.mjs` — jsdom
- Guides render as DOM, not canvas objects
- Every guide element has `pointer-events: none`
- A hidden guide renders **nothing** — not an invisible element that could still be hit
- Guides paint above page content in stacking order

### `no-dead-controls.test.mjs`
- Walk the rendered shell; **fail on any `disabled` control** that has no implementation
  behind it. Honesty rule 3, enforced rather than trusted.

---

## Dependencies

None. `ui-store` uses the Zustand already present.

---

## Verify when done

- [ ] `npm run check` — lint 0/0, `tsc -b` clean, tests pass, build passes
- [ ] `grep -rn "from 'fabric'" src/ui/` returns nothing — guides are DOM
- [ ] `grep -rn "lucide\|react-icons" src/` returns nothing (D15)
- [ ] `grep -rni "inter\b\|geist\|space grotesk" src/` returns nothing (D15)
- [ ] `grep -rn "#6366f1\|#a78bfa" src/` returns nothing — the old indigo/purple is gone
- [ ] No guide state appears anywhere in `model/` or in a saved Document
- [ ] Paper is white on grey `#4a4a4c`, not on near-black (D23)
- [ ] All six guides toggle independently and correctly at all six trims, recto and verso
- [ ] No em dashes in UI copy; every displayed number carries a unit
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

The right dock's contents — Pages (Unit 07), Layers (Unit 08), Inspector (Unit 09). Reserve
the 280px column and leave it empty.

Selection or any editing (Unit 09). Rulers, grid, snap behaviour (Unit 09) — and therefore
their toggles are not rendered. Preflight and Export (Unit 11) — their buttons are not
rendered. Templates, generators, New Book.

If the spec seems to be missing something needed to finish, **it is not missing — it
belongs to a later unit.** Do not pull work forward.

---

## Note for the implementer

`legacy/novelka/src/components/editor/EditorFooter.tsx` (160 lines) and
`FoundationRail.tsx` (150 lines) are **protected under D17** — the owner built them and
they work. Port their **structure and behaviour**; retokenise their colours to D23.

D17 governs layout and behaviour. `ui-context.md` governs visual tokens. Where they seem
to conflict: **keep the layout, change the colours.**

`legacy/novelka/src/services/cover-guides.ts` (305 lines) has the cover guide geometry
including the barcode keep-out — port the placement, take the numbers from Unit 03's
`print/cover.ts`, which is the rebuilt source of truth.
