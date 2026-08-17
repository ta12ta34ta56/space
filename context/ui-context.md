# UI Context — Novelka

> The visual language. The agent **never invents a visual decision** — it reads this file.
> Every colour is a token. Every size is on a scale. If a value is not here, it does not
> go in the CSS.

---

## 0. What Novelka should feel like

**A print shop instrument, not a SaaS landing page.**

The user is producing a physical object that costs money to print and gets publicly
reviewed. The interface should feel like a precision tool — a camera body, a plotter, a
pro audio desk. Calm, dense, honest, quiet. The *paper* is the star; the UI is the dark
room around it.

Three words: **precise, quiet, trustworthy.**

Anti-goal: looking like every AI-generated startup page shipped in 2026.

---

## 1. The anti-vibecoded rules (hard bans)

These are **bans**, not preferences. Each one is a specific tell that a UI was generated
rather than designed. Novelka must not trip any of them.

### Banned outright

| Banned | Why | Do instead |
|---|---|---|
| **Inter / Geist / Space Grotesk** | The default typeface of generated UIs | See §3 — a grotesque with real character |
| **Purple + black** | The single loudest AI-slop signal | Ink + a restrained utility accent (§2) |
| **Harsh gradients** | Decoration with no information | Flat surfaces; elevation via a 1px line |
| **Radial orbs / glows / mesh blobs** | Pure decoration | Nothing. Empty space is allowed. |
| **Liquid glass / heavy blur** | Costs GPU, hurts legibility | Solid surfaces with borders |
| **Neon / rainbow / pastel palettes** | Reads as a toy | One accent, semantic status colours only |
| **Emojis in UI copy** | Unprofessional in a print tool | Words, or a real icon |
| **Sparkle / magic-wand icons** | "AI product" cliché | Novelka is deterministic — say so |
| **Bento grids** | A layout pattern in search of content | Layout follows the actual data |
| **3 feature cards in a row** | Marketing template | Not applicable — this is an app, not a landing page |
| **3 pricing tiers** | Out of scope entirely (D12) | — |
| **Fake testimonials / fake reviews** | Dishonest | Nothing, until real users say real things |
| **Terminal-window mockups** | Cosplay | Show the actual canvas |
| **"It's not X, it's Y" copy** | LLM cadence | Say the thing plainly |
| **Em dashes in UI copy** | LLM cadence tell | Full stops. Short sentences. |
| **Checkmark bullet lists** | Marketing filler | Plain lists, or a table |
| **Coloured left-stripe callouts** | Generated-doc styling | A bordered box with a heading |
| **Drop shadows for hierarchy** | Fake depth | 1px borders and background steps |
| **Big soft corner radii (12px+)** | Toy-like | 4px / 6px max (§5) |
| **Dot-grid backgrounds** | Decoration | The workspace is plain |
| **Animated arrows, bouncing CTAs** | Attention theft | Static, unless it conveys state |
| **Decorative hover animation** | Motion without meaning | Instant, honest state changes (§7) |

### Required (the "before launch" list, filtered for this product)

Items that genuinely apply to an app with no marketing site and no backend:

- **Custom 404** — matches the app shell, offers a route home
- **Unique page titles** per view (`Novelka — Editor · My Book`)
- **Meta description + social share image** — a real screenshot of the editor, never a mockup
- **`robots.txt`** and a real favicon
- **Alt text on every image**, real labels on every icon button
- **Skeleton loaders** — never a spinner where the shape is known
- **Privacy policy + Terms** — mandatory, even with no accounts, because the app stores
  user work. State plainly: books never leave the browser.
- **Real product demo** — the app itself is the demo. No mockups, no fake screenshots.

Deliberately **not** applicable here: breadcrumbs (4 views), maps/directions (no
premises), team photo (one person), case studies, local schema, response-time promise,
sticky mobile CTA, Google Analytics (no tracking in v1 — that is a feature, and it goes
in the privacy policy).

---

## 2. Colour

**Dark only. There is no light theme in v1.** One theme halves the visual QA surface and
removes a whole class of "looks wrong in the other mode" bugs.

