# Novelka — status

Single source of truth. Updated 4 August 2026.

Other documents: `SETUP.md` (accounts you must create), `README.md` (how the
app works), `server/SECURITY.md` (threat model). Superseded plans are in
`docs/archive/` and should not be followed.

---

## 1. Verification — one command

```
npm run check
```

Runs, in order: lint → TypeScript → unit suites (incl. server-test build) →
4 server suites → build → secret scan. Any failure stops the chain.

`npm run test:rls` is separate because it needs a local PostgreSQL.

### Current results

| Suite | Checks | Status |
|---|---|---|
| sudoku | — | PASS |
| word search | 30 | PASS |
| crossword | 42 | PASS |
| feature flags | 84 | PASS |
| auth (local mock) | 64 | PASS |
| auth (Supabase adapter) | 29 | PASS |
| admin access | 20 | PASS |
| SVG sanitiser | 51 | PASS |
| handwriting | 94 | PASS |
| maze | 52 | PASS |
| canvas engine | 18 | PASS |
| stripe webhook | 18 | PASS |
| entitlement | 30 | PASS |
| request router | 24 | PASS |
| GDPR | 29 | PASS |
| ratings | 29 | PASS |
| RLS (real PostgreSQL 17) | 25 | PASS |
| **Total** | **649+** | **all passing** |

Lint: 0 warnings, 0 errors. Build: OK. Secret scan: clean.

---

## 2. What is built

### Editor — complete
Multi-page canvas, unlimited undo/redo, layers, smart guides, align/distribute,
group/ungroup, zoom 10–500%, 129 recolourable SVGs, font scanner, PDF export
with real selectable text, PNG/JPG, page ranges, KDP guides + preflight + spine
calculator + 8 trim presets, cover creator, 20 page templates, 14 rulings, PDF
import, full-screen preview, bulk pages, KDP-mirrored page numbers.

### Sharp rendering — complete
The canvas is rendered at full physical resolution at every zoom: integer CSS
sizes, devicePixelRatio-aware backing store, 2× supersampling (capped at
4096 px so huge pages cannot exhaust GPU memory), and re-render on display
changes (monitor swap, browser zoom). Preview pages render at exactly the
display size × DPR and re-render when the zoom slider, view or window
changes — no more upscaled blur in single, spread or grid view. Home-screen
thumbnails render at 2× display width.

### Preview — sharp and fast
Preview pages render at 2× supersampled resolution (display size × DPR × 2) as
lossless PNG, and each page keeps its highest rendered scale: zooming OUT is
instant and always sharp (pure CSS downscale), zooming IN shows a crisp 2×
image immediately and upgrades after 150 ms. Page JSON is parsed once into a
bounded LRU cache (zoom re-renders are rasterise-only), grid view renders only
on-screen cells, and the image cache is capped (18 spread / 140 grid).

### Storage — lean
`canvas-engine.toJSON()` now serializes with `includeDefaultValues: false` —
fabric re-applies defaults on load, so round-trips are exact while saved JSON
shrinks dramatically (a 5.7 MB crossword book saves as ~2 MB). Autosave
writes less, the 200-step undo history holds more, and old books saved with
full defaults still load.

### Bundle — leaner
pdfjs-dist (~1.3 MB) is now lazy-loaded: the PDF importer fetches it only
when a user actually imports a PDF. Main bundle: 1.42 MB → 1.10 MB; the
library ships as its own on-demand chunk. supabase-js is likewise on-demand.

### App identity — renamed to Novelka
Gridpress → Novelka everywhere: UI copy, package names, PDF producer/creator,
watermark text, GDPR export filenames, MIME types, docs. Persisted data
migrates transparently: localStorage keys (`gridpress.*` → `novelka.*`, read
once then dropped), module page tags (`gridpress:` → `novelka:`, legacy still
read), and the IndexedDB database (`minipdf` → `novelka`, copied once).
Password hashes keep their original hash domain so pre-rename accounts still
sign in.

### Ratings — complete (client + server)
A star button in the editor top bar and home screen opens the rating dialog:
1–5 stars, optional comment and optional email (prefilled when signed in).
Ratings are always saved locally (`novelka.rating.v1`), and POSTed to
`POST /api/rating` when the server is configured — a new public, rate-limited
route with its own `ratings` table (RLS: insert for anyone, reads
service-role only). A gentle prompt appears once after a successful export or
save; it never nags after a rating or two dismissals.

### Social links
`src/services/social-links.ts` holds the creator's profiles (YouTube,
Instagram, TikTok, Facebook, X, LinkedIn, GitHub, email). Filled-in links
render as buttons in the home-screen footer; placeholders stay hidden until
you paste your real URLs.

### Puzzle modules — complete
- **Sudoku** — 4×4 / 9×9 / 16×16, every puzzle proven to have exactly one
  solution, 13 page designs, off-thread worker. 16×16 hard: 20,000ms → 2,100ms.
- **Word search** — 14 word banks, 7 designs, template-aware layout.
- **Crossword** — 10 clue banks / 260 clues, 7 designs, clues|words|both.

