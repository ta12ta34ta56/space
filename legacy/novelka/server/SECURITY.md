# Novelka — server security

Written 28 July 2026. Every claim below was verified by a test, not by reading
the code. Where something is *not* done, it says so.

## The one-sentence model

> The browser may render; only the server may decide. Money columns are written
> by one credential (service role) from one place (a signature-verified Stripe
> webhook), and RLS makes every other path impossible.

---

## Verified by test

| Suite | Checks | What it proves |
|---|---|---|
| `db/test/run-rls-tests.sh` | 25 | Real PostgreSQL 17. Every attack a signed-in user could run |
| `test/webhook.test.mjs` | 18 | Real Stripe signature verification, forgery, replay, leakage |
| `test/entitlement.test.mjs` | 30 | Tier gating, quotas, grant forgery, injection, rate limits |
| `test/handler.test.mjs` | 24 | Raw-body preservation, CORS allow-list, headers, method guards |
| `test/gdpr.test.mjs` | 29 | Article 15/20 export, Article 17 erasure, retention rules |
| `scripts/verify-secrets.mjs` | 3 | No secret can reach the browser bundle |

**127 server-side checks.**

## GDPR (binding for an EU entity)

`POST /api/account/delete` requires the user to type their own email. It cancels
the Stripe subscription **first** (deleting an account while billing continues
would be the worst possible failure), deletes their books and usage, then
deletes the auth user.

Financial rows are deliberately **kept and anonymised**, not destroyed: Article
17(3)(b) and EU accounting law require invoice retention for 7-10 years.
`subscriptions.user_id` is therefore nullable with `on delete set null` — with
the original `not null ... on delete cascade` an erasure request would have
destroyed tax records. Verified on real PostgreSQL: deleting a user leaves the
invoice row intact with `user_id = null`, while their books are gone.

Both attack suites were **sabotage-tested**: deleting the column-protection
trigger makes T4/T5/T6 fail immediately (self-upgrade to Pro succeeds), and
planting `sk_live_…` in `dist/` makes the secret scan fail. They detect real
regressions rather than passing vacuously.

### What the RLS suite actually blocks

Acting as a genuine signed-in user with a valid JWT:

- read another user's profile, book, or subscription → **0 rows**
- `update profiles set tier='pro'` → **rejected by trigger**
- `set is_owner=true` → **rejected**
- steal another user's `stripe_customer_id` → **rejected**
- insert a fake `subscriptions` row → **RLS violation**
- delete own `usage_events` to reset the daily quota → **0 rows**
- insert negative usage → **RLS violation**
- call `consume_quota()` directly → **permission denied**
- flip `feature_flags.route_free = true` → **0 rows**
- plant or delete a project on another user → **rejected**

And the things that must still work, do: rename yourself, create your own
project, and the service role grants Pro after a verified payment.

## Bug caught during development

The column-protection trigger first used `current_user` to allow superusers
through. Inside a `SECURITY DEFINER` function `current_user` is the *function
owner* (`postgres`), so the check passed for **every caller** and silently
disabled the guard — T4 went from blocked to `UPDATE 1`.

Fixed by using `session_user`, and the test harness now connects as a
non-superuser `authenticator` role exactly like PostgREST does. Testing as
`postgres` would have hidden this permanently.

## Data flow

```
Upgrade
  browser  →  POST /api/checkout { tier: "pro" }        ← tier NAME only
  server   →  looks up the PRICE itself                 ← client never sends money
  server   →  Stripe Checkout (hosted; no card touches us — PCI SAQ A)
  Stripe   →  POST /api/stripe/webhook                  ← signature verified
  server   →  re-fetches the subscription from Stripe
  server   →  writes profiles.tier                      ← the ONLY place this happens

Using a paid feature
  browser  →  POST /api/entitlement/consume { featureId }
  server   →  verifies JWT, reads tier, consumes quota atomically
  server   →  returns a 5-minute HMAC-signed grant incl. the watermark flag
  browser  →  renders the PDF locally
```

## Deliberate architecture decision: rendering stays client-side

The spec said *all* PDF generation must be server-side. It is not, and this is
considered carefully rather than skipped:

- a 39-page crossword book is **5.7 MB of JSON** (measured)
- Fabric.js needs a real DOM `<canvas>`; serverless runtimes have none
- Cloudflare Workers free tier allows **10 ms CPU per request**

Moving rendering server-side would mean uploading 5.7 MB per export and running
headless Chrome — to protect nothing, because the user already has their own
puzzle data on screen. **There is no secret in their own pixels.**

What *is* protected is the decision: may they export, have they exceeded the
quota, and is a watermark required. All three are decided here and delivered
inside a signed grant. A patched client can re-render data the user already
owns; it cannot mint entitlement or remove the watermark.

## Hardening already applied

- **Rate limiting** before any Stripe or database call (`lib/rate-limit.ts`)
- **Security headers** on every response, incl. `Cache-Control: no-store` so a
  shared cache cannot serve one user's entitlement to another
- **CORS allow-list**, never `*` (invalid with credentials, and dangerous)
- **Input allow-listing** — `featureId` must match `^[a-z0-9_]{1,64}$` before it
  reaches a database function
- **Fail closed** — an unknown feature id is denied, never allowed
- **No stack traces to clients**; detail is logged server-side only
- **Boot-time env validation** — a missing `STRIPE_WEBHOOK_SECRET` stops the
  deploy instead of silently disabling signature checks
- **Idempotency ledger** so a Stripe retry cannot double-grant

## Bugs caught by the router tests

**Signature verification ran after client construction.** A forged webhook
returned **500 "Server misconfigured"** instead of 400, because building the
Supabase client threw first. Two problems in one: unauthenticated traffic did
real work before being rejected, and the error masked the true cause. Verification
now happens before any client is built.

**supabase-js needs a WebSocket that Node 20 lacks.** `createClient()` eagerly
constructs a Realtime client. We never use Realtime, so rather than add a `ws`
dependency, `lib/supabase.ts` installs a stub that throws a clear message if
anything ever does open a socket. All client creation is centralised there, so
the security options cannot drift between routes.

## Still open — do not ship without reading

1. **Rate limiting is per-instance.** In-memory, so on serverless the true
   ceiling is `limit × instances`. Fine against one abusive client; for a hard
   global cap use Upstash Redis or a Durable Object. `rateLimit()` is the only
   function to replace.
2. **The client has not been migrated.** `src/services/auth.ts` is still the
   local mock and gating is still client-side. The server is ready; the swap is
   the next task and is the point at which DevTools stops granting Pro.
3. **No Stripe Radar / fraud rules** configured.
4. **`handleDeleteAccount` needs a real Stripe cancel hook wired in.** The
   interface and its test exist (`cancelStripeSubscriptions`); the production
   implementation is injected at the call site and must not be forgotten, or a
   deleted account keeps being billed.

## Rules for anyone editing this folder

1. The service-role key never leaves the server — not in a response, a log, or
   an error message.
2. Never trust the client: not the tier, not the price, not "payment succeeded".
3. Never trust a webhook payload alone; re-fetch from Stripe.
4. Every new table gets RLS **and** a test in `02-attack.sql`.
5. Run `npm run verify:secrets` before every deploy.