**The paper is always white**, and the area immediately around it is **neutral mid-grey,
never near-black.**

> **Why the workspace is grey, not black.** Simultaneous contrast: a white page on a
> near-black field reads brighter and colder than the same page on grey, so the user
> misjudges the very thing they are producing. Every professional print and photo tool
> (InDesign, Affinity Publisher, Lightroom, Photoshop) surrounds the artboard with neutral
> grey for exactly this reason. Novelka is judged on printed output, so the surround must
> be neutral. The UI chrome is dark; the *paper surround* is grey. This is not a style
> preference and must not be "cleaned up" to match the panels.

### Semantic tokens — the only colours allowed in code

No raw hex outside this table. Ever.

| Token | Value | Use |
|---|---|---|
| `--workspace` | `#4a4a4c` | **Neutral grey immediately around the paper.** Judgement surface. |
| `--workspace-edge` | `#2a2b2d` | Outer workspace, beyond the page area |
| `--surface` | `#191a1c` | Panels, docks |
| `--surface-raised` | `#212325` | Modals, popovers |
| `--surface-sunken` | `#0c0d0e` | Wells, inputs |
| `--line` | `#303336` | Borders, dividers |
| `--line-strong` | `#44484c` | Emphasised borders |
| `--text` | `#eceae6` | Primary text |
| `--text-dim` | `#9b9791` | Secondary text |
| `--text-mute` | `#6a6762` | Disabled, hints |
| `--accent` | `#c2410c` | Primary action, selection |
| `--accent-hover` | `#ea580c` | Accent hover |
| `--accent-soft` | `rgba(194,65,12,.16)` | Accent fills |
| `--good` | `#4d7c4a` | Passed preflight |
| `--warn` | `#a16207` | Warning |
| `--bad` | `#b4413c` | Error, failed check |
| `--paper` | `#ffffff` | **The page. Never themed, never tinted.** |
| `--paper-edge` | `rgba(0,0,0,.45)` | Page drop edge |

**The accent is burnt orange (`#c2410c`)** — a press/ink colour. Not purple, not indigo,
not blue. It appears on the primary action and the current selection. Nowhere else.

### Print-guide colours (fixed, never themed)

These are instrument markings with fixed meanings. They never change with any future theme:

| Guide | Colour | Meaning |
|---|---|---|
| Bleed | `#dc2626` | Content here may be cut off |
| Trim | `#111827` | The physical cut line |
| Safe area | `#2563eb` | Keep all content inside |
| Gutter | `#7c3aed` | Lost in the spine |
| Spine fold | `#059669` | Cover fold |
| Barcode keep-out | `#d97706` | Amazon prints here |

Six colours, one meaning each, learned once. (Purple appears here — as an *instrument
marking* with a fixed meaning, not as brand decoration.)

---

## 3. Typography

