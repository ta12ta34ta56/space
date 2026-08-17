# Setting up the fresh repository

> Read this once, before the first build session. It takes about ten minutes.

---

## ⚠️ The one thing you must not get wrong

**The new repo needs the old code in it.**

Not to run. Not to build. To **copy from**.

About 25,000 lines are ported by copying the file: the five generator algorithms, all the
word and clue banks, the KDP margin math, preflight, the SVG sanitiser, 130 SVG assets, 20
parametric templates, and ~9,300 lines of tests. Roughly 60% of the finished app is code
that already exists and already passes its tests.

**If the new repo contains only `context/`, none of that can be ported and the plan
collapses into a full rewrite** — months of re-deriving algorithms that already work.

So the fresh repo starts with **three** things:

```
your-new-repo/
├── AGENTS.md          the entry point
├── context/           all the planning
└── legacy/            the previous build — reference only, never compiled
```

`legacy/` is deleted in Unit 23, after every port has been verified. Not before.

---

## Step by step

### 1. Create the repository on GitHub
Private is fine. Do **not** initialise it with a README, `.gitignore`, or licence — you
want it empty.

### 2. Clone it and add the three pieces

```bash
git clone https://github.com/YOUR-ACCOUNT/novelka.git
cd novelka

# the planning
cp -r /path/to/old/novelka/context .
cp /path/to/old/novelka/AGENTS.md .

# the porting source
mkdir legacy
cp -r /path/to/old/novelka legacy/
rm -rf legacy/novelka/node_modules legacy/novelka/dist
```

### 3. Add a `.gitignore` before the first commit

```
node_modules
dist
*.tsbuildinfo
.DS_Store
.env
.env.*
!.env.example
**/*.built.mjs
```

### 4. Tell the agent that `legacy/` is off limits

Add this to `AGENTS.md` under Status — it is the guard rail that stops an agent trying to
run, lint, or "fix" the old build:

```md
`legacy/` is the previous build. It is **reference only**: never compiled, never linted,
never imported by new code, never modified. Read it to port from it. Nothing else.
```

### 5. Commit and push

```bash
git add .
git commit -m "chore: context system and legacy reference"
git push
```

### 6. Start the first session

Open the repo in your editor and say:

> Read `AGENTS.md` and every file it points to. Then implement
> `context/specs/01-skeleton-and-model.md` exactly as written. Do not go beyond the scope
> of this unit.

---

## Do NOT run `create-next-app`

The video uses `npx create-next-app@latest .` because Ghost AI is a **Next.js** app.

Novelka is **not**. It is a static Vite + React site with no server (D12). Next.js is
built around server-side rendering, which you deliberately do not have.

The Unit 01 spec handles scaffolding. If you want the command:

```bash
npm create vite@latest . -- --template react-ts
```

But let the agent do it as part of Unit 01, so the tsconfig strictness and the test harness
are set up correctly at the same time.

---

## Where CodeRabbit fits

CodeRabbit reviews **pull requests**. So the loop is one PR per unit:

1. Agent implements Unit NN on a branch `feat/NN-name`
2. Agent runs `npm run check` — must be green
3. Open a PR
4. **CodeRabbit reviews it**
5. Read the review. Fix what is real, dismiss what is noise
6. Merge, then start the next unit

### What CodeRabbit is good at
Logic slips, unhandled edge cases, missed error paths, inconsistencies, security smells,
things a tired human skims past at 2am.

### What it cannot do
It has not read your context files. It does not know the Document is the only source of
truth, that puzzles are single objects, or that layout must never silently overflow.

**It will sometimes suggest changes that violate your architecture.** When that happens,
you are right and it is wrong. The correct response is to dismiss the comment, not to
follow it.

> **Rule: CodeRabbit advises. `context/` decides.**

### The review that actually matters
Before merging any unit, check it yourself against the unit's own checklist:

- Does it violate any numbered invariant in `architecture.md`?
- Did it redesign something protected under D17?
- Did it invent behaviour the spec did not ask for?
- Is `npm run check` green?

CodeRabbit will not catch any of those four, because they are specific to your project.
That check is yours.
