# Novelka — Phase 1 (Core Canvas Editor MVP)

Build print-ready puzzle and low-content books for Amazon KDP.
Every puzzle lands on the canvas as ordinary editable objects.

A lightweight, Canva-inspired PDF editor. This repository currently implements
**Phase 1** of the product plan: a fully working drag-and-drop canvas editor with
multi-page documents and print-quality PDF/PNG/JPG export — no backend required.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production bundle
npm run preview
```

---

## What's implemented

### Canvas engine (`src/engine/canvas-engine.ts`)
A single Fabric.js wrapper that the whole app talks to. Nothing else imports
Fabric for behaviour, so the engine can be swapped without touching the UI.

- Add text, shapes (rect, rounded rect, circle, ellipse, triangle, star, N-sided
  polygon, line, arrow), images, SVG stickers/icons/borders
- Move, resize (corner + edge handles), free rotation, flip X/Y
- Multi-select (shift-click, marquee), group / ungroup
- Align left/center/right/top/middle/bottom — to the page for one object, to the
  selection bounds for many
- Distribute horizontally / vertically with equal spacing
- Smart guides with element + page-centre snapping, optional snap-to-grid
- Bring forward / to front / send backward / to back, plus drag-to-reorder layers
- Copy, cut, paste, paste-in-place offset, duplicate, **copy style / paste style**
- Zoom 10 %–500 % with `Ctrl` + wheel, slider, and fit-to-screen

### Home screen (`src/components/HomeScreen.tsx`)
The app opens on a landing page: hero, "start something new" size cards,
template gallery, recent projects (from local storage) and a feature grid.
Click the brand mark in the editor to come back to it.

### PDF import (`src/engine/pdf-import.ts`)
Open an existing PDF and build on top of it. Each PDF page becomes a Novelka
page at its original point size, with the rendered artwork placed as a **locked
background image** — a normal canvas element, so unlocking it in the Layers
panel lets you move or delete it. Import at 72/144/216 DPI, and either append to
the current document or replace it. Uses PDF.js v4 (v5 needs `Uint8Array.toHex`,
which most browsers don't ship yet).

> Text in an imported PDF is rasterized, not re-editable. Extracting the
> original vector text as live text objects is a Phase 3 item.

### Page strip (`src/components/canvas/PageStrip.tsx`)
A Canva-style filmstrip pinned along the bottom: live thumbnail of the page
you're on, offscreen-rendered thumbnails for the rest, drag to reorder,
hover for duplicate/delete, "Add page" at the end, and a chevron that
collapses the whole strip to a slim bar.

### KDP cover creator (`src/services/kdp-cover.ts`)
**Cover** in the top bar opens a calculator that builds a print-ready wraparound
cover — back + spine + front on one flat sheet with 0.125" bleed.

Spine width uses Amazon's own per-page multipliers (white 0.002252", cream
0.0025", premium colour 0.002347") and is **verified against KDP's published
figures**: 6 × 9 at 200pp on white produces a 12.700" × 9.250" cover, exactly
what Amazon's own calculator gives.

A project holds **exactly one cover**. It's tagged `role: 'cover'`, pinned to
the front of the page strip with a purple badge, and deliberately kept out of
the interior: page numbering skips it, "apply to all pages" for templates and
rulings leaves it alone, bulk-add never copies or precedes it, and pre-flight
measures the interior only. Running the wizard again *replaces* the cover
rather than adding a second.

**Cover and interior download as separate PDFs** — the two uploads KDP asks
for — while both live in one workspace. The export dialog has **Interior /
Cover / Everything** presets that set the page range and tag the filename
(`my-book-interior.pdf`, `my-book-cover.pdf`). Standing on the cover page opens
the dialog already set to Cover.

Verified end-to-end: a 27-page project exports `interior.pdf` at 26 pages ×
6.000" × 9.000" and `cover.pdf` at 1 page × 12.309" × 9.250".

The home screen has a **Design a book cover** entry — both a hero button and a
dedicated card — that opens a fresh project straight into the cover creator, for
people who only want a cover.

Pick trim size, page count (or pull it from your interior), paper stock and
paperback/hardcover; a live diagram shows the three panels as you change them.
The generated page includes title, subtitle and author text, a back-cover blurb,
the **barcode keep-out box**, rotated spine text (only when KDP allows it at
100+ pages) and optional trim / fold / safe-area guides. Warnings flag page
counts below 24, above 828, or too thin for spine text.

### Full-screen preview (`src/components/modals/PreviewMode.tsx`)
**Preview** opens a reader over the whole app with three views: one page,
**true two-page spreads** (page 1 alone, then 2–3, 4–5… like a real book), and
a grid of every page. Pages render offscreen to images so a 200-page interior
scrolls smoothly. Arrow keys turn pages, `1`/`2`/`3` switch view, double-click
jumps into the editor, `Esc` closes, and there's real browser fullscreen.

### Lines & grids (`src/services/rulings.ts`)
**14 named rulings** at real published measurements, not approximations:

| Group | Rulings |
|---|---|
| Writing | College (7.1 mm), Wide (8.7 mm), Narrow (6.35 mm), Handwriting practice (solid baseline + dashed midline), Cornell notes, Two-column, Blank |
| Grids | Dot grid (5 mm), Graph paper, Quad with bold every 5th, Isometric 30° |
| Specialty | Music staves, Storyboard, Recipe layout |

Live controls for **colour, spacing (60–200%) and line weight (0.5–3×)**, and
the same **This page / All / Blank only** scoping as templates. Rulings respect
the KDP safe area by default, or switch to a plain margin. Everything lands as
ordinary line elements you can restyle afterwards.

### KDP templates & master pages (`src/services/templates.ts`)
**20 templates** in six categories — lined, dot grid, graph, sketch+write,
guided journal, habit tracker, weekly planner, checklist, worksheet, puzzle
page, two-column, title page, bold cover, certificate.

Six of them are **premium planner layouts** modelled on what KDP planner
sellers actually ship — Daily planner (hourly schedule + priorities + to-do +
notes), Half-hour schedule with meal tracker, Productivity pad, Weekly spread,
Monthly calendar and Gratitude & reflection. These use colour-coded panel
headers and are gated `ad_unlock` / `premium_only`.

Templates marked **KDP** lay themselves out inside the safe area and are rebuilt
**per page**, so the gutter sits on the correct side for left and right pages
automatically.

**Apply to** works as a master page:

| Scope | Effect |
|---|---|
| This page | Current page only |
| All *n* | Every page — a 120-page lined journal in one click |
| Blank only | Fills empty pages, leaves designed ones alone |

Everything lands as ordinary editable canvas elements.

### KDP guides & pre-flight (`src/services/kdp.ts`)
Amazon rejects interiors with content in the gutter, so the canvas shows a live
**safe-area box**, a hatched **gutter strip** on the correct side per page, and
an optional **0.125" bleed** zone. Gutter width follows KDP's own table and
grows with page count (0.375" up to 150 pages → 0.875" past 700).

The export dialog runs a **pre-flight check**: non-standard trim size, mixed
page sizes, page count outside 24–828, and content straying outside the safe
area. Toggle the guides with the **KDP** and **Bleed** buttons in the toolbar.

### Bulk page creation (`src/components/modals/AddPagesModal.tsx`)
**Add many…** in the page strip creates up to 500 pages in one go — clicking
"add page" 120 times to build a journal interior is the most tedious part of
low-content publishing, and Canva makes you do exactly that.

Choose the count (presets 5–120 or type any number), whether pages are **blank
or copies of the current page** (the fast way to build a lined journal or a
repeating worksheet), where they land (end / after current / start), and the
page size.

### Page numbers (`src/services/page-numbers.ts`)
The **Numbers** button stamps numbers across every page at once. Position
(including **outer**, which alternates left/right so numbers sit away from the
spine — the KDP convention), format, font, size, colour and edge distance are all
configurable. You can start numbering on any page and choose what number that
page shows, so front matter can be skipped. Re-running updates in place; there's
a Remove-all too. Numbers are ordinary text elements, so they stay editable.

### Page sizes — KDP first (`src/types/canvas.types.ts`)
Amazon KDP trim sizes are the primary presets, since most users are publishing
journals and low-content books:

`6×9` (the all-rounder) · `8.5×11` · `5.5×8.5` · `5×8` · `7×10` · `8×10` ·
`9×6` landscape · `8.25×8.25` square

Plus A4/A5/Letter/Legal and a **custom size** card that accepts inches, mm or
points. Sizes are stored in points (1 in = 72 pt) so 6×9 is exactly 432×648 pt.

### Pages (`src/stores/canvas-store.ts`)
Multi-page documents where each page keeps its own serialized canvas state,
size and background. Add, duplicate, delete, reorder (drag), per-page size
(A4/A5/Letter/Legal/Square/custom), orientation swap, solid or **transparent**
background.

### History
Snapshot-based undo/redo with a browsable History tab — click any entry to jump
back to that point. Capped at 200 steps.

### Text
Global document font shared with every future tool module
(`src/engine/font-manager.ts` — 18 Google/system families lazily loaded, plus
runtime `.ttf/.otf/.woff` upload). Per-object controls: family, size, colour,
bold/italic/underline/strikethrough, alignment, line height, letter spacing and
text outline.

### Images
PNG/JPG/SVG/WebP via the Uploads panel or dragged straight from the desktop onto
the page. Live filters (brightness, contrast, saturation, blur, grayscale) and
**replace image** that preserves size and position. Transparency is preserved
through canvas → PNG → PDF.

### Shapes (`src/components/panels/ShapePanel.tsx`)
12 shapes in three groups — basic, lines & arrows, polygons — with searchable,
uniform stroke previews. The panel is **insert-only**: no fill, stroke or slider
controls live there. Shapes drop in with a neutral style and everything is
edited afterwards in Properties (fill, stroke, **corner radius** for rectangles,
shadow, opacity), so styling always happens in one predictable place.

### Assets — vector, tintable (`public/assets`)
**129 assets**, all searchable, click-to-place or drag-to-place:

| Panel | Count | Contents |
|---|---|---|
| Stickers | 58 | hearts, stars, space, keys, doodles, checklists, time, objects |
| Corners | 12 | ornamental corner pieces |
| Dividers | 31 | horizontal rules and separators |
| Flourish | 8 | tall decorative vine panels |
| Icons | 20 | inline SVG UI icons |

The owner's line art arrived as PNG and was **vector-traced to SVG** with
potrace: **4.0 MB → 0.7 MB (-82%)**, infinitely scalable, and every path uses
`fill="currentColor"` so the art is **recolorable**. Fidelity was verified by
re-rasterizing each trace and comparing ink coverage against the source —
median difference **0.13 percentage points** across all 109 files.

Recolouring lives in **one place**: select a placed asset and use **Artwork
colour** in the Properties panel. That keeps it per-object — colour the asset
you're working on, when you want to, rather than setting a global tint.

Panel previews render each asset through a CSS mask on a light plate, so thin
strokes stay visible against the dark UI. Tiles adapt to the artwork's shape:
dividers get wide letterbox rows, flourishes get tall tiles, everything else
squares.

### Fonts (`public/assets/fonts`)
Drop `.ttf/.otf/.woff/.woff2` files in the folder and run:

```bash
npm run fonts
```

That scans the folder, groups files into families and regenerates
`src/engine/local-fonts.ts`; your families then appear at the top of the font
picker under **My fonts**.

Two naming styles both work, and **subfolders are scanned recursively** so you
can keep each family in its own directory:

```
fonts/lato/Lato-Regular.ttf          hyphen style
fonts/The.Seasons/The Seasons Bold.ttf   space style
```

The scanner groups every weight of a family into **one entry** — "The Seasons"
appears once with its Bold and Italic attached, not as three separate fonts. The
font list shows a live preview of each family plus **B** / **I** pills marking
which real weights it ships. You only *need*
`-Regular`; adding `-Bold` and `-Italic` makes those toolbar buttons use the
real designed weights instead of a synthesized one. Everything else (Thin,
Black, SemiBold…) is optional. Variable fonts work too — a file ending
`-VariableFont_wght` is treated as Regular and the browser derives the weights.
See `public/assets/fonts/README.txt` for the full cheat-sheet.

### Export (`src/engine/pdf-export.ts`)
- **PDF** at 72/150/300 DPI. In the default *hybrid* mode text is drawn as real
  PDF text (selectable and searchable — verified with `pypdf`) over a rasterized
  art layer; *raster* mode flattens everything.
- **PNG** (with optional transparency) and **JPG**, one file per page
- Page-range syntax (`1,3,5-8`), optional free-plan watermark
- Offscreen rendering, so exporting never disturbs the live canvas

### Persistence (`src/services/storage.ts`)
Autosave every 12 s with a restore prompt on return, named local snapshots,
and `.mpdf.json` project download/import. The interface is deliberately shaped
so Phase 3 can drop in S3/R2 + Postgres behind it.

### Shortcuts
**Paging:** with nothing selected, `←`/`→` turn pages. `PageUp`/`PageDown`,
`Home`/`End` also work. When an object *is* selected the arrows nudge it as
before.

`Ctrl+Z/Y` undo/redo · `Ctrl+C/X/V` · `Ctrl+D` duplicate · `Ctrl+A` select all ·
`Ctrl+G` / `Ctrl+Shift+G` group/ungroup · `Ctrl+E` export · `Ctrl +/-/0` zoom ·
`Delete` · `Esc` · arrows to nudge (`Shift` = 10 px).

---

## Architecture

```
src/
├── components/
│   ├── canvas/CanvasStage.tsx     # page shell, rulers, grid, guides, file drop, zoom HUD
│   ├── toolbar/ContextBar.tsx     # align, distribute, group, arrange, style clipboard
│   ├── panels/                    # templates, text, shapes, uploads, assets, layers, pages, properties, history
│   ├── modals/                    # export, projects
│   └── Icon.tsx                   # single inline icon set
├── engine/
│   ├── canvas-engine.ts           # Fabric.js wrapper (the only stateful engine)
│   ├── pdf-export.ts              # pdf-lib generation + PNG/JPG rendering
│   └── font-manager.ts            # global font registry
├── services/                      # asset-library, templates, storage
├── stores/                        # canvas-store (pages/history/view), text-style-store
├── hooks/                         # useSelection, useLayers, useShortcuts
├── types/canvas.types.ts          # CanvasElement, Page, PageSize, ProjectFile
└── utils/units.ts                 # pt / mm / inch conversion
```

Design rules already honoured for later phases:

- **Canvas elements are king** — templates and (later) tool modules emit plain
  Fabric objects, so there is no special rendering path anywhere.
- **Font consistency** — one global font store that modules will inherit.
- **Gating hooks pre-wired** — assets and templates already carry
  `accessLevel: 'free' | 'ad_unlock' | 'premium_only'` and render AD/PRO badges;
  Phase 2 only needs to add `useFeatureGate()` enforcement, not re-tag content.
- **Every interaction has a state** — the status bar and modals surface busy,
  success and error states; no silent failures.

---

## Not in this phase

Auth, Stripe subscriptions, the admin dashboard, ad integration, the module
plugin system (Sudoku / Word Search / Crossword), cloud storage, PDF *import*,
curved text, crop and gradient fills. These are Phases 2–7 in the product plan.

## Known limitations

- PDF text export uses the standard Helvetica family, so custom fonts are
  rasterized rather than embedded (fontkit embedding is a Phase 3 item), and
  non-Latin-1 glyphs fall back to `?` in the text layer.
- `React.StrictMode` is off in `main.tsx`: its double-invoked effects mount and
  dispose the Fabric canvas twice, which breaks the editor in dev.
- Projects live in `localStorage`, which caps large documents with many embedded
  images — use "Download .json" for those until cloud save lands.

## Storage

Projects are kept in **IndexedDB**, not localStorage.

A measured 30-puzzle crossword book (39 pages) serializes to **5.7 MB** — well
past localStorage's ~5 MB cap. The previous implementation wrote to
localStorage and swallowed the resulting `QuotaExceededError`, so an author
could build a whole book, refresh, and lose it with no warning.

- `storage.save()` throws `StorageFullError`; callers surface it
- `storage.autosave()` resolves `false` on failure and the UI warns once
- projects saved by older builds migrate automatically on first load
- a slim index is mirrored to localStorage so the home screen paints instantly

A render crash is caught by `ErrorBoundary`, which offers **Download my work**
before reloading — the document is still in the store at that point.

## Rename: MiniPDF Studio → Gridpress → Novelka

Renamed to avoid a clash with minipdf.com and several "Mini PDF" mobile apps,
and because the old name described the wrong product.

Anything **persisted** was renamed with a legacy fallback, so books saved by an
earlier build keep working:

| Persisted thing | Now | Still read |
|---|---|---|
| module page metadata | `novelka:sudoku-page` etc. | `gridpress:*`, `minipdf:*` |
| page-number tag | `novelka:page-number` | `gridpress:page-number`, `minipdf:page-number` |
| localStorage keys | `novelka.*` (theme, uploads, flags, session…) | `gridpress.*`, `minipdf.*` |
| IndexedDB database | `novelka` | `minipdf` — copied once, then deleted |

The IndexedDB migration copies every project out of the old `minipdf`
database into `novelka` on first launch and drops the old database afterwards.
Password hashes keep their original `gridpress:` hash domain so accounts
created before the rename still sign in.

Verified in a browser — an old book rewritten to `minipdf:` keys is still
recognised by the live-adjust panel and still resizes (354pt → 213pt), and
previously uploaded art still appears.

## Home screen

The three puzzle generators are shown in a **Puzzle generators** section placed
directly under the hero, above the trim sizes — they are the reason to choose
Novelka over a generic PDF editor, so they should not be buried.

Each card carries a small SVG drawing of what that module actually produces, a
short blurb and its selling points. Clicking one creates a fresh 6 × 9 interior
and opens that generator's panel, so a visitor goes from landing page to a
generated book in two clicks.

Wired via `onOpenModule` on `HomeScreen`, which sets `pendingTool` in `App`;
the panel opens once the editor has mounted (the same pattern `pendingTemplate`
already used).

## Phase 2 — feature flags & admin (started)

**Admin control is absolute.** Everything gateable is declared as data in
`src/services/feature-flags.ts`; the admin panel renders that table, so a
capability added to `FEATURES` becomes controllable automatically and cannot be
forgotten.

### Unlock routes

Free / Ad / Paid are **independent switches, not one exclusive choice**. A user
gets in if *any* enabled route lets them, so a feature can be reachable by ad
**and** by subscription at the same time:

| Free | Ad | Paid | Result |
|---|---|---|---|
| ✓ | – | – | Everyone |
| – | ✓ | ✓ | **Watch an ad or upgrade** — lets a free user through today and still sells the subscription |
| – | ✓ | – | Ad only |
| – | – | ✓ | Subscribers only |
| – | – | – | Off — nobody, including the owner |

Plus per feature: **minimum tier**, a **daily limit** for free/ad users (paid
tiers are never capped), and an optional **ad-unlock expiry** in minutes, so the
owner can sell a timed unlock rather than only a permanent one.

Each admin row shows a plain-English summary of what it currently does
("Ad or basic · 5/day free"), because a grid of toggles is easy to misread.

### Content control — 74 items, no code

Templates, ruled paper, puzzle page designs and asset packs each shipped with a
hardcoded `accessLevel`, and the AD/PRO badges on them were **paint** — nothing
checked them. `src/services/content-registry.ts` now discovers every gateable
item at runtime (20 page templates, 14 rulings, 27 puzzle designs, 13 asset
packs) and layers the owner's overrides on top, so the source file's level is a
*default* rather than a rule.

The admin panel's **Content** tab gives every item the same Free / Ad / Paid /
Off switches, a minimum tier, a one-click revert, and **"all free / all ad /
all paid"** bulk actions per group. A new template added anywhere appears
automatically — there is no list to remember to update.

Enforced: applying a gated template is blocked, the badge reflects the *live*
rule rather than the source file, and watching an ad unlocks that specific
item.

`evaluate()` is one pure function returning
`allowed / needs_ad / needs_upgrade / limit_reached / hidden` plus a
user-readable reason. `npm run test:flags` — **49 checks**.

Enforced today at the real choke points: PDF export (5/day free), removing the
watermark (paid), 300 DPI (ad). A blocked user gets `UpgradePrompt`, which
explains why and offers the ad or a plan — never a dead disabled control.

Flags live in `localStorage` behind an async `loadFlags()` shaped like a real
endpoint, so swapping in `fetch('/api/flags')` touches one function.

Still to come: real auth, Stripe, a live ad network, server-side enforcement.

> Client-side gating is a UX layer, not security. Anything that must be
> unforgeable has to be re-checked on the server once the backend exists.

### Persisted-shape migrations

Flags and entitlement live in the browser, so **any change to their shape must
migrate what is already saved**. Two real crashes came from getting this wrong:

- `loadFlags()` did a shallow merge, so a row saved before the routes redesign
  replaced the whole default and left `routes` undefined — `f.routes.free` then
  threw and took the admin panel down. It now merges **per row and per field**
  and converts a legacy `access` value into the equivalent routes.
- The migrated row still carried `minTier: 'free'`, which every user clears, so
  an ad-gated feature silently became free. Migration now raises a gating row to
  `basic`, and `evaluate()` applies the same correction as a second line of
  defence.

Rule of thumb: treat anything read from `localStorage`/IndexedDB as written by
an older version, and never assume a field exists.

## Phase 2 — accounts & owner access

`src/services/auth.ts` provides sign-up, sign-in, sessions, roles and owner
tools behind a mock backend. It is shaped like a real provider — async,
token-based, server-issued roles — so swapping in Supabase means rewriting only
the functions in its "backend" section.

`npm run test:auth` — **44 checks**.

### The problem this fixed

The admin panel had no gate at all. **Any user could open it and switch
themselves to Enterprise.** `adminMode` existed in the store but was never
checked. The Admin button now calls `isOwner()` and shows the owner gate to
everyone else.

### Owner access — two independent routes

| Route | Purpose |
|---|---|
| Owner email | that account gets `role: 'owner'` and the admin panel |
| Recovery code | unlocks admin for the session without an account |

Both exist because locking yourself out of your own admin panel, on a product
where you are the only administrator, has no way back. The recovery code is
hashed, never stored in the clear, and setup can only be claimed once.

Before an owner is configured the panel stays open, so a fresh install is
usable; it prompts to claim ownership.

### Plans follow the account

Signing in pushes the account's tier into the gate entitlement, so the two can
never disagree. Signing out drops back to free — otherwise a shared computer
would leave the next person on the previous user's plan.

> **Still not security.** Accounts live in the user's own browser, so they can
> be edited. Passwords are hashed (SHA-256, no salt) only to avoid storing
> plaintext — a real backend must use bcrypt/argon2 and issue roles server-side.
> This layer makes the app behave correctly for honest users; it does not stop
> a determined one.

## The control panel is hidden

There is **no button**. A visible "Admin" control tells every user the panel
exists and invites them to try it, so the entry is silent.

### Three layers, strongest first

1. **Build flag — the only real one.**
   `npm run build:public` sets `VITE_ENABLE_ADMIN=false`. `ADMIN_BUILT_IN`
   folds to a literal `false`, the unlock watcher is eliminated by dead-code
   removal, and a Vite plugin deletes the emitted `AdminPanel` / `OwnerGate`
   chunks. Verified in the public bundle:

   | string | occurrences |
   |---|---|
   | `gpadmin` | 0 |
   | `gp-control` | 0 |
   | `__gpControl` | 0 |
   | `Owner controls` | 0 |
   | `Claim ownership` | 0 |
   | admin chunks on disk | none |

2. **Lazy chunks.** In an owner build the panel is a separate 9.3 kB chunk
   fetched only after unlocking — reading the main bundle reveals a filename,
   not the panel.

3. **Hidden entry + passphrase.** Type `gpadmin` anywhere outside a text field,
   open `#gp-control`, or call `__gpControl()` in the console. Each still
   requires the owner passphrase, and the unlock expires after 30 minutes and
   is cleared when the panel closes.

