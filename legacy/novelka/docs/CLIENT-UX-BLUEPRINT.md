# Novelka Client UX Blueprint (v1.0)
**Calm, Automation-First Customer Experience for Automated Book Production**

---

## 1. Product Positioning & Core Customer Journey

### 1.1 Positioning
**Novelka is an automated, affordable book-production platform for Amazon KDP and print-ready low-content books.**

It is **not** a general-purpose graphic design tool, a Canva clone, or a loose canvas editor. The primary product promise is:
> **Idea $\to$ Configured Book $\to$ Automatically Generated Content $\to$ Intelligently Formatted Pages $\to$ Validated Export.**

### 1.2 The Golden Customer Journey
For authors and publishers, the complete lifecycle of creating a book is designed to generate in seconds for supported configurations without touching a manual canvas tool:

```text
[ 1. Home / Create Book ]
          │
          ▼
[ 2. Quick Mode Wizard ] ── (Select theme, words, validated print size, volume, style preset)
          │
          ▼
[ 3. Automated Generation ] ── (Pure responsive layout solver computes all pages in seconds)
          │
          ▼
[ 4. Full-Book Spread Preview ] ── (Inspect recto/verso gutter margins and page flow)
          │
          ▼
[ 5. Preflight Verification ] ── (Automated safe-area & readability validation)
          │
          ▼
[ 6. 1-Click PDF Export ] ── (Separated Interior PDF and Wraparound Cover PDF)
          │
          └─► [ Optional: Open in Advanced Editor ] ── (Only for manual granular overrides)
```

### 1.3 Core Experience Principle
**The canvas editor is not the first experience.**
Users who want a finished, validated word-search book are guided through an automation-first workflow. Quick Mode and preview are responsive across laptop, tablet, and mobile devices; advanced canvas editing is initially desktop/laptop focused. The Advanced Editor exists strictly as an opt-in inspection and customization workspace.

---

## 2. Top-Level Customer Navigation

To keep the application calm, focused, and intuitive, the top-level navigation is constrained to four core areas:

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  [✦ Novelka]       Home       Create       Projects       Templates         [Help]   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

| Navigation Item | Purpose | Target Destination |
| :--- | :--- | :--- |
| **Home** | Dashboard, primary "Create a Book" action, recent project continuation, trust message. | `/` (Home Dashboard) |
| **Create** | Generator Hub & direct entry into Quick Mode creation wizards. | `/create` (Generator Hub) |
| **Projects** | Saved projects, draft books, quick export, and project management. | `/projects` (Project Library) |
| **Templates** | Gallery of published parametric templates with specs and size guides. | `/templates` (Template Showcase) |
| **Help** *(Secondary)* | Formatting reference, validated print size guide, gutter margin guidelines. | `/help` (Help Drawer/Modal) |

*Out of Scope for Navigation:* No billing, subscriptions, ads, or admin dashboard links are shown in user navigation.

---

## 3. Screen-by-Screen Information Architecture

```text
                                 ┌──────────────┐
                                 │  Home Screen │
                                 └──────┬───────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
          ┌───────────────────┐                   ┌───────────────────┐
          │   Generator Hub   │                   │  Recent Projects  │
          └─────────┬─────────┘                   └─────────┬─────────┘
                    │                                       │
                    ▼                                       │
          ┌───────────────────┐                             │
          │ Quick Mode Wizard │                             │
          │ (Steps 1 to 6)    │                             │
          └─────────┬─────────┘                             │
                    │                                       │
                    ▼                                       │
          ┌───────────────────┐                             │
          │ Generation Screen │                             │
          └─────────┬─────────┘                             │
                    │                                       │
                    ▼                                       │
          ┌───────────────────┐                             │
          │ Full-Book Preview │ ◄───────────────────────────┘
          └─────────┬─────────┘
                    │
          ┌─────────┴─────────┐
          ▼                   ▼
┌───────────────────┐   ┌───────────────────────┐
│ Preflight & Export│   │ Open in Canvas Editor │
│ (Download PDFs)   │   │ (Granular Overrides)  │
└───────────────────┘   └───────────────────────┘
```

