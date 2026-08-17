# Project Overview — Novelka

> What Novelka is, why it exists, and what is in and out of scope. When a spec is
> ambiguous, resolve it against this file. **If a feature is not listed here as in scope,
> do not build it.**

---

## Overview

Novelka turns a book idea into a **print-ready KDP file in minutes instead of days**. The
user picks a standard trim size, paper and page count; Novelka opens an editor with the
interior and an adaptable cover already correct. They choose a generator (word search,
sudoku, crossword, maze, handwriting) or a template, adjust how it looks in a live
preview, and generate the whole book at once. Every page is laid out inside Amazon's safe
area automatically — margins, gutter, bleed and spine are computed, not guessed. The user
edits what they want, runs preflight, and exports two KDP-valid PDFs: interior and cover.

Novelka is for self-publishers, small publishing businesses, and people who cannot afford
$29-a-month design tools. It replaces manual layout work, KDP-rule research, and the
uncertainty of not knowing whether a file will be rejected.

**It is a book production instrument, not a graphic design app.**

---

## Goals

1. **A complete, valid book in under 60 seconds** from opening the app to a downloaded PDF,
   using defaults only.
2. **KDP-valid by construction.** Not "the user can check" — the user *cannot produce* an
   invalid interior through normal use. Margins, gutter, bleed, spine, page-count limits
   and minimum line weights are enforced by the system.
3. **Editable without being dangerous.** Colour, thickness, size, font and position are all
   adjustable, and every reachable combination still prints correctly.
4. **No manual measurement, ever.** The user never types a margin, calculates a spine, or
   looks up a trim specification.
5. **Affordable and low-friction.** Runs entirely in the browser. No account needed to
   build. No subscription required to try it.
6. **Boring reliability.** No crashes, no dead controls, no half-finished features. The app
   is small enough to be trustworthy.

---

## Core User Flow

1. **Land on the home screen.** Two paths: **Create a book** (full control) or **Quick
   create** (one generator, sensible defaults, straight to a finished book).
2. **New Book dialog.** Four inputs, all with defaults:
   - **Trim size** — one of six fixed KDP sizes (default 6×9)
   - **Interior** — black ink on white / cream / groundwood, or premium colour
   - **Binding** — paperback (hardcover only if verified; see Out of Scope)
   - **Page count** — validated against KDP's minimum (24) and the paper's maximum
3. **The editor opens with the book already real** — the interior at the chosen trim with
   correct margins, and a cover whose spine is already computed from the page count.
4. **Choose a generator or a template.** Templates adapt to the chosen trim; options that
   cannot fit at that trim are not offered.
5. **Set style in a live preview.** One real puzzle renders with the actual settings —
   border thickness, colours, fonts, grid weight. What is shown is what will be produced.
   If a setting cannot fit, Novelka says so *here*, with the fix, before anything is built.
6. **Generate.** Every puzzle page, every answer page, is produced at the interior trim
   size in that exact style, laid out inside the safe area.
7. **Edit.** Reorder pages, restack layers, move and resize elements **inside the safe
   area**, restyle any puzzle (one change updates that puzzle; "apply to all" updates the
   book in one undoable step).
8. **Guides on demand.** Toggle bleed, trim, safe area, gutter, spine and barcode overlays.
   They render **above** the page so a mistake is impossible to miss, and they are never
   printed.
9. **Preflight.** A plain-language report: what is wrong, which page, and how to fix it.
10. **Export.** Interior PDF and cover PDF as separate files, as KDP requires.

---

## Features

### Book setup
- Six fixed KDP trim sizes; no custom sizes.
- Paper and binding selection with KDP's real page-count limits enforced.
- Cover created with the book, spine width derived from page count and paper.
- **Page-count changes are handled honestly.** KDP's gutter widens in bands (0.375" up to
  150 pages, 0.5" to 300, 0.625" to 500). Crossing a band changes the safe area of every
  page. Novelka locks the band chosen at creation, warns when a change crosses it, and
  offers to re-flow — it never silently invalidates work, and never silently moves it.

### Generators
Word search, sudoku, crossword, maze, handwriting. Each provides:
- A **live style preview** before generating.
- **Fit-sensing** — only options that fit the current trim are offered; a layout that
  cannot fit reports the reason instead of overflowing.
- Answer keys, placed per the chosen solution setting.
- A generated puzzle is **one object** with its own data and style, so it stays tidy and
  stays editable at the same time.

### Templates
- Parametric page designs that adapt to every supported trim, verified by audit.
- Preview before applying; apply to one page, a range, or all pages of a kind.
- Planned, not v1: **double-page spread templates** (paired recto/verso) — the page model
  carries recto/verso from day one so these can be added without a rewrite.

### Editing
- Pages panel: add, duplicate, delete, drag-reorder.
- Layers panel: drag-restack, lock, hide.
- Select, move, resize, recolour — **constrained to the safe area**, with snapping.
- Contextual toolbar for the current selection: font, size, weight, colour, stroke,
  alignment, duplicate, delete.
- Undo / redo across everything.
- Snap to safe area, trim, spine, gutter, grid and other elements.

### Print correctness
- Guides overlay: bleed, trim, safe area, gutter, spine fold, barcode keep-out —
  always drawn above content, never exported.
- **Bleed is a toggle in the editor**, not a question at creation, because the user does
  not yet know the answer when the book is created.
- Preflight: safe area, gutter, page count, minimum line weight, image resolution,
  cover/interior separation.
- PDF export with real embedded fonts and selectable text; interior and cover as separate
  files.

### Storage
- Projects saved in the browser (IndexedDB), autosaved.
- Honest failure when storage is full, with a "download my work" escape.
- Books saved in older versions always open.

---

## Scope

### In scope
- The **engine**: create → generate → edit → preflight → export.
- Six fixed trims, five generators, parametric templates, cover with correct spine math.
- Guides, snapping, safe-area-constrained editing, preflight, PDF export.
- Local storage of projects. Light and dark themes.
- A sign-in **button** in the UI, and a single seam in the export flow where a gate can
  later be added.

### Out of scope
- **Payments, subscriptions, pricing tiers.** Deferred by decision, not forgotten.
- **Accounts, cloud sync, any backend.** v1 is a static site with no servers to operate.
- **Admin back-office, marketplace, collaboration.**
- **Free-form graphic design.** No arbitrary canvas composition. Novelka produces books.
- **Custom trim sizes.** Ever.
- **Hardcover**, unless its geometry (wrap, hinge, board thickness, board overhang) can be
  verified against reference values. Paperback-only is honest; a rejected upload is not.
- **AI-generated puzzle content.** The generators are rule-based and deterministic.
- **Mobile-first.** Desktop tool, responsive to tablet, honest message below that.
- **A large template library** in v1. Port what exists, prove the pipeline, add designs last.

---

## Success Criteria

1. A first-time user with no instructions produces a valid, exportable book in **under
   60 seconds** using defaults.
2. **Zero invalid interiors are reachable through normal use.** Across every generator,
   every template, all six trims, recto and verso, at every gutter band: no content
   outside the safe area, no lines under 0.75pt, no overlapping elements.
3. Every generated cover matches Amazon's own cover template for the same trim, paper and
   page count, verified against a reference table in the test suite.
4. A user can change a puzzle's colour, border thickness, font and position, apply it to
   the whole book in one action, undo it in one action, and the result still passes
   preflight.
5. A full session — create, generate 50 puzzles, edit, preflight, export — completes with
   **no console errors and no crashes**.
6. Every visible control does something real. No dead sliders, no disabled "coming soon".
7. A book saved today opens correctly after any future schema change.
8. Preflight never reports a pass it did not verify.
