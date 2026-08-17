# Owner Review — what stays, what changes, what dies

> The owner's full walkthrough of the current app, surface by surface, with every claim
> checked against the code. This is the authoritative statement of **what is loved and must
> survive** and **what is broken and must be redone**.
>
> Reviewed 16 August 2026. Claims marked ✅ were verified in the code; ❌ means the owner's
> diagnosis was wrong and the real cause is stated.

---

## 1. LOVED — protected, port with the design intact

### The right dock — Pages tab
> *"I cannot even explain how much I love this. Everything — the layout, the design, the
> structure."*

Protected under D17. Specifically named as loved:
- Page thumbnails
- The **small, low-visibility "add page" affordances between pages** (insert gutters)
- The **warning dot** on pages with problems
- The selected-page state
- **Drag-reorder**

Every one of these ports as-is. The insert gutters being *subtle* is deliberate design, not
an oversight — do not make them louder.

### KDP preflight checks
> *"Oh my God I love the KDP preflight checks. When the panel opens on the right side and
> tells me what is wrong."*

The right-side panel reporting problems is loved and ports as-is. Improvements allowed, but
the pattern — panel opens, lists what is wrong — stays.

### KDP safe area guides
> *"My most beloved, because it doesn't let anything get out of the page."*

The single most valued feature in the app. This is the product's core promise made visible.

### Cover bleed reference lines (the idea)
> *"This idea is beautiful, it is so unique and it is the best. The current one is bad, so
> put this idea on it and let it be done structurally right."*

**The concept is kept and elevated; the implementation is rebuilt.** Guides above content,
correct math for all six trims, snapping that works.

### Zoom, fit, page navigation
Zoom in/out and fit-to-page work and are kept.

**Improvement requested:** the page indicator should read **"9 of 10"**, and clicking it
opens a jump-to-any-page control.

### Template layout and the template system
> *"I love the template layout so much I cannot express it. Many of them are algorithms,
> especially for puzzles — like little programs. I really love my templates."*

Protected under D13. The parametric, trim-adaptive design is the thing being praised, and
it is verified by a 95,677-check audit.

### Export
> *"I really love it."*

Kept, with simplifications in §3.

### Page numbers
KDP-mirrored odd/even numbering is kept.

---

## 2. BROKEN — verified defects, with the real cause

### ✅ Generators append pages instead of filling existing ones — CONFIRMED
> *"You have 15 pages, you generate, and 15 MORE pages appear. Total 30 — 15 puzzles and
> 15 blank. What the heck."*

**Verified.** `canvas-store` exposes exactly two operations:

```ts
replaceAllPages: (next: Page[]) => Promise<void>;
appendPages:     (incoming: Page[]) => Promise<void>;
```

The panels call `appendPages(built.pages)` when there is no template placement. **There is
no "fill the existing blank pages" operation at all** — it is a missing capability, not a
broken one.

**Fix:** generation targets a **page range**. Default behaviour fills existing blank pages
first, and only adds pages when there are not enough. The generator panel states plainly
what will happen before the user commits: *"12 puzzles → fills pages 3–14 (existing)"* or
*"20 puzzles → fills pages 3–15, adds 5 new pages."*

### ✅ Fonts: italic and bold "don't work" — CONFIRMED, but the cause is different
> *"I downloaded a font because its italic was so good, but the italic doesn't work."*

The owner blamed the code. **The code is correct.** The scanner properly detects
`The Seasons Italic.ttf` and registers it as `style: 'italic'`; the loader registers each
face as its own `FontFace` with the right weight and style.

**The real cause: the italic files do not exist.** Of 22 font files in
`public/assets/fonts/`, exactly **one** is italic (The Seasons). Cormorant, Lato,
Merriweather, Montserrat Alternates, Playfair Display — all Regular + Bold only.

When a face is missing the browser **synthesises** it (slanting the regular), which looks
wrong on screen and does not embed honestly in a PDF. This violates architecture invariant
12 (real fonts only).

**Fix:**
1. Ship 4–6 curated families with **all four real faces** (Regular, Bold, Italic, Bold
   Italic).
2. **Disable — do not fake —** a style with no file. The button greys out and says why.
3. A build check fails if a registered family is missing a face it advertises.

### ✅ Elements all display the same — CONFIRMED (D18)
One generic row for 31 dividers, 58 stickers, 20 icons, 12 borders, 8 patterns. A divider
(1400×41) is treated exactly like a square sticker. Full analysis in D18.

### Snap to grid / smart alignment guides
> *"I really love snap to grid but I don't think mine works. Smart alignment guides — I
> think they don't work."*

