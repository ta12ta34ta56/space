# Novelka — what you need to do

The backend is built and tested. It cannot run until three accounts exist, and
only you can create those. Everything here is free to start.

**Do them in this order.** Each step gives you values the next step needs.

---

## Step 1 — Supabase (10 minutes)

This is the database and the login system.

1. Go to **supabase.com** → *Start your project* → sign in with GitHub or email.
2. **New project.**
   - Name: `novelka`
   - Database password: click *Generate*, then **save it in your password
     manager**. You will rarely need it, but it cannot be recovered.
   - Region: **Frankfurt (eu-central-1)** — closest to your users and keeps the
     data in the EU, which matters for GDPR.
3. Wait ~2 minutes while it provisions.
4. Left sidebar → **SQL Editor** → *New query*. Open
   `server/db/schema.sql` from this project, paste the whole file, press **Run**.
   You should see *Success. No rows returned.* That has created every table with
   Row Level Security switched on.
5. Left sidebar → **Project Settings** → **API**. Copy these three:

   | Label on the page | What I call it |
   |---|---|
   | Project URL | `SUPABASE_URL` |
   | `anon` `public` | `SUPABASE_ANON_KEY` |
   | `service_role` `secret` | `SUPABASE_SERVICE_ROLE_KEY` |

> ⚠️ **The `service_role` key bypasses all security.** It goes only into the
> hosting provider's environment variables. Never in the app, never in a
> screenshot, never pasted into a chat — including to me. If it ever leaks,
> click *Reset* on that page immediately.

**Send me:** the Project URL and the `anon` key. Those two are safe to share —
they are designed to be public and are protected by the RLS policies I tested.

---

## Step 2 — Stripe (20 minutes, your uncle must do this part)

Stripe needs a real person with a real address and bank account in a supported
country. **This must be your uncle, in his own name, as the actual business
owner.** Not you using his details — that is the one thing that genuinely
causes accounts to be frozen.

He does this:

1. **stripe.com** → *Start now* → creates the account with his own email.
2. Country: **France** (or Germany — whichever he actually lives in).
3. Business type: **Individual / Sole trader** is fine to begin with.
4. Fills in his name, address, date of birth, and bank IBAN.
5. Uploads ID when asked (passport or national ID).

Then, still in Stripe:

6. **Products** → *Add product*, three times:

   | Name | Price | Billing |
   |---|---|---|
   | Novelka Basic | €4.99 | Monthly, recurring |
   | Novelka Pro | €9.99 | Monthly, recurring |
   | Novelka Enterprise | €24.99 | Monthly, recurring |

7. Open each product and copy its **Price ID** (starts `price_…`, *not* the
   product id which starts `prod_…`).
8. **Developers** → **API keys** → copy the **Secret key** (`sk_test_…` while
   testing).

**Send me:** the three `price_…` IDs. Those are not secret.
**Do NOT send:** the `sk_…` secret key. It goes into hosting env vars only.

> Leave Stripe in **Test mode** until we have tested end to end. Test mode uses
> card number `4242 4242 4242 4242`, any future expiry, any CVC. No real money.

---

## Step 3 — Hosting: Cloudflare (10 minutes)

I recommend **Cloudflare Pages + Workers**, not Vercel.

Vercel's free Hobby tier **prohibits commercial use** — the day you switch on
payments you are in violation and can be suspended. Cloudflare's free tier
allows commercial use.

1. **dash.cloudflare.com** → sign up.
2. **Workers & Pages** → *Create* → connect your GitHub repository.
3. Build settings:
   - Build command: `npm run build`
   - Output directory: `dist`
4. **Settings → Environment variables**, add all of these as **Secret** (the
   encrypted type, not plaintext):

```
SUPABASE_URL                 (from step 1)
SUPABASE_ANON_KEY            (from step 1)
SUPABASE_SERVICE_ROLE_KEY    (from step 1 — SECRET)
STRIPE_SECRET_KEY            (from step 2 — SECRET)
STRIPE_WEBHOOK_SECRET        (from step 4 below — SECRET)
STRIPE_PRICE_BASIC           (from step 2)
STRIPE_PRICE_PRO             (from step 2)
STRIPE_PRICE_ENTERPRISE      (from step 2)
APP_URL                      (your live URL)
```

