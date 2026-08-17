# Unit 08 — Right dock: the Layers tab

> **Read first:** `AGENTS.md`, **`context/decisions.md` D17 and D18**,
> `context/ui-context.md` (§2, §7), `context/architecture.md` (§2, §10).

---

## Goal

Port the Layers tab under D17, and fix D18 while doing it: **every element kind keeps its
own identity**.

Unit 07 ported Pages. Same rule applies here — indistinguishable from the original, except
it can no longer desync, and except that a divider now says "Divider".

---

## The bug this unit closes

The legacy panel **guesses** what each row is by inspecting Fabric objects:

```ts
function kindOf(o) {
  if (isSolutionish(o)) return 'solution';    // regex on a concatenated string
  if (isPuzzleish(o)) return 'puzzle';        // 12 truthiness checks
  ...
  return 'shape';                             // everything else falls here
}
```

`ElementsPanel` inserts 31 dividers, 58 stickers, 20 icons, 12 borders and 8 patterns all
tagged `'sticker'`. So the panel shows one generic row for six visually unrelated families,
and a 1400×41 divider is treated exactly like a square sticker.

**In the new Document, `kind` is stored at insertion** (D18, invariant 8). So:

- `kindOf`, `isSolutionish`, `isPuzzleish`, `labelFor`'s guessing branches — **all deleted,
  not ported.** They exist only because the information was thrown away.
- The row reads `element.kind`. One property access. No inference anywhere.

If you find yourself writing a function that decides what something *looks like*, stop —
that is the bug.

---

## Source of truth

`legacy/novelka/src/components/editor/RightDock.tsx`:

| What | Line |
|---|---|
| `LayerKind` type | L415 |
| `KIND_META` icon/label map | L417 |
| `useLayerTree` | L513 |
| `LayersTab` | L578 |
| `reorderRows` | L585 |
| `setProp`, `removeNode`, `selectNode`, `toggleExpand` | L610–653 |

Port the **structure, markup and interactions**. Replace the data source.

---

## Implementation

### 1. The tree comes from the Document

```ts
layerRowsFor(page: Page): readonly LayerRow[]
```

Pure, in `ui/panels/` or `model/` — **not** a hook that polls.

The legacy `useLayerTree` reads Fabric on five events **plus a 900 ms `setInterval`**. The
interval exists because events were missed. Delete it. The Document is the truth, and
Unit 02's structural sharing tells you exactly when it changed.

Rows are in `z` order, front-most first (as the legacy panel shows them).

### 2. One puzzle is one row (D3)

The legacy code clusters loose Fabric objects into a synthetic "unit" row by matching tags
(`instanceId`, `sudokuPuzzle`, `wsPuzzle`…). That whole clustering mechanism is **deleted**.

A puzzle is already one element in the Document. It is one row. There is nothing to
cluster. `memberIds`, `unitKeyOf`, `moduleLabelOf` all go.

The row is expandable only if the element genuinely has children.

### 3. Eleven kinds, each with its own presentation (D18)

```ts
'text' | 'shape' | 'image' | 'divider' | 'border' | 'pattern'
| 'sticker' | 'icon' | 'puzzle' | 'solution' | 'template'
```

Each gets its **own icon, own label, own class**. Extend the legacy `KIND_META` map from
six entries to eleven. A divider row must be recognisable as a divider at a glance — that
is the owner-visible point of D18.

Labels are words: "Divider", "Border", "Pattern", "Sticker", "Icon". Never "Object".

### 4. Row controls — port exactly

Visibility toggle, lock toggle, name, expand chevron, delete. Each dispatches one Command:

| Control | Command |
|---|---|
| Visibility | `element/update` `{ hidden }` |
| Lock | `element/update` `{ locked }` |
| Delete | `element/delete` |
| Reorder | `element/reorder` `{ z }` |
| Select | `ui-store` only — **never** the Document |

Selection is not a document edit (architecture §2). Putting it in the Document would make
clicking a layer an undoable, autosaved change.

### 5. Reorder

Same grab-reorder as Pages (D21, no drag-and-drop). Drop-line, one `element/reorder` on
release, one undo entry. Keyboard equivalent required.

The legacy `reorderRows` rebuilds bottom-to-top Fabric order by hand. Now it is an array
move on immutable data — the version that "physically cannot desync from the canvas"
(architecture §5).

---

## Tests

### `layer-rows.test.mjs` — pure
- One row per element, in `z` order, front-most first
- **A puzzle element produces exactly one row** (D3)
- Each of the eleven kinds gets its own label and icon — assert all eleven, no fallback
- `grep`-level: no function in `src/` infers kind from `type`, size, or object count (D18)

### `layers-dock.test.mjs` — jsdom
- Visibility and lock dispatch one `element/update` each
- Delete dispatches `element/delete`
- Reorder dispatches **one** `element/reorder`; one Ctrl+Z restores the order
- Selecting a row updates `ui-store` and leaves `doc` unchanged by reference
- A locked element's row shows locked state and refuses reorder

### `dock-parity.test.mjs` — extend Unit 07's
- Legacy class names present: `.layerrow`, `.lk-puzzle`, `.lk-text`, `.lk-image`,
  `.lk-shape`, `.lk-template`, `.lk-solution`, plus the five new D18 kinds
- No `setInterval` anywhere in the dock

---

## Verify when done

- [ ] `npm run check` — lint 0/0, `tsc -b` clean, tests pass, build passes
- [ ] `grep -rn "setInterval" src/ui/` returns nothing
- [ ] `grep -rn "isSolutionish\|isPuzzleish\|kindOf\|unitKeyOf" src/` returns nothing
- [ ] All eleven kinds render distinctly; a divider says "Divider"
- [ ] A generated puzzle is **one row**, not 81
- [ ] Side by side with the old app, the panel looks the same
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

The Inspector (Unit 09) — its tab exists and is empty. Per-kind inspector controls (Unit
09). Real puzzles (Unit 12). Any redesign of the panel.

---

## Note for the implementer

D18 is not a feature request. It is a bug the owner reported and I confirmed in the code.
The fix is not to write a better `kindOf` — it is that **`kindOf` should not exist**.
