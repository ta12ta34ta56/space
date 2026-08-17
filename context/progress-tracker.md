# Progress Tracker — Novelka

> Update this file after every meaningful implementation change.
> It is how the next session recovers full context in one prompt.

**Last updated:** 17 August 2026 — Unit 01 complete

---

## Current Phase

**Phase 1 — Foundation.** Unit 01 is complete; implementation of the v2 build has begun.

The previous build now lives in `legacy/novelka/` and is the **reference implementation** —
the source of ported logic. It is not the thing being extended, it is not linted, and it
is not built.

---

## Current Goal

**Unit 02 — Commands and the document store.** `apply(doc, cmd)` pure, the command union,
undo/redo, `state/doc-store.ts` as the only writer. The spec for it
(`context/specs/02-*.md`) has not been written yet — Unit 01's spec was written ahead of
implementation and Unit 02's should be too. See the open question below.

---

## Completed

### Unit 01 — project skeleton and the Document model *(17 August 2026)*

Built at the repository root against `context/specs/01-skeleton-and-model.md`. Nothing
beyond that spec was implemented.

**Skeleton.** Vite 8 + React 19 + TypeScript 6, ESM, `"type": "module"`. `tsconfig.app.json`
and `tsconfig.node.json` both carry `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes` and `noImplicitOverride`. Dependencies are exactly `react`,
`react-dom`, `nanoid`; dev-dependencies exactly `vite`, `@vitejs/plugin-react`,
`typescript`, `oxlint`, `esbuild`, `@types/*`. **No Fabric, no pdf-lib, no zustand.**
Scripts: `dev`, `build`, `preview`, `lint`, `test`, `check` (lint → tsc → test → build).
The test harness copies the legacy pattern — esbuild bundles the module, plain Node runs
the `.test.mjs` beside it — so failures print readable output and no test runner is a
dependency.

**`src/model/units.ts`** — the only file in the codebase that may contain `* 72` or `/ 72`.
`PT_PER_IN`, `inToPt`, `ptToIn`, `inToPx`, `pxToIn`, `roundIn` (4 dp). Every function
throws a named `UnitError` on non-finite input *and* on a non-finite result, so `NaN`
can never reach geometry.

**`src/model/types.ts`** — the Document model per `architecture.md` §2. Every vocabulary
is a `const` tuple with its union derived from it (`TRIM_IDS`, `PAPER_STOCKS`, `BINDINGS`,
`GENERATOR_KINDS`, `PAGE_KINDS`, `ELEMENT_KINDS`, `ELEMENT_TYPES`, `SHAPE_KINDS`,
`TEXT_ALIGNS`), so the runtime validator and the compile-time type cannot drift. All
geometry is inches with an `In` suffix, type sizes `Pt`; every field and array is
`readonly`; absence is `null`, never `undefined`. `Element` discriminates on `type`
(`text | shape | image | puzzle` — the payload) and carries `kind` separately (the eleven
D18 semantic families), so a divider stays a divider in the data. `PuzzleSpec` is
`{ kind, data, style }` (D3); `PuzzleData` and `PuzzleStyle` are `Record<string, never>`
placeholders until Unit 12.

**`src/model/parse.ts`** — `unknown` → `Document` with a `DocumentParseError` naming the
offending path. Split out from `document.ts` so shape-checking and invariant-checking stay
separate concerns.

**`src/model/document.ts`** — `createDocument` (takes injected `now` and `id`; calls
neither `Date.now()` nor `nanoid()` itself), `assertValidDocument` (duplicate ids, negative
or non-finite geometry, an element outside its page, a cover inside `pages[]`), and
`migrate`. Migration is a `readonly MigrationStep[]` chain walked in a loop, empty at
schema version 1, so adding v2 is an append — not a switch.

**`src/model/index.ts`** — the one permitted barrel.

**Placeholder app** — `main.tsx` (throws a named error if `#root` is missing rather than
asserting), `App.tsx` rendering `Novelka` on `--workspace`, and `index.css` containing
only the `ui-context.md` §2 tokens. No fonts are linked and no theme script exists — the
legacy `index.html` did both and is the anti-pattern, not the template.