---

## Step 4 — Connect Stripe to the app (5 minutes)

Only possible once step 3 gives you a URL.

1. Stripe → **Developers** → **Webhooks** → *Add endpoint*.
2. Endpoint URL: `https://YOUR-DOMAIN/api/stripe/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
4. Click **Reveal** under *Signing secret*, copy the `whsec_…` value into
   `STRIPE_WEBHOOK_SECRET` in Cloudflare.

> This secret is what proves a "payment succeeded" message really came from
> Stripe. Without it, anyone who finds the URL could grant themselves Pro. The
> code refuses to start if it is missing — that is deliberate.

---

## Quick summary of what to send me

✅ **Safe to paste here**
- Supabase Project URL
- Supabase `anon` key
- The three Stripe `price_…` IDs
- Your live URL once it exists

❌ **Never paste these anywhere — they go straight into Cloudflare**
- Supabase `service_role` key
- Stripe secret key (`sk_…`)
- Stripe webhook secret (`whsec_…`)
- Your database password

---

## What is already done

| Piece | Status | Proof |
|---|---|---|
| Database schema + RLS | Done | 25 attack tests on real PostgreSQL 17 |
| Stripe webhook | Done | 18 tests, real signature verification |
| Entitlement API | Done | 30 tests |
| Request router | Done | 24 tests |
| GDPR export + delete | Done | 29 tests |
| Cloudflare / Vercel adapters | Done | `server/adapters/` |
| Secret leak guard | Done | `npm run verify:secrets` |
| Puzzle generators, editor, PDF | Done | 278 client tests |

**Total: 405 automated checks, all passing.**

## What is left after you send the keys

1. Point the app at Supabase instead of the local mock login
2. Move gating from the browser to the server API
3. Add the upgrade / billing UI
4. End-to-end test with a real test card

That is roughly one focused session once the accounts exist.

## Running it yourself

```bash
npm install
npm run dev              # editor at localhost:5173
npm run build            # production build
npm run verify:secrets   # MUST be clean before deploying

npm run test:sudoku      # and wordsearch, crossword, flags, auth, admin, svg
npm run test:server      # webhook, entitlement, handler, gdpr
```

---

# ⚠️ Incident note — 28 July 2026

A `sb_secret_...` key was pasted into chat. **It must be rotated.**

Supabase → Project Settings → API Keys → Revoke/Rotate the secret key.
The new one goes only into Cloudflare environment variables.

Why it matters: the secret (service-role) key bypasses every Row Level Security
policy. It is the one credential that can read and edit every user's data. Chat
transcripts are not a safe store for it.

No damage was done — the project contained no user data at the time. Rotating
makes the exposed key useless.

**Rule going forward:** if a value is labelled `secret` or `service_role`, it
goes from the Supabase dashboard straight into the hosting provider's encrypted
env vars, and nowhere else. Not into chat, not into a file, not into a
screenshot.

---

# Live database verification — 28 July 2026

Project: `mfadnnmkxkzsplerizvk.supabase.co` (schema applied successfully)

Tested against the real deployment with only the publishable key, i.e. exactly
what an attacker who reads your JavaScript would have:

| Attack | Result |
|---|---|
| Read `profiles` / `projects` / `subscriptions` | `[]` — RLS hides everything |
| Insert a fake profile with `tier: enterprise` | **401** |
| Insert a fake active subscription | **401** |
| Insert negative usage (quota evasion) | **401** |
| Call `consume_quota()` directly | **401** |
| Insert into `feature_flags` | **401** — RLS policy violation |
| Update `feature_flags` to make paid features free | changed **0 rows** |
| Read `webhook_events` | `[]` |

A query against a nonexistent table returns `PGRST205`, which confirms the empty
results above mean "blocked", not "table missing".

**The database is correctly locked down.**
