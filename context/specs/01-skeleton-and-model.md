# Unit 01 — Project skeleton and the Document model

> **Read first:** `AGENTS.md`, then `context/architecture.md` (§2 Document model, §3 units,
> §10 invariants), `context/decisions.md` (D2, D3, D18), `context/code-standards.md`.

---

## Goal

Create a clean Vite + React + TypeScript project at the **repository root** containing the
**`model/` layer only**: the Document types, the unit conversion module, document creation and
migration, and their tests. Nothing renders. No canvas, no Fabric, no UI beyond a
placeholder root.

This unit exists to make the Document **real, typed, and tested** before anything depends
on it.

---

## Design

No visual design in this unit. The only UI is `App.tsx` rendering the text
`Novelka` on the dark background token so the dev server proves it runs.

---

## Implementation

### 1. Project setup

Scaffold at the **repository root**. The fresh repo starts with only `AGENTS.md`,
`context/`, and `legacy/` (see the note below) — the app is created here.

> **Do NOT run `create-next-app`.** That is Next.js, and it is wrong for this project.
> Novelka is a **static Vite + React** site with no server (D12). Use:
> `npm create vite@latest . -- --template react-ts`

- Vite + React 19 + TypeScript, ESM, `"type": "module"`
- `tsconfig` with `strict: true`, `noUncheckedIndexedAccess: true`,
  `exactOptionalPropertyTypes: true`, `noImplicitOverride: true`
- oxlint configured to fail on warnings
- Test harness matching the current one: esbuild bundles a module, plain Node runs the
  `.test.mjs` beside it. **Copy this pattern from `legacy/novelka/package.json`** —
  it already works and produces readable output.
- Scripts: `dev`, `build`, `lint`, `test`, `check` (lint → tsc → test → build)

**Dependencies in this unit:** `react`, `react-dom`, `nanoid`. Dev: `vite`,
`@vitejs/plugin-react`, `typescript`, `oxlint`, `esbuild`, `@types/*`.
**Nothing else.** No Fabric, no pdf-lib, no zustand yet — those arrive in the unit that
first needs them.

### 2. `src/model/units.ts`

The **only** place unit conversion exists.

```ts
export const PT_PER_IN = 72;

export const inToPt = (inches: number): number => ...
export const ptToIn = (pt: number): number => ...
export const inToPx = (inches: number, scale: number): number => ...
export const pxToIn = (px: number, scale: number): number => ...
export const roundIn = (inches: number): number => ...   // to 4 dp, kills float drift
```

Rules:
- Every function rejects non-finite input by throwing a named error. Silent `NaN`
  propagation into geometry is the bug class this prevents.
- No other file in the codebase may contain `* 72` or `/ 72`.

### 3. `src/model/types.ts`

Exactly as specified in `architecture.md` §2. Key points the implementer must not
improvise:

- **All geometry in inches**, every field suffixed `In` (`xIn`, `wIn`) or `Pt` for type
  sizes (`fontSizePt`).
- `readonly` on every field and every array.
- No `undefined` — use `null`.
- `Element` is a discriminated union on `type`, and **carries `kind` for asset identity**
  (D18):

```ts
export type ElementKind =
  | 'text' | 'shape' | 'image'
  | 'divider' | 'border' | 'pattern' | 'sticker' | 'icon'
  | 'puzzle' | 'solution' | 'template';
```

- The `puzzle` element holds `{ kind, data, style }` as three separate objects (D3).
  In this unit `PuzzleData` and `PuzzleStyle` are declared as opaque per-generator types
  (`Record<string, never>` placeholders are acceptable) — they are filled in Unit 12.
- `Document` carries `schemaVersion: number`, starting at `1`.

### 4. `src/model/document.ts`

- `createDocument(input): Document` — builds a valid empty document. Takes `trimId`,
  `paper`, `binding`, `pageCount`, and an injected `now: () => number` and
  `id: () => string`. **No `Date.now()` or `nanoid()` called inside** (code-standards).
- `migrate(raw: unknown): Document` — validates and upgrades. Version 1 is the base case;
  the migration chain exists from day one so adding version 2 is mechanical.
- `assertValidDocument(doc)` — throws with a specific message on any invariant breach:
  duplicate ids, negative dimensions, non-finite geometry, an element outside its page,
  a cover in `pages[]`.

Migration must be a **chain of pure functions** (`v1→v2`, `v2→v3`), not a switch that
handles every version separately.

### 5. `src/model/index.ts`

Re-export the public surface. This is the one permitted barrel file.

### 6. Placeholder app

`src/main.tsx` + `src/App.tsx` rendering `Novelka` on `--workspace`. `src/index.css`
containing **only** the colour tokens from `ui-context.md` §2. No component styling yet.

---

## Tests

Written as `.test.mjs` beside the source, run by plain Node.

### `units.test.mjs`
- `inToPt(1) === 72`, `ptToIn(72) === 1`
- round-trips at 0.125, 0.375, 6, 8.27 hold to 4 dp
- `inToPx` / `pxToIn` round-trip at scale 1, 2, 3.5
- non-finite input (`NaN`, `Infinity`, `undefined`, `'6'`) throws

### `document.test.mjs`
- `createDocument` produces a document passing `assertValidDocument`
- injected `now` and `id` are used — the same inputs produce **byte-identical** output
  (this is the purity proof)
- every element kind in `ElementKind` constructs and survives
  `JSON.parse(JSON.stringify(doc))` **unchanged** (deep-equal assertion)
- `assertValidDocument` throws on: duplicate page id, duplicate element id, negative
  `wIn`, `NaN` in a frame, a cover object inside `pages[]`
- `migrate` accepts a valid v1 document unchanged
- `migrate` rejects malformed input with a useful message, never returns a broken document

**The serialisation round-trip test is the most important test in this unit.** It is what
enforces invariant 1 for the life of the project.

---

## Dependencies

- `nanoid` — id generation (injected, never called inside pure functions)

No other new dependency. If the implementation seems to need one, the design is wrong —
stop and raise it.

---

## Verify when done

- [ ] `npm run lint` — 0 errors, **0 warnings**
- [ ] `npx tsc -b` — clean
- [ ] No `any`, no `@ts-ignore`, no non-null `!` outside `assertValidDocument`
- [ ] `npm run test` — all model tests pass
- [ ] `npm run build` — passes
- [ ] `npm run dev` serves a page with no console errors
- [ ] **`grep -r "fabric" src/` returns nothing**
- [ ] **`grep -rE "\* ?72|/ ?72" src/ --include=*.ts` matches only `model/units.ts`**
- [ ] Every geometry field is suffixed `In` or `Pt`
- [ ] `apply` does not exist yet (that is Unit 02) and nothing imports a store
- [ ] `context/progress-tracker.md` updated

---

## Explicitly NOT in this unit

Commands and `apply()` (Unit 02). Any store. Any rendering. Any KDP math — no trim table,
no margins, no cover (Unit 03). Storage (Unit 04). Any real UI.

If the spec seems to be missing something needed to finish, **it is not missing — it
belongs to a later unit.** Do not pull work forward.

---

## Note for the implementer

`legacy/src/types/canvas.types.ts` carries this comment:

> *"Fabric JSON is the canonical element model. Do not add a parallel element abstraction
> unless the Fabric persistence layer is replaced."*

That replacement is precisely what this unit begins. The old constraint no longer applies,
and the old file is **not** a template for the new one.
