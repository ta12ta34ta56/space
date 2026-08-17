# AI Workflow Rules — Novelka

> How the agent behaves while building. These are **direct instructions**, not guidance.
> Read this file at the start of every session, before touching any code.

---

## Approach

Build Novelka incrementally using a **spec-driven workflow**.

The context files define what to build (`project-overview.md`), how the system fits
together (`architecture.md`), what was decided and why (`decisions.md`), how it looks
(`ui-context.md`), how to write it (`code-standards.md`), and where the project stands
(`progress-tracker.md`). Each unit of work has its own spec in `context/specs/`.

**Implement against the spec. Do not infer, invent, or improve on it.** If the spec does
not say it, it does not get built. If the spec is wrong, fix the spec first, then build.

This project is a **rebuild with a large body of ported code**. Roughly 25,000 lines of
proven pure logic (generator algorithms, KDP margin math, word banks, preflight, the SVG
sanitiser, 20 parametric templates, ~9,300 lines of tests) move across from the previous
build. **Ported code is copied, not rewritten.** If a ported file needs to change, that is
a decision to record, not a liberty to take.

---

## Scoping Rules

- **Work on one unit at a time.** Finish it, verify it, mark it complete. Then the next.
- **Prefer small verifiable increments** over large speculative changes.
- **Do not combine unrelated system boundaries** in one step. A unit that touches
  `model/`, `render/`, and `ui/` at once is three units.
- **Do not refactor code outside the current unit**, even when it is obviously improvable.
  Note it in `progress-tracker.md` under Open Questions instead.
- **Do not add a dependency** unless the current unit's spec lists it. Install it in the
  unit that first uses it, never in advance.
- **Do not build for a future requirement.** No hooks, flags, or abstractions for features
  not in the current spec.

---

## When to Split Work

Split an implementation step if it combines:

- **A Document/model change with a UI change.** The model change lands and is tested
  first; the UI follows.
- **A renderer change with a domain change.** Pure logic first, then the thing that draws it.
- **More than one generator or more than one template family.**
- **A ported file with new code.** Port it and prove it green; then build on it.
- **Behaviour that is not clearly defined in the context files.** Stop and resolve the
  definition first.

**If a change cannot be verified end to end quickly, the scope is too broad. Split it.**

---

## Handling Missing Requirements

- **Do not invent product behaviour.** Not a default value, not an error message, not a
  fallback, not a keyboard shortcut. If it is not defined, it is not decided.
- **If a requirement is ambiguous**, resolve it in the relevant context file *before*
  implementing. Update the file, then build.
- **If a requirement is missing**, add it to `progress-tracker.md` under Open Questions and
  stop work on that part. Do not guess and continue.
- **If a spec contradicts a context file**, the context file wins and the spec is wrong.
  Fix the spec.
- **If two context files contradict each other**, stop and raise it. Do not pick one.
  (The previous build had `project-overview.md` declaring payments out of scope while
  `STATUS.md` listed "deploy Stripe" as the next task. An agent reading both built the
  wrong thing confidently.)

---

## Protected Files

Do not modify these without explicit instruction:

- **`context/decisions.md`** — the record of locked decisions. Changing a decision is a
  conversation with the owner, not an implementation detail.
- **`context/architecture.md` invariants** — the numbered list. If code cannot be written
  without violating one, stop and raise it.
- **Ported pure logic**: `generators/*/generator.ts`, `generators/*/banks.ts`,
  `print/margins.ts`, `print/preflight.ts`, the SVG sanitiser, and the ported test suites.
  These arrive proven. Change them only with a failing test first and a note in
  `progress-tracker.md`.
- **`print/cover.ts` reference table** — the known-good KDP values. Changing an expected
  value requires evidence from Amazon's own cover template, cited in the commit.
- **Preserved UI components (D17).** The right dock (Pages + Layers), the contextual
  toolbar, the left rail, and the bottom bar are **ported interaction designs**, not
  invitations to redesign. Reproduce the structure, the `aria-*` attributes, the keyboard
  behaviour, the drop-line and insert gutters, the IntersectionObserver and rAF-throttled
  thumbnails. Swap only the data source: read the Document, dispatch Commands.
  **Redesigning one of these requires an explicit instruction from the owner.**
- Any third-party library internals.

### Porting a UI component — the procedure

1. Open the original file and read it fully before writing anything.
2. Reproduce the DOM structure, class names, and every accessibility attribute.
3. Reproduce the interaction behaviour exactly — drag, drop indicator, throttling,
   lazy rendering, keyboard handling.
4. Replace only the data source: read from the Document, write via Commands.
5. Apply `ui-context.md` **tokens** (colour, type, spacing, radius). Do not change layout,
   density, or structure to suit the tokens.
6. Verify against the original side by side. A user must not be able to tell it was
   rewritten, except that it no longer desyncs.

---

## Keeping Docs in Sync

Update the relevant context file whenever the implementation changes:

| What changed | Update |
|---|---|
| System structure, boundaries, invariants | `architecture.md` |
| Storage model, schema version | `architecture.md` |
| A product decision, or a decision reversed | `decisions.md` (with the reason) |
| Feature scope, in or out | `project-overview.md` |
| A convention, pattern, or rule | `code-standards.md` |
| Colours, type, spacing, components | `ui-context.md` |
| Anything meaningful at all | `progress-tracker.md` |

**Update `progress-tracker.md` after every meaningful change**, not at the end of a
session. It is how the next session recovers full context in one prompt.

If an implementation reveals that a context file is wrong, **fix the file before
continuing**. Do not leave code and documentation disagreeing.

---

## Verification — before moving to the next unit

Every item must be true. No exceptions, no "I will come back to it."

1. **The unit works end to end** within its defined scope, exercised manually.
2. **No invariant in `architecture.md` was violated.** Check the numbered list explicitly.
3. **The unit's own spec checklist passes**, every item.
4. `npm run lint` — **0 errors, 0 warnings**.
5. `npx tsc -b` — clean. No `any`, no `@ts-ignore`.
6. `npm run test` — all suites green, including every ported suite.
7. **New pure code has tests.** New layout code has a safe-area and overlap audit at all
   six trims.
8. `npm run build` — passes.
9. **No console errors or warnings** during a normal run of the feature.
10. **No dead controls.** Everything visible does something real.
11. **`progress-tracker.md` reflects the completed work**, with any new open questions.

If any check fails, the unit is not done. Fix it before starting the next unit.

---

## Standing rules

- **Measure before claiming.** Do not report a suite as passing without running it. Do not
  describe code you have not read.
- **Report honestly.** If something does not work, say so plainly. A known gap is
  manageable; a false green is not.
- **Do not weaken a test to make it pass.** If a test fails, either the code is wrong or
  the test encodes a decision that changed — and changing a decision is a conversation.
- **Do not silence a warning.** Fix it.
- **Prefer deleting to adding.** The previous build failed from accumulated surface area,
  not from missing features.
