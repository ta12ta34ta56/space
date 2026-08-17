# Inventory — what the current Novelka actually is

> **Purpose.** Before we write a single context file we settle one question with evidence
> instead of feeling: *what is worth keeping, what must be rebuilt, and what must be deleted.*
> Everything below was measured directly from the repo on 16 August 2026, not recalled
> from documentation. `STATUS.md` is a claim; this file is a measurement.
>
> This file is an input to the six context files. It is not one of them. Once the
> rebuild is done, this file is archived.

---

## 1. Measured baseline

I installed dependencies (root **and** `server/` — server deps were missing, which is
why `test:staging-smoke` was failing with `Cannot find package 'stripe'`) and ran the
full chain.

| Check | Result |
|---|---|
| `oxlint` | 0 errors, **3 warnings** (React hook dependency arrays) |
| `tsc -b` | clean |
| `npm run test:unit` — 25 suites | **all pass** (~95,900 assertions, dominated by the template matrix) |
| `vite build` | clean, 1.2 s |
| `any` / `as any` casts in `src/` | **0** |
| Non-null assertions in `.tsx` | 2 |
| `TODO` / `FIXME` / `HACK` / `@ts-ignore` | 16 |

**Read this honestly.** The code is not the disaster you feel it is. Zero `any`, a green
type-check, and a large green test suite is better hygiene than most shipped products.
What you are exhausted by is **not** bad code quality. It is something more specific,
and section 3 names it.

### Size

| Layer | Lines | Verdict at a glance |
|---|---|---|
| Pure logic (`.ts`, no React/Fabric/DOM) | **32,814** | The asset. Tested, portable. |
| React UI (`.tsx`) | **18,999** | The liability. Where the crashes live. |
| Tests (`.test.mjs`) | 9,307 | Keep. This is your safety net for the port. |
| `server/` (Stripe, Supabase, GDPR, admin) | 32 MB installed | Out of scope per `project-overview.md`. |

---

## 2. The keep / rebuild / delete ledger

### 🟢 KEEP — port as-is, these are the three months you did not waste

These files import no React, no Fabric, and touch no DOM. They are pure functions with
their own test suites. They move to a new codebase by **copying the file**. This is the
proof that "start fresh" does not mean "lose your work."

| Asset | Lines | Why it survives |
|---|---|---|
| `services/kdp.ts` | 560 | Trim table, gutter-by-page-count, safe area, bleed. Correct, tested. |
| `services/kdp-cover.ts` + `cover-guides.ts` | 305 | Spine math and phantom guides. 21 checks pass. |
| `modules/maze/generator.ts` | 760 | 52 checks. Square/circular/triangular/hex. |
| `domain/word-search-solver.ts` | 683 | 30 checks. |
| `modules/crossword/generator.ts` | 599 | 42 checks. |
| `modules/sudoku-maker/generator.ts` | 520 | Proven single-solution. 16×16 hard in ~2.1 s. |
| `modules/handwriting/letterforms.ts` + `generator.ts` | 830 | 94 checks. |
| `domain/preflight.ts` | 534 | The thing that makes the product *trustworthy*. |
| Word/clue banks, `geometry.ts`, `page-numbers.ts`, `svg-sanitize.ts` | ~1,500 | Pure data and pure helpers. |
| 130 SVG assets in `public/assets` | — | Content, not code. |
| The `.test.mjs` suites | 9,307 | **Port these first.** They are how we prove the new build is not a regression. |

**Roughly 25,000 of your 32,800 logic lines are portable without modification.**
That is the answer to "I can't lose my hard work." You are not losing it. We are lifting
it out of a building that is on fire.

### 🟢 KEEP — proven UI interaction design (see decisions.md D17)

The earlier framing of this file — "port the logic, rebuild the UI" — was too broad. Parts
of the UI are proven work and are **ported as interaction designs**, with only their data
source swapped.

| Asset | Why it survives |
|---|---|
| `components/editor/RightDock.tsx` | Pages + Layers dock. `role="tablist"` and full aria coverage, IntersectionObserver lazy thumbnails, rAF-throttled live snapshots, drag-reorder with drop-line and insert gutters, layer tree with grouping and semantic labels, cover shown with spine width. Contains fixes only found by shipping — e.g. painting an opaque white ground before capture, because a `transparent` page encodes as **black** in JPEG. |
| `components/editor/FloatingCanvasBar.tsx` | Contextual toolbar. Shows only what applies to the selection. |
| `components/toolbar/FoundationRail.tsx` | Left rail: KDP, bleed, rulers, grid, snap, guides, margins. |
| `components/editor/EditorFooter.tsx` | Bottom bar: zoom, fit, page nav, preflight. |
| The `aria-*` attributes and keyboard behaviour throughout | Accessibility is expensive to rediscover. Copy it. |

**What changes underneath:** these components read the Document and dispatch Commands
instead of reading and mutating the Fabric canvas. The user should not be able to tell
they were rewritten, except that they stop desyncing.

### 🟡 REBUILD — the logic is right, the wiring is wrong

| Asset | Lines | What's wrong |
|---|---|---|
| `engine/canvas-engine.ts` | 1,446 | Correct rendering knowledge (DPR, supersampling, guides). But it is a god-object that the UI calls into from 161 places. Rebuild the *boundary*, port the rendering math. |
| `stores/canvas-store.ts` | 716 | Holds pages + book + 200-step history. Rebuild around a single writer (see §3). |
| `services/templates.ts` | 47 KB / 21 templates | The parametric idea is good and the trim-adaptation is tested. Too big as one file — split per family. |
| The 5 generator `Panel.tsx` files | ~110 KB | Each generator re-invents its own panel. One shared panel shell, five config schemas. |
| `engine/pdf-export.ts` | 319 | Works. Rebuild against the new page model, keep the pdf-lib + fontkit approach. |

