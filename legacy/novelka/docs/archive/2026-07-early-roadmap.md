# Novelka — where we are, what's next

Last updated: 2026-07-27

## Where we are

**Done and tested:**

- Phase 1 — full canvas editor (pages, undo/redo, layers, snapping, align, zoom,
  129 recolorable SVGs, font browser, PDF/PNG/JPG export with real selectable text,
  KDP guides + preflight + spine calculator + cover creator, 20 templates, 14 rulings,
  page numbers with KDP mirroring, PDF import, preview)
- Sudoku module — 4x4 / 9x9 / 16x16, every puzzle proven unique, 13 page designs
- Word Search module — 14 word banks, 7 designs, template-aware layout
- Crossword module — 10 clue banks / 260 clues, 7 designs, clues|words|both
- IndexedDB storage (fixed the data-loss bug), ErrorBoundary with "Download my work"
- Phase 2 so far:
  - Feature flags — 16 features, combinable free/ad/paid routes, daily limits
  - Content registry — 74 gateable items, owner overrides, bulk actions
  - Auth — sign up / in / sessions / roles / owner tools (mock backend)
  - Hidden admin — no button anywhere, `gpadmin` / `#gp-control` / `__gpControl()`,
    and `npm run build:public` strips the code out of the bundle entirely

**Test counts:** admin 20, auth 44, flags 71, word search 30, crossword 42, sudoku pass.
Lint 0 errors on 89 files.

## The honest gap

Everything is client-side. A user with devtools can set their own tier to `pro`,
clear a daily limit, or unlock ad-gated content. **Nothing stops them.**

That is fine today because nobody is paying. It is NOT fine the day you charge money.
So the order below is deliberate.

---

## The remaining road, in order

### 1. Backend (Supabase) — the real unlock  ← recommended next
Moves accounts, tiers and entitlements to a server so they can't be faked.

**What I do:** write the whole integration — schema, auth swap, gate checks
server-verified, migration from the mock store so existing local accounts survive.

**What YOU do (10 minutes, I can't do it for you):**
1. Go to supabase.com → sign up (free tier is plenty)
2. New project → pick a region near your users → set a DB password
3. Project Settings → API → copy **Project URL** and **anon public key**
4. Paste both to me here

Then I write `.env.local`, the SQL schema, and wire it up.

### 2. Stripe — take money
Only after step 1. Checkout, webhook that writes the tier to Supabase, billing portal.

**What YOU do:** create a Stripe account, add products for Basic $4.99 / Pro $9.99 /
Enterprise $24.99, send me the publishable key + price IDs. Payouts need your ID
and a bank account — that part is only you.

### 3. Real ads
Right now the ad is a 5-second placeholder countdown. A real network (AdSense /
Adsterra / a rewarded-video SDK) needs a site that is already live with traffic,
so this realistically comes after launch.

**What YOU do:** the site has to be deployed and public first (see step 5).

### 4. Polish I can do alone, no accounts needed
- ~~Port template-aware layout into `sudoku-maker/layout.ts`~~ **DONE 27 Jul** —
  the size slider now respects the design's own slot, the grid stays centred in
  its frame when resized, and repeated drags don't drift (verified in-browser,
  7/7 geometry checks)
- ~~Word search shrink left a void under the word list~~ **DONE 27 Jul** — the
  grid+bank block now centres in the space the template reserved
- Tag the genuinely slot-relative chrome (word-bank frame, two-up divider) so it
  follows a resize. Note: most "stuck" chrome is page furniture — background,
  frame, title, footer — and is *supposed* to stay put. Smaller job than it looked.
- Same-page-bottom solutions for word search + crossword
- Accessibility pass (only 5 aria-labels across ~24k lines right now)
- Harden the Fabric SVG import against the XSS advisory

### 5. Deploy
`npm run build:public` → drop `dist/` on Vercel or Netlify (both free, drag-and-drop
or connect a GitHub repo). Buy a domain. Your local admin unlock still works because
you run the normal `npm run build` for your own copy.

---

## If you just want to sell something this month

Skip 1 and 2. Deploy the free version (step 5), let people make books, put a
"buy me a coffee" or a Gumroad link for a template pack on it. Learn whether
anyone wants it before building billing infrastructure for nobody.

I lean toward this, honestly. Backend + Stripe is maybe two solid sessions of work,
and it's wasted if the answer to "does anyone want this" is no.

---

## Your PC — one thing to check

If Vite fails on Windows with:

    Failed to load PostCSS config ... Unexpected end of JSON input

open `vite.config.ts` and make sure it contains:

    css: { postcss: { plugins: [] } }

That stops Vite from climbing up out of the project folder looking for a config.

## Running it locally

    npm install
    npm run dev            # your build, admin unlock works
    npm run build:public   # public build, admin code physically removed
    npm run lint
    npm run test:sudoku    # and :wordsearch :crossword :flags :auth :admin