The key watcher ignores inputs, textareas and contenteditable, and resets after
a 2-second pause — tested against typing a word list and a set of clues.

### Bugs this shook out

- **An unclaimed install treated everyone as owner.** `isOwner()` returned
  `true` when no owner was configured, so the first person to find the unlock
  would have owned the panel. It now returns `false` and callers route to setup.
- **Guarding the call site was not enough.** The watcher body, hash route and
  console hook still shipped in the public bundle until the flag was made
  statically foldable via `define`.

> Obscurity is not access control. Layers 2 and 3 raise the cost of finding it;
> layer 1 removes it. Anything that must be unforgeable still has to be enforced
> by a server the user cannot edit.

## Password storage

Passwords and the owner recovery code use **PBKDF2-SHA256, per-user 16-byte
random salt, 210,000 iterations** (OWASP recommendation), stored as a
self-describing string:

```
pbkdf2$<iterations>$<salt-hex>$<hash-hex>
```

The format carries its own iteration count, so the work factor can be raised
later without locking anyone out — `verifyPassword()` flags any record below the
current setting and `signIn()` rewrites it.

Accounts created before this change used bare SHA-256. They are **not** broken:
`verifyPassword()` recognises the old 64-char format, verifies against it, and
`signIn()` silently re-hashes with PBKDF2 on the next successful login.

