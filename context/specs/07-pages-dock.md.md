# Unit 07 — Right dock: the Pages tab

> **Read first:** `AGENTS.md`, then **`context/decisions.md` D17 (read it twice)**,
> `context/ui-context.md` (§2 tokens, §7 layout), `context/architecture.md` (§2, §10),
> `context/ai-workflow-rules.md` (**Protected Files**).

---

## Goal

Bring the Pages tab across from the previous build **exactly as it is**.

---

## Read this before writing any code

This is the one unit with a rule that overrides the usual instinct to improve things.

The owner built the right dock over three months. In their own words, they *"worked my ass
off"* on it, and losing it is the outcome they named as unacceptable. **D17 exists because
of this panel.**

So the standard for this unit is not "good." It is:

> **Indistinguishable from the original, except it can no longer desync.**

If a reviewer who used the old app cannot tell the difference, the unit passed. If
something looks cleaner, more modern, or better organised, **the unit failed** — even if
the change is genuinely an improvement.

**The only thing that changes is where the data comes from.** The old panel read from
`canvas-store` and called `engine.*` directly. The new one reads the Document and
dispatches Commands. Same markup, same class names, same interactions, same pixels.

You are a translator here, not a designer. If you find yourself deciding how something
should look, stop — that decision was already made and shipped.

---

## Source of truth

`legacy/novelka/src/components/editor/RightDock.tsx`, plus its CSS in
`legacy/novelka/src/index.css` (the `.dockpage*` rules, ~L4116–4270).

Port these, by line:

| What | Where |
|---|---|
| `RightDock` shell + tablist | L26, L42 |
| `PagesTab` | L97 |
| Live thumbnail effect | L120–180 |
| `IntersectionObserver` visibility | L121 |
| Drop-line while reordering | `.dockpage-dropline` L357 |
| `InsertGutter` | L380 |
| Cover thumbnail via `coverSpecFor` | L125–126 |

---

## Implementation

### 1. The tab shell

Tabs, not accordions (`ui-context.md` §7). Pages / Layers / Inspector, with Layers and
Inspector present but empty — they arrive in Units 08 and 09. **Tabs are not dead
controls**; they are navigation to a panel that exists.

Width 280px, the column Unit 06 reserved.

### 2. Thumbnails — port the effect, keep the fix

The live-thumbnail effect (L120–180) is subtle, load-bearing code. Port it whole:

- **Paint an opaque white ground before `toDataURL`.** A page with no background is stored
  as transparent, and JPEG encodes transparent as **black**. Restore the previous
  background afterwards. This is the D17 fix and it must survive the port.
- `format: 'jpeg'`, `quality: 0.6`, `multiplier: Math.min(1, 480 / pageWidth)`,
  `enableRetinaScaling: false`.
- **rAF-throttled** re-snapshot so live edits update the thumbnail on the next frame at
  most once.
- **`IntersectionObserver`** so only on-screen rows render. A 200-page book must stay
  smooth — this is why it exists.
- Cache per page; invalidate only the page that changed.

What changes: the trigger. The old effect listened to `engine.on('modified'|'history')`.
The new one uses **Unit 02's structural sharing** — if `page` is the same object reference,
the thumbnail is still valid. That is strictly better and it is not a redesign; it is the
same behaviour with a reliable signal instead of an event that could be missed.

Use Unit 05's `renderThumbnail`. **One rendering path, no second definition.**

### 3. Rows — everything visible stays

Selected state, hover, the cover row's wider flat thumbnail with its spine width beneath
(`coverSpecFor(book, interiorTotal)`), page labels, recto/verso side markers, the hover
tools (duplicate, delete), and the **severity dot** — red for errors, amber for warnings,
with the border colour to match.

Preflight does not exist until Unit 11, so the dot has **no data source yet**. Build the
prop and render nothing when severity is absent. Do not invent a placeholder severity, and
do not delete the affordance.