---

### Area 1: Home Screen
**Purpose:** Provide an immediate, welcoming starting point where the user can launch a new book in one click or resume their previous work.

**Layout & Hierarchy:**
1. **Hero Action Card:**
   - Heading: *"Create a Print-Ready Book in Seconds"*
   - Subtitle: *"Automated formatting for word searches and low-content books with automatic gutter calculation and preflight checks."*
   - Primary CTA: `[ ✨ Create a Word-Search Book ]` (Launches Quick Mode Wizard).
   - Secondary Link: `Browse Templates` or `Explore All Generators`.
2. **Continue Recent Project (if active/recent project exists):**
   - Compact resume card with book title, validated print size, page count, last modified date.
   - Quick actions: `[ Resume Preview ]` · `[ Export PDF ]`.
3. **Quick Generator Showcase:**
   - **Word Search:** Active (Instant 1-Click creation).
   - **Sudoku, Crosswords, Mazes, Handwriting:** Marked as *Planned / Advanced in Editor*.
4. **Trust & Formatting Reassurance:**
   - *"Novelka Preflight Engine: Automatic gutter calculation and preflight checks, minimum text readability (6pt), and interior/cover PDF separation."*

---

### Area 2: Create Book Entry & Generator Hub
**Purpose:** Group book types by customer output rather than internal code modules.

**Categories:**
1. **Puzzle Books:**
   - **Word Search Book (Active):** 1-Click Book Creation, multiple puzzles per page, back-of-book answer keys, 5 validated print sizes.
   - **Sudoku Book (Secondary / Editor):** 4 difficulty tiers, 4×4 to 16×16 grids.
   - **Crossword Book (Planned):** Auto-dense crossword generation.
   - **Maze Book (Planned):** Perfect solvable mazes with answer paths.
2. **Activity & Educational Books (Future):**
   - Handwriting practice worksheets & letter tracing books.
3. **Journals & Notebooks (Future):**
   - Lined journals, dot-grid notebooks, logbooks.

---

### Area 3: Quick Mode Word-Search Wizard (Detailed Step Definitions)