Two related defences:

- **Constant-time compare** (`timingSafeEqual`) so a comparison cannot leak how
  much of a hash was correct.
- **Equal work on the unknown-email path** — `signIn()` runs a throwaway hash
  when the email doesn't exist, so response time cannot be used to enumerate
  accounts. Measured ratio 1.07x.

Measured cost: ~58 ms per hash, i.e. **~17 guesses/sec/core** against a single
account, versus billions/sec on a GPU for unsalted SHA-256.

⚠️ This protects the stored credentials. It does **not** make entitlement
enforceable — tiers and limits are still client-side and editable in devtools.
Only a server fixes that.

## Payments

`src/services/payments.ts` is the browser half. It never talks to Stripe
directly and never decides that a payment succeeded — it calls our own
`/api/*` routes, and entitlement changes only when Stripe's signed webhook
reaches the server.

Market: **USA, billed in USD**. Basic $4.99 / Pro $9.99 / Enterprise $24.99.
Prices are display-only in the client; the charged amount lives in Stripe and
is looked up server-side from the tier name, so editing a label cannot change
what a customer pays.

See `server/SECURITY.md` for the full flow and `SETUP.md` for account setup.

## SVG import safety

SVG is not an image format — it is an XML document that can contain `<script>`,
event handlers, `<foreignObject>` (arbitrary HTML) and external references.
Novelka lets users upload SVGs, and Fabric.js has a published advisory against
its SVG parser, so untrusted markup is cleaned **before** it reaches the parser.