### Storage — complete
IndexedDB (localStorage's ~5 MB cap lost a 5.7 MB book), `StorageFullError`,
honest failure warnings, legacy migration, ErrorBoundary with "Download my work".

### Theme — complete
Light / dark, dark by default (no "match my system" state). 62 hardcoded colours
replaced with role-named tokens.
No flash of wrong theme (inline script in `index.html` runs before first paint).
Canvas paper stays white in both themes — it is a print preview and must not lie.

### Backend — built and tested, NOT deployed
- `server/db/schema.sql` — RLS on every table, column-protection trigger
- `server/src/routes/stripe-webhook.ts` — signature verified, idempotent
- `server/src/routes/checkout.ts` — server-side price lookup
- `server/src/routes/entitlement.ts` — tier + quota + signed grants
- `server/src/routes/gdpr.ts` — Article 15/20 export, Article 17 erasure
- `server/src/handler.ts` — router, adapters for Cloudflare and Vercel
- `server package.json` — `npm run test:unit` builds the TS entries
  (`dist-test/`) before running the four server suites; `npm run check` no
  longer fails on a missing build step.

### Client ⇄ server wiring — code complete, needs the environment
`src/services/auth.ts` is now a Supabase-backed adapter. When
`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` are set (see `.env.example`),
the app uses real accounts, real sessions and the server's entitlement; with
no keys it falls back to the local mock so the editor works anywhere.

- `auth-store` exposes `session.access_token` and follows Supabase session
  changes (refresh, expiry, other tabs).
- `flag-store.syncFromServer()` mirrors `GET /api/entitlement` — tier, today's
  usage and server flag rows (`export_pdf` ↔ `export.pdf` mapping in
  `feature-flags.ts`). Offline/server-down keeps the last known local view.
- PDF export calls `consumeFeature('export_pdf')` before rendering and honours
  the signed `watermark` decision — the toggle locks on for free users and the
  grant cannot be minted or widened client-side.
- `UpgradePrompt` calls `startCheckout(tier)` (Stripe Checkout redirect) when
  signed in and configured; the local simulation remains the fallback.
- Account screen (click your name in the top bar): GDPR Article 15/20 export
  and Article 17 erasure via the server, plus sign-out.
- Seed fix: `export_pdf` in `server/db/test/01-seed.sql` now has
  `route_free = true` — free users export (watermarked, 5/day) as the product
  rules say; paid users are uncapped.

---

## 3. Known gaps — ordered by risk

### 3.1 Entitlement is server-side, but the server is not deployed 🟡
The client now calls the server for tier, quotas and the export grant — the
DevTools tier hack is closed the moment the API is reachable. What remains is
environment: the server must be deployed (Cloudflare/Vercel adapter, `server/`
folder) and the Supabase keys put in `.env` (client) and `server/.env`.

**Do not charge money until this is live and the Stripe webhook is verified.**

### 3.2 Admin is not enforced server-side 🔴
`is_owner` exists in the database and `entitlement.ts` reads it, but there is no
admin API route. Protection today is that `npm run build:public` physically
removes the admin code from the bundle — real, but not server enforcement.

**A subdomain alone would be security theatre.** `admin.novelka.com` is a DNS
record; without server checks it changes nothing. Correct order:
1. `requireOwner()` guard + admin API routes that verify `is_owner` in Postgres
2. Then subdomain isolation on top

### 3.3 Rate limiting is per-instance 🟡
In-memory, so on serverless the true ceiling is `limit × instances`. Adequate
against one abusive client; not a hard global cap. Replace `rateLimit()` with
Upstash Redis or a Durable Object when traffic justifies it.

### 3.4 Stripe cancel-on-delete not wired 🟡
`handleDeleteAccount` accepts a `cancelStripeSubscriptions` hook and the test
covers it, but the production implementation is not injected. If forgotten, a
deleted account keeps being billed.

### 3.5 Client auth mock is now the fallback, not the default 🟢
`src/services/auth.ts` uses Supabase Auth whenever keys are configured; the
localStorage mock (PBKDF2, 210k iterations) remains only as a no-keys
fallback. Accounts span devices once `.env` has the keys. Passwords are
never seen by Novelka — Supabase handles them.

---

## 4. Next task — deploy the environment

The code is wired; what is missing is operations. In order:

1. **Rotate the exposed Supabase secret key** (Project Settings → API Keys →
   Rotate). Then set `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in
   `novelka/.env` and `server/.env` (see `.env.example` files).
2. **Deploy the server** (`server/`) with the Cloudflare or Vercel adapter.
   Point `VITE_API_BASE` at it (or serve the client from the same origin).
3. **Create the Stripe account**, add the three price IDs to `server/.env`,
   register the webhook endpoint (`/api/stripe/webhook`), and inject the
   production `cancelStripeSubscriptions` hook (closes §3.4).
4. **Verify end-to-end**: sign up, export (watermark + quota), upgrade
   (Checkout → webhook → tier).
5. Then §3.2 — `requireOwner()` admin API routes.

---

## 5. Accounts

| Service | Status |
|---|---|
| Supabase | **Live.** Project `mfadnnmkxkzsplerizvk`, schema applied, RLS verified against the deployment |
| Stripe | Not created — needs the account holder |
| Cloudflare | Not created |

⚠️ The Supabase secret key was exposed in chat on 28 July and **must be
rotated** (Project Settings → API Keys → Rotate). No data existed at the time.