**Tests** — `units.test.mjs` (5 cases) and `document.test.mjs` (7 cases), all passing.
Purity is proved by replacing `Date.now` and `Math.random` with throwing stubs for the
duration of the call. The serialisation round-trip test constructs one element of every
`ElementKind` and deep-equals the document against
`JSON.parse(JSON.stringify(doc))` — that test is what holds invariant 1 in place.

**Verification, all run and all green:** `npm run lint` 0 errors 0 warnings ·
`npx tsc -b` clean · `npm run test` 12/12 · `npm run build` passes · `npm run dev` serves
the page with no console errors · `grep -r "fabric" src/` empty ·
`grep -rE "\* ?72|/ ?72" src/ --include=*.ts` matches only `model/units.ts` (its header
comment) · no `any`, no `@ts-ignore`, no non-null `!` anywhere · `apply` does not exist
and nothing imports a store.

**Invariants checked explicitly** (`architecture.md` §10). Applicable and held: 1 (no
`canvas.toJSON()` anywhere; the Document is plain data), 3 (`createDocument` takes injected
`now`/`id`), 4 (all geometry inches, conversion only in `units.ts`), 6 (`Cover` is a
distinct type in `document.cover`; `assertValidDocument` rejects a cover in `pages[]`),
7 (one paper vocabulary, `PAPER_STOCKS`), 8 (`kind` is a stored field, never inferred),
10 (`TRIM_IDS` has exactly six entries, no custom size), 14 (zero `any`, zero `@ts-ignore`,
zero `!`), 15 (`model/` imports nothing outside itself), 16 (no backend). Not yet
applicable, nothing in this unit contradicts them: 2, 5, 9, 11, 12, 13, 17.

One deliberate deviation from the legacy setup, recorded here rather than silently: the
lint script is `oxlint --disable-nested-config --deny-warnings`. `legacy/novelka/` carries
its own `.oxlintrc.json`, and a nested config overrides the root `ignorePatterns`, so
without that flag oxlint lints the legacy tree and reports its 3 pre-existing
`react-hooks(exhaustive-deps)` warnings. Legacy is reference material and is not held to
the new standards.

### Phase 0 — architecture and context

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

- Nothing. Unit 01 is finished and verified; Unit 02 has not started.

---

## Next Up

**Unit 02 — Commands and the document store.** `apply(doc, cmd)` pure with no I/O, the
command union for pages and elements, undo/redo as a stack, `state/doc-store.ts` as the
only writer. Done when every command has a test asserting the resulting Document, undo/redo
round-trips exactly, and `apply` is provably pure.

Write `context/specs/02-*.md` first, the way Unit 01 was specified before it was built.

The full ordered plan is `context/specs/00-build-plan.md` — 23 units in five phases.
Checkpoints: Unit 05 proves the architecture, Unit 11 is the first shippable book.

---

## Open Questions

1. **Unit 02 has no spec file yet.** Only `00-build-plan.md` and `01-skeleton-and-model.md`
   exist under `context/specs/`. The build plan's four-line summary of Unit 02 is not
   enough to implement against without inventing product behaviour — in particular the
   command union's exact membership, whether undo granularity is per-command or coalesced,
   and where the store is allowed to be read from. Owner to write the spec, or to say the
   agent should draft it for review first.
2. **`PuzzleData` / `PuzzleStyle` are `Record<string, never>` until Unit 12.** The parser
   therefore *rejects* any puzzle carrying real data, with a message pointing at Unit 12.
   This is correct for now, but it means no document written between here and Unit 12 can
   contain a real puzzle. Flagging it so it is a known constraint and not a surprise.

Everything else was resolved on 17 August 2026 (D24). The owner decided History (keep),
PDF import (cut) and fonts (keep); the remaining calls were delegated to the agent and are
recorded with reasoning in `decisions.md` D24. Any of them can be overruled at low cost.

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
- The **new** build runs at `http://localhost:5173/` via `npm run dev` from the repository
  root. `npm run check` is its full chain: lint → tsc → tests → build. It takes seconds.
- The **legacy** build lives in `legacy/novelka/` with its own `package.json`, its own
  dependencies and its own `.oxlintrc.json`. It is reference material: not linted, not
  type-checked and not built by anything at the root. Its dependencies must be installed
  in both `legacy/novelka/` and `legacy/novelka/server/` if it is ever run again.
- The six-file system plus `decisions.md` and `inventory.md` is the complete context. The
  entry point is `AGENTS.md` at the repository root.