Kept as features, rebuilt. Under the Document model, snapping is a pure function on
geometry (candidate position → nearest guide), which is testable — unlike the current
Fabric-event approach.

### Margins and gutter guides
> *"Oh my God this is dysfunctional as hell. We have to have the margins. Some users want
> their stuff only inside the margin."*

Rebuilt with correct math for all six trims, both page sides, at every gutter band. This is
the foundation of the product's promise, so it gets the reference-table treatment (D8).

### Cover
> *"The cover really doesn't make sense at all."*

Already covered by D8 — four verified defects in the math, plus the guide overlay rebuild.

### Full-screen preview
> *"Full screen doesn't work. When I touch it, only the browser bars disappear, not the
> actual book."*

The preview must become a **true book preview**, modelled on KDP's own previewer: the
spread as a physical book, page-turn navigation, full-screen meaning *the book fills the
screen*, not merely browser chrome hiding.

### Text panel
> *"Not great. Two search boxes. It is really messed up."*

Rebuilt: one search, cleaner interface, and font styles that reflect what actually exists.

### Generator panels
> *"I hate it so much. Not the generators — everything around them."*

Full rebuild as one schema-driven panel (D5), with the live preview (D4).

### History / undo coverage
> *"Before that I couldn't undo or redo many things."*

Under the Command model every change is undoable by construction — this stops being a
feature that needs maintaining.

---

## 3. SIMPLIFICATIONS — decided by the owner

| Area | Decision |
|---|---|
| **Drag-and-drop** | Removed, including drag-and-drop PDF import. Simple beats clever. |
| **PDF import** | Kept, but via a normal file picker. Accept any PDF, not only low-content. |
| **Export format** | **PDF only.** No PNG, no JPG, no format picker. This is a print tool. |
| **Export output** | **Exporting downloads both files automatically** — interior and cover as separate PDFs. "Interior only" and "cover only" move into a drawer as secondary options. |
| **Export options** | Remove "transparent background". Keep print quality. Keep selectable/searchable text (it is what makes the PDF professional and costs nothing). |
| **Theme** | **One theme only** for v1. Owner to choose dark or light. Halves the visual QA surface. |
| **Templates panel** | Make the panel, search bar, top bar and sidebar **thinner** so template previews are larger and better displayed. |
| **Projects / save** | Make it more professional. |

---

## 4. TEMPLATES — specific work requested

1. **Previews are not representative.** Templates made early — especially daily planners
   and calendars — render as abstract shapes rather than what the page will actually look
   like. Previews must be **crisp and true to the printed result**, the way puzzle previews
   are.
2. **A preview button** on each template, working for both single-page and double-page
   (recto/verso) templates.
3. **Variants.** A template can offer variants — e.g. a lined template offering thinner or
   thicker rules. Selecting the template reveals its variants.
4. **Sizing.** Template thumbnails are currently too large; make them smaller so more fit,
   with the panel chrome thinned to give them room.

---

## 5. HOME SCREEN — the intended design

Simple now, beautiful later. Structure:

- **One large primary action: "Create a book."**
- Secondary quick paths: **"Create a puzzle"** and **"Create letters"** (handwriting).
  - Quick paths use the most basic inputs and defaults.
  - They produce **interior content only — no cover**.
  - The result opens in the editor, previewable and exportable, and the user can keep
    editing.
  - "Create letters" is template-driven and only opens in the editor.

### The Create-a-book dialog

Fields, all with defaults so a user can accept everything and proceed:
- Book / project name
- Trim size (six fixed)
- Paper: white / cream / groundwood / premium colour
- Binding: paperback / hardcover
- Page count
- **Default output: cover + interior.** Optionally interior-only or cover-only.

Then the editor opens with a real cover and real pages.

---

## 6. IDENTITY — "I want something that is mine"

> *"I want something unique, something mine — not like Canva. But the function has to be
> mine."*

The contextual toolbar and quick actions have good pieces (effects, grouping, colouring)
that the owner worked hard on, but they *"don't make sense in many areas."*

**Direction:** keep every capability that is loved, and reorganise around **book
production** rather than a generic design-app toolbar. The organising question for each
control is *"what does a publisher need at this moment?"* — not *"what does Canva put
here?"*

Combined with `ui-context.md`'s anti-vibecoded rules (no Inter, no purple, no Lucide, no
gradients), the result should be unmistakably Novelka.

---

## 7. Non-negotiables restated by the owner

- **Do not lose the valuable, unique work.** The loved surfaces in §1 are protected.
- **Clean and organised. No messiness.**
- **Real security**, not theatre (D15 §security).
- **Nothing that looks AI-generated.**
- **Simple.** Fixed sizes, no drag-and-drop, fewer options, everything decided in advance.