**UI:** `Söhne`, `IBM Plex Sans`, or `Basis Grotesque` — a grotesque with real character.
Fallback stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`.
**Never Inter, Geist, or Space Grotesk.**

**Numeric / measurements:** `IBM Plex Mono`. All dimensions, coordinates, page counts and
spine widths are monospaced and **tabular-figure** aligned. Numbers that jitter as they
change look untrustworthy in a measurement tool.

**Book fonts** (fonts the user's book is set in) are a separate, curated library of real
font files with genuine bold and italic weights. Never synthetic. Never the UI font.

### Scale

| Token | Size / line | Use |
|---|---|---|
| `--fs-micro` | 11 / 16 | Labels, units, badges |
| `--fs-small` | 12 / 18 | Panel body, secondary |
| `--fs-body` | 13 / 20 | Default UI text |
| `--fs-lead` | 15 / 22 | Panel titles |
| `--fs-title` | 20 / 28 | Modal / view titles |
| `--fs-display` | 28 / 34 | Home screen only |

Weights: 400, 500, 600. **No 700+ in the UI** — bold shouting is a landing-page habit.

---

## 4. Spacing

4px base. `--s1:4 --s2:8 --s3:12 --s4:16 --s5:24 --s6:32 --s7:48`.
No arbitrary values. If a gap is not on the scale, the layout is wrong.

Panels are **dense**. This is a professional tool used for hours — generous whitespace
means more scrolling and fewer visible controls. Compact, aligned, scannable.

---

## 5. Shape, elevation, motion

- **Radius:** `--r-sm: 3px` (inputs, buttons), `--r-md: 5px` (panels, modals). Nothing
  larger. No pills except true toggle switches.
- **Elevation:** a 1px `--line` border plus a background step. **No drop shadows** except
  a single soft shadow under the paper page (that one is physical — real paper casts a
  shadow) and under modals for focus.
- **Motion:** 120ms ease-out for state changes. 180ms for panels. **Nothing else animates.**
  No entrance animations, no hover lifts, no scroll reveals. `prefers-reduced-motion`
  disables all of it.

---

## 6. Icons

**Not Lucide** (it is on the ban list — the default icon set of generated UIs).

Use a small **hand-drawn SVG set**, drawn to a 20×20 grid at 1.5px stroke, sized to the
actual needs of this app: page, spread, layers, grid, puzzle types, bleed, trim, safe
area, spine, export, undo/redo. Roughly 30 icons — small enough to draw deliberately.

**Every icon button has a text label or a real `aria-label`.** Icon-only controls with no
tooltip are banned. The print vocabulary (bleed, gutter, verso) is unfamiliar to
beginners — words teach, glyphs do not.

---

## 7. Layout

```
┌──────────────────────────────────────────────────────────┐
│ Top bar — book name · trim · page count · Preflight · Export │  48px
├────┬────────────────────────────────────────┬────────────┤
│ L  │                                        │  Right     │
│ e  │            WORKSPACE                   │  dock      │
│ f  │     (paper, centred, guides overlaid)  │  Pages /   │  fluid
│ t  │                                        │  Layers /  │
│    │                                        │  Inspector │
│ 56 │                                        │  280px     │
├────┴────────────────────────────────────────┴────────────┤
│ Bottom bar — zoom · fit · page nav · bleed · guides       │  36px
└──────────────────────────────────────────────────────────┘
```

- **Left rail (56px):** view toggles — KDP, bleed, rulers, grid, snap, guides, margins.
- **Right dock (280px):** one panel at a time — Pages, Layers, Inspector, Generator,
  Template. Tabs, not stacked accordions.
- **Contextual bar:** floats above the selection. Shows only what applies to the current
  selection. Never a fixed toolbar of mostly-disabled buttons.
- **Modals:** only for genuinely modal work — New Book, Export, Preflight report. Never
  for something that belongs in a panel.

**Desktop-first.** Responsive down to tablet; below that, an honest message that Novelka
needs a larger screen. A cramped fake mobile editor would be a lie.

---

## 8. Copy

- Plain, short, concrete. **No em dashes.** No "seamlessly", "effortlessly", "supercharge".
- Errors state **what happened, why, and the fix**:
  > "This puzzle is 0.3 in outside the safe area on page 7. Amazon may cut it off.
  >  **Shrink the puzzle** or **switch to a 7×10 trim**."
- Print terms are used correctly and explained on first use via a real tooltip
  (gutter, bleed, recto/verso, trim). Never dumbed down — the user is becoming a publisher.
- Numbers always carry a unit. `0.375 in`, never `0.375`.

---

## 9. Honesty rules (these are visual, and they are product-critical)

1. **The paper never lies.** Always white, always at true proportion, on a neutral grey surround so the user judges it accurately.
2. **Guides are never exported.** What they mark is real; the marks themselves are not.
3. **No dead controls.** A control that is not implemented is not rendered. No disabled
   sliders "coming soon".
4. **Preflight never shows a green tick it has not earned.** If a check did not run, it
   says "not checked", not "passed".
5. **Skeletons match the real shape** of what is loading, so nothing jumps.
6. **Progress for anything over 400ms** — generating 50 puzzles shows real progress, not
   an indeterminate spinner.