The wizard is structured into **6 clear setup steps**, followed by automated generation, interactive spread preview, and preflight export. Note that Phase 7B will refine this existing Quick Mode rather than creating a duplicate implementation.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Quick Word Search Creator                                                Step 1 of 6   │
│ [1. Concept] ── [2. Words] ── [3. Format] ── [4. Solutions] ── [5. Style] ── [6. Review]│
└────────────────────────────────────────────────────────────────────────────────────────┘
```

#### Step 1: Book Concept
- **Purpose:** Define the book identity and top-level titling.
- **Visible Controls:**
  - `Book Title *` (Text input, e.g. "The Big Botanical Word Search Book").
  - `Theme / Subtitle` (Optional text input, e.g. "50 Relaxing Nature Puzzles with Full Solutions").
- **Defaults:** Title: "Word Search Book", Subtitle: "".
- **Validation:** Title is required (non-empty string).
- **Errors:** "Book title is required."
- **User Understanding:** The title appears on interior headers and cover pages; subtitle appears under single-puzzle titles.
- **Hidden/Advanced:** Custom header positioning, spine text calculations.

#### Step 2: Words & Themes
- **Purpose:** Configure the word pools that populate the book.
- **Visible Controls:**
  - Segmented toggle: `[ Curated Themes (Built-in) ]` | `[ Custom Word List ]`
  - *If Curated:* Category chips (Animals, Flowers & Garden, Ocean Life, Space, Food, etc.) with word count badges, "Select All", "Clear".
  - *If Custom:* Multiline textarea supporting comma, semicolon, or newline separated words, live valid-word counter.
- **Defaults:** Curated themes (Animals, Garden, Ocean).
- **Validation:**
  - Curated: At least 1 theme selected.
  - Custom: At least 4 valid words provided.
- **Errors:** "Please select at least one theme category" or "Please provide at least 4 valid words".
- **User Understanding:** Novelka automatically distributes words evenly across all puzzles in the volume.

#### Step 3: Format & Volume
- **Purpose:** Select validated print dimensions and target puzzle volume.
- **Visible Controls:**
  - Validated print size cards:
    - `6 × 9 in` (432 × 648 pt) — Standard paperback.
    - `8.5 × 11 in` (612 × 792 pt) — Large print / Big book.
    - `8 × 10 in` (576 × 720 pt) — Activity book standard.
    - `A4` (595 × 842 pt) — International standard.
    - `7 × 9 in` (504 × 648 pt) — Custom medium.
  - Number of puzzles: Preset chips (`10`, `25`, `50`, `100`) + custom number input (1–300).
  - Puzzles per page: `1 Puzzle per page` (Standard) | `2 Puzzles per page` (Large books).
  - **Live Allocation Calculator Box:**
    - `X Puzzle Pages` + `Y Solution Pages` = `Z Total Interior Pages`.
    - KDP page count band indicator ($\le 150$, $151–300$, $301–500$).
- **Defaults:** `kdp6x9` (6×9 in), 25 puzzles, 1 puzzle per page.
- **Validation:** Puzzle count between 1 and 300; trim size in validated list.
- **User Understanding:** Novelka enforces Amazon KDP's 24-page minimum binding rule automatically.

#### Step 4: Solutions & Placement
- **Purpose:** Define how the answer key is formatted and arranged.
- **Visible Controls:**
  - Arrangement options:
    - `Back of Book (Recommended)`: Compact 4-up/6-up solution grids grouped at the end.
    - `After Each Puzzle`: Alternates puzzle page $\to$ solution page.
    - `No Solutions`: Puzzle pages only.
  - Solutions per page: `4-Up` | `6-Up` | `9-Up` (auto-selected based on trim size).
- **Defaults:** Back of Book, 4 puzzles per solution page.
- **User Understanding:** Answer keys include circled letter paths and correspond to puzzle numbers.

#### Step 5: Visual Style & Template
- **Purpose:** Select the overall aesthetic and published parametric template.
- **Visible Controls:**
  - Style Presets:
    - `Classic Book`: Georgia serif, clean borderless grid, 3-column bank, traditional ink.
    - `Modern Clean`: Inter sans-serif, ruled grid lines, contemporary spacing.
    - `Playful / Kids`: Boxed cells, checklist tick-boxes, bolder frame rules.
  - Template card: Displays active resolved parametric template (e.g. `Classic Word Search v1.0.0`).
  - Letter case: `UPPERCASE` | `lowercase`.
  - Print Folios toggle: `[x] Print Page Numbers (Folios)`.
- **Defaults:** Classic preset, uppercase, folios enabled.
- **User Understanding:** The chosen style governs all interior pages uniformly.

#### Step 6: Review & Summary
- **Purpose:** Present an honest, complete overview before computation.
- **Visible Controls:**
  - Summary card detailing: Title, Trim Size, Puzzle Count, Page Allocation (e.g. "20 Puzzles + 4 Solutions = 24 Pages"), Solution Arrangement, Style Preset, Gutter Safe Policy.
  - Primary CTA: `[ ✨ Generate Complete Book ]`
  - Back button to adjust any step.

---

### Area 4: Generation Progress & Solver Computation
**Purpose:** Provide reassuring feedback during deterministic puzzle and layout generation.

**Behavior:**
- Animated progress bar indicating exact progress: *"Generating puzzle 14 of 50 with responsive layout solver..."*
- Non-blocking execution (under 1 second for 25 puzzles).
- `[ Cancel ]` button allowing graceful abortion.
- Immediate error trapping with actionable feedback if layout constraints cannot be satisfied.

---

### Area 5: Full-Book Spread Preview
**Purpose:** Allow the user to inspect every page of the generated volume before exporting.

**Controls & Features:**
- **Two-Page Spread View:** Renders verso (left) and recto (right) pages side-by-side with realistic spine gutter offsets.
- **Page Navigator:** Previous / Next buttons, page number jump input, range slider.
- **Page Metadata Tag:** Identifies active page role (`Page 1 · Puzzle 1 (Recto)`, `Page 24 · Answers 1-4 (Verso)`).
- **Zoom Controls:** Fit to Screen, 100% scale.
- **Status Indicator:** Shows green `Novelka Preflight: Passed` badge.

---

### Area 6: Preflight Result & Actionable Diagnostics
**Purpose:** Guarantee print-readiness before the user leaves the application.

```text
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ Preflight Status: Passed (0 Errors, 0 Warnings)                                       │
│ ✓ 24 Interior Pages (6 × 9 in)      ✓ Gutter Margins Safe (27pt Spine)                 │
│ ✓ Minimum Text Size (11pt / 15pt)   ✓ All Solutions Present (20/20)                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

