Read the following files in order before implementing
or making any architectural decision:

1. `context/project-overview.md` — product definition,
   goals, features, and scope
2. `context/architecture.md` — system structure,
   boundaries, storage model, and invariants
3. `context/ui-context.md` — theme, colors, typography,
   and component conventions
4. `context/code-standards.md` — implementation rules
   and conventions
5. `context/ai-workflow-rules.md` — development workflow,
   scoping rules, and delivery approach
6. `context/progress-tracker.md` — current phase,
   completed work, open questions, and next steps

Update `context/progress-tracker.md` after each
meaningful implementation change.

If implementation changes the architecture, scope, or
standards documented in the context files, update the
relevant file before continuing.

---

## Project-specific context

Four additional files support the six above. Read them
when the situation calls for it.

7. `context/decisions.md` — every locked decision (D1–D24)
   and the reasoning behind it. **Read before proposing any
   change to how the system works.** A decision is reversed
   by conversation, not by implementation.
8. `context/owner-review.md` — what the owner loves and must
   not lose, what is broken, what was simplified. **Read
   before touching any existing UI surface.**
9. `context/feature-inventory.md` — every feature surface,
   marked KEEP / CUT / CHANGE.
10. `context/inventory.md` — the measured audit of the
    previous build, and what is ported versus rebuilt.

Then read `context/specs/00-build-plan.md` for the unit
order, and `context/specs/NN-*.md` for the unit you are
implementing.

---

## The three rules that matter most

1. **The Document is the only source of truth.** Fabric
   renders it and stores nothing. Every change is a pure
   command: `apply(doc, cmd) -> Document`.
2. **A generated puzzle is one semantic object** — data,
   style, and frame. Never a pile of cells. Restyling sets
   a field; it never reaches inside to patch pieces.
3. **Layout returns a result, never a guess.** If content
   cannot fit legibly, report it. Silently overflowing the
   safe area is banned.

## Before starting work

- If two context files disagree, **stop and raise it**. Do
  not choose one.
- If a requirement is missing, add it to
  `progress-tracker.md` as an open question. Do not invent
  product behaviour.
- Check the numbered invariants in `architecture.md`
  explicitly before declaring a unit done.

## Status

**Phase 0 — planning complete, implementation not started.**

`src/` and `server/` are the **previous build**, kept as the
reference implementation and the source of ported logic.
They are not the codebase being extended. Roughly 25,000
lines of proven pure logic — generator algorithms, KDP
margin math, word banks, preflight, the SVG sanitiser, 20
parametric templates, ~9,300 lines of tests — are ported by
copying the file, not rewritten.

Next unit: **01 — project skeleton and the Document model.**
