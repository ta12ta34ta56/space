# Progress Tracker — Novelka

> Update this file after every meaningful implementation change.
> It is how the next session recovers full context in one prompt.

**Last updated:** 17 August 2026

---

## Current Phase

**Phase 0 — Architecture and context.** Defining the system before any code is written.
No implementation has begun on the v2 build.

The previous build (`src/`, `server/`) is still present in the repository and is the
**reference implementation** — the source of ported logic. It is not the thing being
extended.

---

## Current Goal

Complete the context system, then produce `context/specs/00-build-plan.md` — the full
build broken into scoped, verifiable units in dependency order.

---

## Completed

- **Measured audit of the existing codebase** (`context/inventory.md`) — not recalled from
  documentation, measured directly:
  - 32,814 lines of logic, 18,999 lines of UI, 9,307 lines of tests
  - 0 `any` casts, clean `tsc`, all 25 test suites passing, clean build
  - ~25,000 of 32,800 logic lines are pure and portable by copying the file
  - Root cause of crashes identified: two sources of truth (Fabric + store) bridged by
    hand across 161 engine calls, 109 store subscriptions, 87 serialise round-trips, and
    97 `useEffect` hooks
- **Locked decisions** (`context/decisions.md`) — D1 through D16, each with its reason.
- **Context files written:**
  - `project-overview.md` — product definition, flow, scope, success criteria
  - `architecture.md` — stack, Document model, boundaries, 17 invariants
  - `ui-context.md` — visual language and the anti-vibecoded ban list
  - `code-standards.md` — implementation rules
  - `ai-workflow-rules.md` — agent behaviour and verification gates
  - `progress-tracker.md` — this file
  - `decisions.md` and `inventory.md` — supporting records
- **Specific defects found and documented with evidence:**
  - Cover math: 4 real defects (wrong standard-colour thickness, invented hardcover
    geometry with no hinge or board, off-by-one spine-text threshold, two incompatible
    paper vocabularies)
  - Crossword overlap: `layout.ts` clue-fitting loop stops shrinking at 5.5pt and places
    clues anyway; the crossword suite has 42 checks and none test layout
  - Gutter band trap: adding pages can cross a KDP gutter band and silently invalidate
    every page of a finished book
- **Claims checked and found false:** the templates were believed to be hardcoded for 6×9
  and unsafe at other trims. They are parametric and pass a 95,677-check safe-area audit
  at every trim, recto and verso. They are kept.

---

## In Progress

- Nothing. Planning is complete; implementation has not started.

---

## Next Up

**Unit 01 — project skeleton and the Document model.**
Spec: `context/specs/01-skeleton-and-model.md` (written and ready).

1. Move the previous build to `legacy/` so the new tree starts clean (D24.7).
2. Build Unit 01 in a fresh session against its spec.
3. Judge the result before continuing. Unit 01 is types and tests only — if it comes out
   wrong, the cost is one evening, not one month.

The full ordered plan is `context/specs/00-build-plan.md` — 23 units in five phases.
Checkpoints: Unit 05 proves the architecture, Unit 11 is the first shippable book.

---

## Open Questions

**None.** All open questions were resolved on 17 August 2026 (D24). The owner decided
History (keep), PDF import (cut) and fonts (keep); the remaining calls were delegated to
the agent and are recorded with reasoning in `decisions.md` D24. Any of them can be
overruled at low cost.

## Architecture Decisions

Full reasoning in `context/decisions.md`. Summary:

| # | Decision | Why |
|---|---|---|
| D1 | Fresh skeleton, ported brain | ~25,000 lines of pure logic are proven; the shell is what fails |
| D2 | Document is the only source of truth; Fabric renders and stores nothing | Deletes the dual-state crash class outright |
| D3 | **A puzzle is ONE semantic object** (data + style + frame) | Resolves "tidy" vs "editable"; makes apply-to-all one field and one undo step |
| D4 | Style is chosen in a live preview before generating, and stays live after | User sees real output before committing 50 pages |
| D5 | Generator algorithms are fine; layout is what is broken | 250+ algorithm tests pass; layout has no tests at all |
| D6 | No account to build; sign-in button present; gate at export, built later | A signup wall before value contradicts the product promise |
| D7 | Six fixed trims | Makes template QA finite and completable |
| D8 | Cover math rebuilt against a reference table; spine = pages × thickness, no +0.06" | Passing tests only proved the code agreed with itself |
| D9 | Bleed is an editor toggle, not a creation question | The user does not know the answer at creation time |
| D10 | Panels drag-reorder; no free-form canvas composition | Novelka produces books; it is not a design tool |
| D11 | Engine → generators → templates | Templates are designed around real generator output |
| D12 | No payments, accounts, admin, or backend in v1 | v1 is a static site with no servers to operate |
| D13 | **Templates are kept** — 95,677 safe-area checks pass | The feared defect does not exist; the real one is that `kdpSafe` is opt-in |
| D14 | Layout returns a result, never silently overflows | Root cause of the crossword overlap |
| D15 | Anti-vibecoded identity: not Inter, not purple, not Lucide | The current app trips the two loudest tells |
| D16 | Gutter band locked at creation; movement constrained to the safe area | Adding pages can silently invalidate a finished book; unconstrained movement discards the product's only real advantage |
| D17 | **The editor UI layout is preserved, not redesigned** | The right dock is proven, accessible, hard-won work; only its data source changes |
| D18 | Every element kind keeps its own identity | 31 dividers and 58 stickers all collapsed to one generic "sticker" row |
| D19 | Generation fills existing pages, never silently appends | 15-page book + generate = 30 pages; there was no fill operation at all |
| D20 | Real font faces only; missing styles disabled, never faked | 22 font files, only 1 italic — the browser was synthesising the rest |
| D21 | Simplifications: PDF-only export, auto-download both files, no drag-and-drop, one theme | Owner's call; every removal is one less thing to break |
| D22 | Template previews render true-to-print, with variants | Early templates preview as abstract shapes, not real pages |
| D23 | Dark only, with a neutral grey paper surround | Simultaneous contrast: white paper on near-black misleads print judgement |
| D24 | Remaining questions decided: history keep, import cut, 5 font families, paperback only, quick-create makes a complete interior | Owner delegated; all reversible |

---

## Session Notes

- **The owner is the architect; the agent is the implementation engine.** Push back on
  vague or contradictory requirements. Do not agree by default.
- **Measure before believing anything — including the owner's own account of the code.**
  Three months of exhaustion has made good work look broken. Twice now, a feared defect
  turned out not to exist (templates), while a real one sat undetected (crossword layout,
  cover math). Run the code. Read the file. Then answer.
- The previous build runs at `http://localhost:5173/`. Dependencies must be installed in
  **both** the root and `server/` or `test:staging-smoke` fails on a missing `stripe`.
- `npm run check` is the full chain: lint → tsc → unit suites → server suites → build →
  secret scan.
- The six-file system plus `decisions.md` and `inventory.md` is the complete context. The
  entry point is `AGENTS.md` at the repository root.
