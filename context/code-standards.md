# Code Standards — Novelka

> Implementation rules and conventions. These are **rules**, not preferences. Code that
> violates one is wrong even if it works. Where this file and a spec disagree, this file
> wins.

---

## General

- **Keep modules small and single-purpose.** A file over ~400 lines is a smell; over 800
  it must be split. (Reference: the previous build had a 1,446-line engine and a 47 KB
  template file. Both became unmaintainable.)
- **Fix root causes. Never layer a workaround.** If a value arrives wrong, fix where it is
  produced, not where it is consumed. No defensive clamping to hide an upstream bug.
- **Do not mix unrelated concerns** in one file, one function, or one commit.
- **Pure by default.** If a function can be pure, it is pure. Side effects live at the
  edges (storage, canvas, PDF, DOM) and nowhere else.
- **Delete rather than disable.** No commented-out code, no dead branches, no
  `if (false)`. Git remembers.
- **No speculative abstraction.** Two call sites is a function. One is inline. Do not
  build a plugin system for a thing that has one implementation.
- **Name things after the domain**, not the pattern: `spineWidthIn`, not `calcVal`.
  `PuzzleStyle`, not `ConfigObject`.

---

## TypeScript

- **Strict mode, everywhere.** `strict: true`, `noUncheckedIndexedAccess: true`,
  `exactOptionalPropertyTypes: true`.
- **`any` is banned.** No exceptions. The previous build achieved zero `any` across 32,800
  lines; that record is kept. Use `unknown` and narrow.
- **`@ts-ignore` and `@ts-expect-error` are banned** outside a test that is explicitly
  asserting a type error.
- **Non-null assertion (`!`) is banned** outside `model/` invariant checks, where it must
  be accompanied by an `assert` that throws with a useful message.
- **Validate unknown external input at the boundary**, before it is trusted: loaded
  documents, imported PDFs, uploaded SVGs, user word lists, URL parameters. Parse into a
  known type; never cast.
- **Prefer discriminated unions over optional fields.** `{ t: 'ok', value } | { t: 'fail',
  reason }` beats `{ value?, error? }`.
- **Readonly by default** for Document types. `readonly` arrays and properties.
- **No enums.** Use string literal unions.

### Units are part of the type

Every number carrying a physical dimension is named with its unit: `widthIn`, `fontSizePt`,
`offsetPx`. A bare `width` on a geometric type is a bug. Conversions happen only in
`model/units.ts`.

---

## The Document and Commands

- **`apply(doc, cmd)` is pure.** No I/O, no `Date.now()`, no `Math.random()`, no mutation
  of the input. Time and randomness are passed in.
- **Never mutate the Document.** Produce a new one. Structural sharing is fine.
- **Nothing writes the Document except `state/doc-store.ts`.** Everything else dispatches
  a Command.
- **Nothing stores a renderer object in the Document.** No Fabric objects, no DOM nodes,
  no class instances, no functions. If it will not survive `JSON.parse(JSON.stringify(x))`
  unchanged, it does not belong.
- **Every schema change bumps `schemaVersion` and ships a migration and a test**, in the
  same commit. A book saved by any earlier version must open.
- **Commands are named after user intent**, not implementation: `page/reorder`, not
  `array/splice`.

---

## React

- **Components render. They do not compute domain values.** A component may not calculate
  a margin, decide a font size, derive a spine width, or lay out a puzzle. It reads a
  value from a lower layer and displays it.
- **No domain logic in `useEffect`.** Effects synchronise with the outside world
  (subscriptions, canvas mount, keyboard listeners) and nothing else.
- **Do not bridge state with effects.** If an effect exists to copy state from one place
  to another, the architecture is wrong. (The previous build had 97 such effects; they
  were the crash.)
- **Derive, do not duplicate.** No `useState` mirroring a store value.
- **Local `useState` is only for genuinely local, ephemeral UI** (a text field mid-edit, a
  hover flag). Anything another component needs is in a store.
- **Keys are stable ids**, never array indices.
- **One component per file.** The file is named after the component.
- **Props are typed explicitly.** No `React.FC`, no implicit `any` children.

---

## Rendering

- **`import 'fabric'` appears only in `render/canvas/`.** Grep-enforced. Everywhere else
  imports our own types.
- **The renderer holds no state that outlives a frame.** Test: destroying and recreating
  the canvas on every render must change nothing but performance.
- **Caches are keyed and disposable.** A cache may exist for speed; correctness must never
  depend on it being warm.
- **Guides are DOM overlays.** Never Fabric objects, never in `elements`, never in
  thumbnails, never in export.
- **One geometry definition.** Screen, thumbnail, and PDF read the same `elements` through
  the same layout functions. They must not be able to disagree.

