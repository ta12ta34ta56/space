# Feature Inventory — every surface in the current app

> **Purpose.** The owner asked: *"Should I state everything that I like?"* The answer is
> yes — but you should not have to do it from memory. This file lists **every feature
> surface that exists**, measured from the code, so the decision is a review instead of a
> recall exercise.
>
> **How to use it.** Go down the KEEP / CUT / CHANGE column and mark each row. Anything
> marked KEEP is protected work and gets ported. Anything unmarked is a decision not yet
> made — the agent must ask, not guess.
>
> Status: **REVIEWED 17 August 2026.** All rows decided. No open DECIDE rows remain.

---

## 1. Editor — right dock

| Surface | What it does | Recommend | Owner |
|---|---|---|---|
| Pages tab | Thumbnails, drag-reorder, drop-line, insert gutters, duplicate, delete | **KEEP** (D17) | |
| Layers tab | Tree, grouping, expand/collapse, lock, hide, delete, reorder | **KEEP** (D17) | |
| Live thumbnails | IntersectionObserver + rAF-throttled, cached per page | **KEEP** (D17) | |
| Cover row | Wider flat thumbnail with spine width shown | **KEEP** | |
| Inspector panel | Per-element properties | **KEEP**, rebuilt per element kind (D18) | |

## 2. Editor — toolbars

| Surface | What it does | Recommend | Owner |
|---|---|---|---|
| Contextual bar | Bold, italic, underline, font family/size, text colour, stroke colour, stroke width, corner radius, duplicate, delete, larger/smaller | **KEEP** (D17) | |
| Align / distribute | Horizontal + vertical distribution, arrange | **KEEP** | |
| Text effects | Outline, drop shadow, neon | **KEEP** — verify each prints correctly | |
| "Select all in this puzzle instance" | Selects one puzzle's objects | **REPLACE** — unnecessary once a puzzle is one object (D3) | |
| Recolor / fill all | Bulk recolour | **KEEP** — becomes a style field | |
| Left rail | KDP, Bleed, Rulers, Grid, Snap, Guides, Margins toggles | **KEEP** (D17) | |
| Bottom bar | Zoom in/out, fit page, jump to page, run preflight | **KEEP** (D17) | |

## 3. Panels

| Panel | What it does | Recommend | Owner |
|---|---|---|---|
| Elements | Browse and insert: shapes, stickers, icons, patterns, borders, dividers | **KEEP** + fix D18 | |
| Shapes | Rect, rounded-rect, circle, ellipse, triangle, polygon, star, arrow, line | **KEEP** | |
| Text | Insert and style text | **KEEP** | |
| Lines | Ruling styles (14 rulings) | **KEEP** | |
| Template | Browse and apply templates | **KEEP** (D13) | |
| Generator hub | Choose a generator | **KEEP**, rebuilt schema-driven (D5) | |
| Pages | Page management | **KEEP** — merged into the dock | |
| Layers | Layer management | **KEEP** — merged into the dock | |
| History | Undo history list | **KEEP** — owner confirmed | ✅ KEEP |
| Upload | User image upload | **KEEP** — with strict validation (D15) | ✅ KEEP |
| Settings | Book size, paper, binding, pages, cover, spine text, background, rulers | **KEEP** | |

## 4. Modals

| Modal | What it does | Recommend | Owner |
|---|---|---|---|
| New Book | Trim, paper, binding, page count | **KEEP** | |
| Export | Interior + cover PDF, page ranges, DPI | **KEEP** | |
| Preview mode | Single / spread / grid, zoom | **KEEP** — a genuine strength | |
| Add pages | Bulk page insertion | **KEEP** | |
| Page numbers | KDP-mirrored odd/even numbering | **KEEP** | |
| Cover wizard | Guided cover setup | **KEEP**, rebuilt on correct math (D8) | |
| Template library | Browse templates with previews | **KEEP** (D13) | |
| Import PDF | Import pages from a PDF | **CUT** — owner confirmed. Removes pdfjs-dist (1.3 MB). | ❌ CUT |
| Help | In-app help | **KEEP** | |
| Projects | Open / manage saved books | **KEEP** | |
| Quick word-search wizard | 44.8 KB bespoke flow for ONE generator | **CUT** — either all five get it from the schema, or none | |
| Auth | Sign in / sign up | **CUT** from v1 (D6) | |
| Rating | Star rating dialog | **CUT** from v1 | |
| Admin panel / Owner gate | Admin surfaces | **CUT** (D12) | |

## 5. Home screen

| Surface | What it does | Recommend | Owner |
|---|---|---|---|
| Create view | Start a new book | **KEEP** | |
| Projects view | Recent books with thumbnails | **KEEP** | |
| Templates view | Browse templates before creating | **CUT** — duplicate of the in-editor library | ❌ CUT |
| Quick create | One-click generator start | **KEEP** — produces a complete interior (D24) | ✅ KEEP |
| Social links footer | Creator profiles | **CUT** from v1 | ❌ CUT |

## 6. Engine capabilities

| Capability | Recommend | Owner |
|---|---|---|
| Multi-page canvas, unlimited undo/redo (200 steps) | **KEEP** | |
| Layers, groups, smart guides, align/distribute | **KEEP** | |
| Zoom 10–500%, DPR-aware, 2× supersampling capped at 4096px | **KEEP** — hard-won | |
| PDF export with real selectable text | **KEEP** | |
| PNG / JPG export, page ranges | **KEEP** | |
| KDP guides, preflight, spine calculator, trim presets | **KEEP** — cover math rebuilt (D8) | |
| 130 recolourable SVG assets | **KEEP** | |
| Font scanner / local fonts | **KEEP** — owner confirmed. Real faces only (D20). | ✅ KEEP |
| PDF import | **CUT** — owner confirmed | ❌ CUT |
| 20 page templates, 14 rulings | **KEEP** (D13) | |
| IndexedDB storage + migration + StorageFullError | **KEEP** | |
| Theme system | **CHANGE** — dark only in v1 (D23). Keep the no-flash inline script. | |
| Error boundary with "download my work" | **KEEP** | |

## 7. Generators

| Generator | Algorithm | Layout | Panel |
|---|---|---|---|
| Word search | **PORT** — 30 checks, 14 banks | **REBUILD** (D14) | **REBUILD** schema-driven |
| Sudoku | **PORT** — proven unique, 4×4/9×9/16×16 | **REBUILD** | **REBUILD** |
| Crossword | **PORT** — 42 checks, 10 banks / 260 clues | **REBUILD** — overlap bug (D14) | **REBUILD** |
| Maze | **PORT** — 52 checks, 4 shapes | **REBUILD** | **REBUILD** |
| Handwriting | **PORT** — 94 checks | **REBUILD** | **REBUILD** |

---

## What to do with this file

1. Mark the **Owner** column on every row: KEEP, CUT, or CHANGE.
2. Anything marked **DECIDE** is a genuine open question — answer it or it becomes an
   entry in `progress-tracker.md`.
3. Once reviewed, every KEEP row is protected work under D17's porting rule.
4. **Nothing in this app gets deleted because it was forgotten.** That is the entire point
   of writing it down.
