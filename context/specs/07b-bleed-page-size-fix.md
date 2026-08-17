# Unit 07b — Bleed changes the page size (defect fix)

> **Read first:** `AGENTS.md`, then **`context/decisions.md` D25** (written for this fix),
> D9, and `context/ui-context.md` §9 rule 1 ("the paper never lies").

> **Small, surgical unit.** Run it **before** Unit 07 if Unit 07 has not started, or
> immediately after it. It must land before Unit 10 (cover) and Unit 11 (export), both of
> which read page size.

---

## The defect

Found by the owner in the Unit 06 shell. With bleed **on** at 6 x 9:

- the white paper on screen is **6 x 9** — trim size
- the red bleed guide is drawn **outside** the paper, floating on the grey
- the trim guide sits **on** the paper's edge

All three are wrong, and they are the same wrong thing.

## What is true

A page set up for bleed is **physically larger than its trim size**; the printer cuts it
down. Bleed is added on the **outer edge, top and bottom only** — the gutter edge is never
trimmed, so it never bleeds.

| Bleed | Paper size (6 x 9) | Trim guide |
|---|---|---|
| Off | 6 x 9 in | on the page edge |
| On | **6.125 x 9.25 in** | **inset 0.125 in** from outer, top, bottom |

## Why this matters more than it looks

Art meant to run off the edge is drawn **into** that extra 0.125 in. If the paper on screen
is only trim-sized, there is nowhere to put it and the bleed toggle does nothing real.

Worse, it teaches the user the wrong thing: they see art ending at the paper edge and
believe it will print edge to edge. It will not. It will print with a thin white sliver,
which is the most common reason a KDP interior looks wrong in a proof copy.

---

## Implementation

### 1. `bleed` moves into the Document

```ts
type BookSettings = {
  readonly trimId: TrimId;
  readonly paper: PaperStock;
  readonly binding: Binding;
  readonly bleed: boolean;   // NEW
};
```

- New command `{ t: 'book/setBleed'; bleed: boolean }`.
- **Schema migration v2 → v3**, defaulting existing documents to `bleed: false`. This is
  the first migration that does real work — the no-op v1 → v2 step from Unit 04 was
  rehearsal for exactly this.
- Remove `bleedOn` from `ui-store`. It was never a view setting: the exported PDF's page
  size depends on it, and the Document alone must be enough to export (architecture §2
  rule 4).
- This closes tracker open question 9.

### 2. One page-size function, used by everything

In `print/`, beside the other page math:

```ts
pageSizeIn(book: BookSettings, pageIndex: number): { widthIn: number; heightIn: number }
```

- bleed off → the trim size
- bleed on → `trimW + 0.125` wide, `trimH + 0.25` tall

**Every consumer reads this one function**: the renderer, thumbnails, guides, preflight,
export. There must be exactly one definition of how big a page is.

### 3. Guides shift accordingly

The page's coordinate origin stays at the **top-left of the paper**, which is now the bleed
edge. So with bleed on:

- **trim** guide is inset 0.125 in from the outer, top and bottom edges, and sits flush
  against the gutter edge
- **bleed** guide is the paper edge itself — never outside it
- **safe area** is measured from the trim line, not from the paper edge

Recto/verso still decides which side is the outer edge: on a recto (odd) page the gutter is
on the left, so the bleed grows to the right.

### 4. The toggle does not move

It stays in the bottom bar (D9). It now dispatches `book/setBleed` instead of setting view
state. One undo entry.

---

## Tests

### `page-size.test.mjs`
- Bleed off at all six trims → paper equals trim
- Bleed on at 6 x 9 → exactly 6.125 x 9.25
- Bleed adds width **once**, not twice — the gutter edge gets none
- Recto and verso grow on opposite sides

### `guides-bleed.test.mjs`
- With bleed on, **every guide rect is inside the paper**. Nothing floats outside it — this
  is the exact regression from the screenshot.
- The trim guide is inset 0.125 in on outer/top/bottom and flush at the gutter
- Safe area is measured from trim, not paper edge
- With bleed off, trim and paper edge coincide

### `migrate.test.mjs` — extend
- A v2 document migrates to v3 with `bleed: false`
- A v3 document round-trips unchanged
- `book/setBleed` produces one undo entry and one page-size change

---

## Verify when done

- [ ] `npm run check` — lint 0/0, `tsc -b` clean, tests pass, build passes
- [ ] `grep -rn "bleedOn" src/` returns nothing — it lives in the Document now
- [ ] Toggling bleed at 6 x 9 makes the **white paper visibly grow**, and the trim guide
      moves inside it
- [ ] No guide is ever drawn outside the paper
- [ ] `grep -rn "0.125" src/ui/` returns nothing — bleed math lives in `print/`
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

Export (Unit 11) — it will read `pageSizeIn`, it is not written here. Preflight rules about
content in the bleed zone (Unit 11). Cover bleed (Unit 10) — different geometry, already
handled by `coverSpecFor`.

---

## Note for the implementer

This is a **defect fix with a schema change**, not a feature. Keep it small: one field, one
command, one migration, one page-size function, and the guide math that follows from it.

Do not take the opportunity to reorganise `print/`.