Retokenise colours to D23. The legacy CSS has raw `#4f46e5` indigo (L4149, L4189, L4254) —
that becomes `--accent` (`#c2410c`). `#ef4444`/`#f59e0b` become error and warning tokens.
**Colours change; nothing else does.**

### 4. Reorder — grab, not drag-and-drop

D21 bans drag-and-drop. The dock keeps **grab-reorder**, which is the thing the owner
built: press, move, a drop-line shows the target, release commits.

That is not HTML5 drag-and-drop and it is not free-form canvas dragging. It is a list
reorder with a keyboard equivalent, and it stays.

- Port `.dockpage-dropline` exactly.
- One `page/reorder` Command on release. **Not one per pointer-move** — a drag is one undo
  entry (Unit 02 §3).
- Keyboard equivalent required: focus a row, move it with the arrow keys.

### 5. Insert gutters

Port `InsertGutter` (L380) unchanged: the thin hover strip between rows with a `+` button,
`aria-label="Insert a page after this one"`. Dispatches `page/add`.

### 6. Actions

Duplicate → `page/duplicate`. Delete → `page/delete`. Select → `ui-store`, never the
Document.

**Deleting below KDP's 24-page minimum is refused with a reason**, not silently allowed.
The user is told what the limit is and why.

---

## Tests

### `pages-dock.test.mjs` — jsdom
- Renders one row per page, in document order
- Selecting a row updates `ui-store` and **never touches `doc`** (assert by reference)
- Reorder dispatches **exactly one** `page/reorder`, and the resulting order matches
- Duplicate and delete dispatch the right Command with the right ids
- Insert gutter dispatches `page/add` at the correct index
- Deleting to fewer than 24 pages is refused and the Document is unchanged
- Severity dot renders when severity is supplied, and renders **nothing** when it is not
- The cover row shows a spine width from `coverSpecFor`

### `thumbnail-ground.test.mjs`
- The regression that D17 exists for: a page with **no background** produces a thumbnail
  that is **not black**
- The canvas background is **restored** after capture
- Two renders of the same unchanged page reuse the cache — no second render

### `dock-parity.test.mjs` — the D17 guard
- The rendered class names match the legacy set: `.dockpage`, `.dockpage-thumb`,
  `.dockpage-dot`, `.dockpage-tools`, `.dockpage-label`, `.dockpage-side`,
  `.dockpage-insert`, `.dockpage-dropline`
- Every legacy `aria-label` string in `PagesTab` is present

That last test is unusual on purpose. It makes "did the port stay faithful?" a build
failure instead of an opinion.

---

## Dependencies

None.

---

## Verify when done

- [ ] `npm run check` — lint 0/0, `tsc -b` clean, tests pass, build passes
- [ ] `grep -rn "engine\.\|canvas-store" src/ui/` returns nothing
- [ ] `grep -rn "#4f46e5\|#6366f1" src/` returns nothing — old indigo gone
- [ ] `grep -rn "draggable=" src/` returns nothing (D21)
- [ ] A 200-page book scrolls smoothly; off-screen rows are not rendered
- [ ] A thumbnail of a background-less page is white, not black
- [ ] Reorder produces **one** undo entry, and one Ctrl+Z restores the order
- [ ] Side by side with the old app, the panel looks the same
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

Layers (Unit 08) and Inspector (Unit 09) — their tabs exist and are empty. Preflight
severity data (Unit 11). Real puzzle thumbnails (Unit 12). Any redesign, retitling,
respacing, or reorganising of this panel.

If you think something in the old panel is wrong, **it is not yours to fix in this unit.**
Note it in the tracker and let the owner decide.

---

## Note for the implementer

The legacy file mixes the panel with `canvas-store` and direct `engine` calls. That
coupling is what you are removing. The panel itself — its markup, its interactions, its
CSS — is the thing being preserved.

Read `decisions.md` D17 before you start, and again before you open the PR.