**Diagnostic States:**
1. **Pass State (Green):**
   - Text: *"Preflight passed — Ready for Novelka export checks."*
   - Export buttons enabled.
2. **Warnings State (Amber):**
   - Non-blocking advisory items (e.g. *"Odd page count: 25 pages. KDP rounds to 26 pages in binding"*).
   - Guidance on how to add a blank page for spread alignment.
3. **Blocked State (Red):**
   - Hard error blockers (e.g. `TEXT_OUTSIDE_SAFE_AREA`, `UNREADABLE_TEXT`, `MISSING_SOLUTION`, `OVERLAPPING_INSTANCES`).
   - Detailed list of affected page numbers with direct `[ Jump to Page ]` links.
   - Primary action: `[ Open in Canvas Editor to Fix ]` or `[ Adjust Setup ]`.

---

### Area 7: Export Experience
**Purpose:** Provide strict, compliant PDF downloads ready for Amazon KDP upload.

**Export Options:**
1. **Interior PDF (`.pdf`):**
   - Contains all interior puzzle and solution pages.
   - Strictly excludes cover pages.
   - Formatted to exact trim size PDF points with embedded subset fonts (`@pdf-lib/fontkit`).
2. **Wraparound Cover PDF (`.pdf`):**
   - Exported separately with exact spine width calculated from interior page count.
3. **Download All / Zip Package:**
   - Bundles Interior PDF, Cover PDF, and metadata summary sheet.

---

### Area 8: Advanced Editor Entry & Transition
**Purpose:** Seamless transition for users who want to make granular, object-level adjustments.

**Entry Points:**
- `[ Open in Canvas Editor → ]` button on Preview and Preflight screens.
- Context menu action: `Customize on Canvas`.

**Transition & State Persistence:**
1. Pages and semantic `GeneratedInstance` objects are loaded directly into `CanvasStore`.
2. The user can select letters, move word banks, recolor elements, or reflow individual pages.
3. **Non-Destructive Return:** The top header includes `[ ← Back to Book Overview ]`. All custom overrides (`letterColor`, offsets) are preserved in `GeneratedInstance.overrides`.

---

### Area 9: Recent Projects Library
**Purpose:** Allow users to manage multiple books and resume production.

**Features:**
- Project grid/list with visual cover/first-page thumbnails.
- Book title, trim size badge, page count badge, last edited timestamp.
- Quick actions:
  - `[ Open Preview ]`
  - `[ Export PDF ]`
  - `[ Duplicate ]`
  - `[ Delete ]`

---

## 4. State Definitions & Error Recovery