---

## Layout functions

- **A layout function is pure**: `(input, frame, style) => Result`.
- **It returns a result, never a guess.** If content cannot fit legibly, return
  `{ t: 'fail', reason }`. **Silently overflowing the frame is banned.** (Reference: the
  crossword clue-fitting loop stopped shrinking at 5.5pt and placed the clues anyway,
  producing overlapping unreadable text.)
- **Minimum legible sizes are hard floors**, defined once as named constants, not magic
  numbers scattered through the code.
- **Layout never reads the full page.** It receives the rectangle it is allowed to draw in.
  Bleed-intent layouts request the bleed box explicitly.

---

## Styling

- **CSS custom property tokens only. No hardcoded hex, ever**, outside the token
  definition file and the fixed print-guide colours in `ui-context.md`.
- **No arbitrary spacing.** Use the 4px scale tokens.
- **Radius:** `--r-sm` (3px) or `--r-md` (5px). Nothing else.
- **No drop shadows** except the paper page and modal focus.
- **No inline styles** except computed geometry (a canvas position that must be a runtime
  pixel value).
- **Motion:** 120ms state, 180ms panels, nothing else animates. Honour
  `prefers-reduced-motion`.
- The full visual specification is `ui-context.md`. **Never invent a visual value.**

---

## User-facing copy

- **No em dashes in UI strings.** Short sentences and full stops. (This is a
  machine-generated-text tell and the product must not read that way.)
- **No emojis in the interface.**
- Errors state what happened, which page, and the fix.
- Every number carries a unit: `0.375 in`, never `0.375`.
- Print vocabulary is used correctly and explained on first use.

---

## Security and input handling

No backend exists in v1, which removes most of the standard risk surface. These five
remain and are **hard rules**:

1. **Validate every external input at the boundary.** Word lists, custom clues, titles,
   page counts, imported PDFs, uploaded SVGs, loaded project files. Bound the length,
   check the type, reject the malformed. Never trust a saved file just because we wrote it.
2. **Never render user content as raw HTML.** `dangerouslySetInnerHTML` is banned.
   Uploaded SVGs go through the sanitiser (ported, 51 checks) before they are used.
3. **Validate file uploads** by type, size cap, and structure before parsing.
4. **No stack traces in production.** The error boundary shows a human message and a
   "download my work" action. Never a raw error.
5. **Keep dependencies current and few.** Every added dependency needs a stated reason.
   No dependency is added inside a unit that does not use it.

Additionally: ids are `nanoid`, never sequential integers. No secrets exist in the client
because no service requires one. If that ever changes, the key does not go in the client.

---

## Testing

Testing is not optional, and the previous build shows exactly why: the templates had a
95,677-check safe-area audit and were correct; the crossword layout had **zero** layout
checks and was broken. **Coverage must follow risk, not convenience.**

- **Every pure module has tests.** `model/`, `print/`, `generators/`, `templates/` are pure
  and must be tested with plain Node, no DOM.
- **Every `apply(doc, cmd)` case has a test** asserting the resulting Document.
- **Every generator and every template has a layout audit** at all six trims, recto and
  verso, at each gutter band, asserting:
  - no element outside the safe area
  - no two elements overlapping
  - no line thinner than 0.75pt
  - no text below the legible floor
- **Cover math is tested against a reference table** of known-good KDP values. A change
  that breaks a reference value fails the build.
- **Every migration has a test** that loads a document from the previous version.
- A bug fix starts with a **failing test that reproduces it**.
- Tests assert behaviour, not implementation. No snapshot tests of internal structure.

---

## File organization

```
src/
├── model/        Document types, commands, apply(), migrations, units. Imports nothing.
├── print/        KDP truth: trims, margins, gutter, cover geometry, preflight.
├── generators/   One folder per generator: generator, layout, schema, banks + registry.
├── templates/    Parametric page designs. (safeArea, params) => Element[].
├── render/       canvas/ (only place Fabric is imported), pdf.ts, thumbnail.ts
├── state/        doc-store (the only writer), ui-store, storage (IndexedDB).
├── ui/           app/, views/, panels/, kit/. No domain logic.
└── assets/       SVGs, fonts. Data, not code.
```

- **Dependencies point downward only.** `ui/` may import `model/`; `model/` imports
  nothing. A lower layer importing a higher one is a build failure.
- Tests live beside the code they test: `margins.ts` → `margins.test.mjs`.
- One exported concept per file. The filename matches it.
- No `utils/` dumping ground. If something has no home, the boundaries are wrong.
- No barrel `index.ts` re-export files except `generators/registry.ts`, which is a real
  registry.