`src/utils/svg-sanitize.ts` uses an **allow-list**, not a block-list: only
elements and attributes a drawing legitimately needs survive, so an unknown tag
fails closed. It runs in two places (defence in depth):

- `UploadPanel` — cleans on upload, so the stored copy is already safe
- `CanvasEngine.addSVGFromURL()` — cleans again at parse time

Removed: `script`, `foreignObject`, `iframe`, `embed`, `object`, `animate*`,
`set`, `a`, every `on*` handler, `javascript:`/`data:`/`http:` references,
`@import` and `expression()` in styles. Kept: paths, shapes, text, gradients,
clip paths, masks, transforms, `currentColor` (so recolouring still works).

Tested with 51 real XSS payloads (`npm run test:svg`) plus a browser test that
uploads five hostile SVGs and asserts **nothing executes** while legitimate
artwork still renders.

## Accessibility

Every visible button has an accessible name, toggles expose `aria-pressed`, the
tool rail is a labelled `<nav>` landmark, and sliders carry `aria-valuetext`
("120 percent" rather than "1.2").

Measured in-browser, editor view:

| | before | after |
|---|---|---|
| buttons with no accessible name | 7 | **0** |
| inputs with no label | 8 | **0** |
| `aria-label` | 21 | 59 |
| `aria-pressed` | 0 | 20 |

Note `title` is a tooltip, not an accessible name — screen readers do not
announce it reliably. Both are set.