| State | User Experience | Recovery Action |
| :--- | :--- | :--- |
| **Empty State (No Projects)** | Friendly illustration with "Create Your First Book" primary button and pre-loaded template previews. | Click "Create Word Search Book". |
| **Empty State (Custom Words)** | Placeholder with sample flower/animal words and a 1-click `[ Insert Sample Word List ]` link. | Insert sample words or paste list. |
| **Validation Error** | Inline red field message with helpful explanation under the invalid input. | User corrects title/word input; button re-enables instantly. |
| **Solver Squeeze / Small Page** | Notification: *"Puzzles exceed available space at minimum 12pt cell size."* | Automatic suggestions: Reduce word count, select larger trim (8.5×11), or scale font. |
| **Draft Template Selection** | In production mode, draft templates display a fallback notice: *"Using Classic published template for print safety."* | Resolves published template automatically. |
| **Preflight Blocker** | Red alert panel detailing exact error codes and affected page numbers. | Click "Open in Editor to Fix" or "Adjust Setup". |

---

## 5. Visual & Design Principles

Novelka's interface is designed for **calm, professional focus**:

1. **Spacious & Uncrowded:** Ample whitespace, clear vertical rhythm, generous padding on cards and modal dialogs.
2. **Calm Palette:** Neutral slate/zinc backgrounds (`#0f172a`, `#1e293b`, `#ffffff`, `#f8fafc`), warm indigo accents (`#6366f1`), muted borders (`#334155` / `#e2e8f0`).
3. **Honest Copy:** Never promise *"100% Amazon Guaranteed"*. Always use truthful copy: *"Novelka Preflight: Passed"*, *"Export checks passed"*, *"Warnings require review"*.
4. **Distinct Identity:** Purpose-built for books. No floating decorative stickers, no irrelevant marketing widgets, no Canva-style clip art bloat.

---

## 6. Responsive Behavior Across Formats

| Device / Viewport | Layout & Adaptations |
| :--- | :--- |
| **Desktop / Laptop ($> 1200\text{px}$)** | Full dual-pane preview: Left pane shows controls/diagnostics, right pane shows interactive two-page spread. |
| **Tablet ($768\text{px} - 1199\text{px}$)** | Single-page preview with horizontal filmstrip navigation; stacked wizard cards with sticky footer actions. |
| **Narrow / Mobile ($< 768\text{px}$)** | Step-by-step full-width cards; touch-friendly target size ($\ge 44\text{px}$); single page vertical swipe preview. |
| **Keyboard Accessibility** | Full `Tab` order through inputs; `Enter` advances wizard steps; `Esc` closes modals; `Left`/`Right` arrow keys navigate preview pages. |

---

## 7. What is Explicitly Out of Scope

To prevent scope creep and maintain architectural purity:
1. **No Payments / Subscriptions / Ads:** No Stripe checkout, paywalls, or ad banners in this phase.
2. **No Admin Dashboard:** No user-management portals or analytics dashboards.
3. **No Multi-Generator Expansion:** Only the Word Search pipeline is active in this phase.
4. **No Template Marketplace:** No user upload or public marketplace mechanics.

---

## 8. Recommended Implementation Order (Phased Delivery)

```text
Phase 7A: Navigation Shell & Home Dashboard
  ├── Top-level navigation bar (Home, Create, Projects, Templates)
  └── Home screen with Hero Create CTA & Recent Project cards

Phase 7B: Refined Quick Mode Wizard Flow
  ├── 6-step guided wizard modal with allocation calculator
  └── Live progress indicator during responsive solver generation

Phase 7C: Dedicated Full-Book Spread Preview & Preflight Screen
  ├── Two-page recto/verso spread viewer with spine gutter simulation
  └── Integrated preflight checklist & separated PDF export downloads

Phase 7D: Project Persistence & Management
  ├── Save/load project state in IndexedDB / local storage
  └── Projects Library view with duplicate/export actions

Phase 7E: Polish & Verification
  ├── Full accessibility & keyboard navigation audit
  └── Non-browser integration test suite for client user flows
```

---
*End of Blueprint — Awaiting explicit user approval before beginning implementation.*