### 🔴 DELETE — this is the crowdedness you feel

| Asset | Size | Why it goes |
|---|---|---|
| `src/admin/` (7 components) | 124 KB, ~2,100 lines | `project-overview.md` says admin is out of scope. It is built anyway. |
| `server/` — Stripe, entitlement, quotas, GDPR, RLS | 32 MB | Payments are out of scope for v1. This is the single biggest source of drift in the repo. |
| `services/feature-flags.ts` (609) + `stores/flag-store.ts` (245) + `UpgradePrompt.tsx` | ~950 lines | Tier gating for a product with no tiers. Referenced from 14 files — it has spread. |
| `services/auth.ts` (609) + `auth-supabase` + `AuthModal` + `auth-store` | ~1,000 lines | Guest-first v1 needs none of it. |
| `components/modals/QuickWordSearchWizard.tsx` | **44.8 KB — your single largest file** | A bespoke wizard for *one* generator. Either every generator gets the quick flow or none does. |
| `components/modals/AdminPanel.tsx` | 18.8 KB | Second admin surface. |
| `services/ratings.ts`, `social-links.ts` | 133 lines | Not v1. |

**That is roughly 5,000 lines of client code and an entire 32 MB backend removed before
we write anything new.** Not because the code is bad — because it is not the product.

---

## 3. Root cause of the crashes — the actual diagnosis

You said the app "still crashes every now and then." That is the symptom. Here is the
mechanism, and it is not carelessness on your part — it is a structural choice made
early that compounds.

**Novelka has two sources of truth for the same data, bridged by hand in the UI layer.**

- Fabric owns the live objects on the canvas.
- `canvas-store` (716 lines) owns pages, book settings, and 200 steps of history.
- The UI reconciles them: **161** direct `engine.*` calls from `.tsx` files, **109**
  `useCanvasStore` subscriptions, **87** `toJSON` / `loadFromJSON` / `renderAll`
  round-trips, and **97 `useEffect` hooks** — 11 in `CanvasStage.tsx` and 11 in
  `App.tsx` alone.

Every one of those effects is a place where the two truths can drift apart. When they
drift you get exactly what you described: fix one thing, break another, forever. It also
explains why the *tests* are green while the *app* crashes — the pure logic is correct
and tested; the failures live in the un-testable bridge between engine and store.

**This is why "refactor in place" is the wrong answer for the shell.** You cannot
refactor a dual-source-of-truth into a single one incrementally without touching all
97 effects anyway. And it is why "rewrite everything" is also wrong — it would throw
away 25,000 lines of tested, blameless logic that has nothing to do with the bug.

### The architectural rule that fixes it, permanently

> **The document is the only truth. Fabric is a renderer, never a store.**
>
> Pages are plain serialisable data. Every change is a typed command applied to that
> data. The canvas re-renders *from* the data. Nothing in the UI ever calls the engine
> to mutate state, and the engine never holds state the document does not have.

Undo/redo becomes trivial (a stack of commands over immutable data). Autosave becomes
trivial. Layers and pages become *views* over the document instead of a second copy.
That single invariant is worth more than every other decision we will make.

---

## 4. What this means for "start completely fresh"

Your instinct is right, and my measurement sharpens it:

| Rebuild fresh (plumbing) | Port unchanged (design + logic) |
|---|---|
| State model, engine boundary, data flow | Every generator algorithm |
| Canvas mount + render pipeline | All KDP margin math; cover math rebuilt to reference (D8) |
| How components get their data | Preflight |
| Cover math (see D8 — genuinely defective) | All word/clue banks |
| — | 130 SVG assets |
| — | 9,307 lines of tests |
| — | **Right dock, contextual toolbar, left rail, bottom bar — as interaction designs (D17)** |
| — | **20 parametric templates (D13 — 95,677 checks pass)** |

**Your layers and pages are safe.** Rebuilding them on a document model is what finally
makes them stop fighting you — you keep the feature and lose the headaches. That is not
me being agreeable; a reorder against immutable page data is ~30 lines and cannot desync,
whereas the current one has to keep Fabric's z-order and the store's array in step by hand.

---

## 5. Contradictions that must be resolved before the context files are written

These are places where two documents in this repo currently disagree. An agent reading
both will build the wrong thing with total confidence.

1. **Payments/admin.** `project-overview.md` lists them as explicitly out of scope.
   `STATUS.md` §4 says the next task is *"deploy the server, create the Stripe account."*
   The repo contains both. One of these is a lie and the agent cannot tell which.
2. **Trim sizes.** You said "only the most standard sizes." `kdp.ts` ships **16**.
3. **"Remove drag and drop" vs. Layers/Pages.** You want both. They are compatible, but
   only if we define the boundary precisely — otherwise the agent removes your panels.
4. **Fresh vs. refactor.** `progress-tracker.md` recommends refactor-in-place. You have
   now said fresh. The file must be corrected or it will steer the agent wrong.

---

## 6. Verdict

Keep the brain. Rebuild the nervous system. Delete the organs the product does not have.

The three months were not wasted — they produced 25,000 lines of tested domain logic and,
more importantly, they taught you exactly which product you are building. That knowledge
is what makes the context files possible. You could not have written them in month one.
