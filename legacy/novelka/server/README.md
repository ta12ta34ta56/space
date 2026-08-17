# Novelka server

This folder is the part of Novelka the user **cannot edit**. That is its whole
reason to exist.

Everything in `src/` runs inside the customer's browser, so anything it decides
can be changed with developer tools. That is fine for layout and fonts. It is
not fine for "has this person paid".

## The two jobs

**1. Hold the FIB secret.**
FIB gives you a `client_id` and a `client_secret`. The secret must never be sent
to a browser — anyone could read it and create payments as you. It lives here,
in `.env`, and never leaves.

**2. Be the only thing that grants a paid tier.**
The browser never says "I paid". FIB calls this server directly to confirm, this
server checks with FIB, and only then is the account upgraded.

## The payment flow, step by step

```
1. Customer clicks "Upgrade to Pro"
       browser  ->  POST /api/payments/create   { tier: 'pro' }

2. Server asks FIB for a payment, using the secret
       server   ->  FIB   create payment, 13,000 IQD

3. FIB returns a QR code
       server   ->  browser   { id, qrCode, readableCode }

4. Customer scans the QR with the FIB app and approves

5. FIB tells the server, directly, machine to machine
       FIB      ->  POST /api/payments/callback   { id, status }

6. Server asks FIB "is that really paid?"  <-- never trust the callback alone
       server   ->  FIB   check status

7. Only now does the account become Pro
       server   ->  database   tier = pro
```

Step 6 is the one people skip. A callback URL is public; anyone can POST to it
pretending to be FIB. **Always re-check with FIB before granting anything.**

## Status

⚠️ **Not built yet.** This is the design, agreed before writing code.

Building it requires:
- FIB sandbox credentials (free, no bank account needed to test)
- A host to run it on (Railway, Render and Fly all have free tiers)
- A database for users, subscriptions and payments

## Planned shape

```
server/
  src/
    index.ts            HTTP entry
    routes/
      payments.ts       create / status / cancel / callback
      auth.ts           sign up, sign in, sessions
    providers/
      fib.ts            FIB SDK wrapper  (@first-iraqi-bank/sdk)
    db/
      schema.sql
  .env                  NEVER committed
  .env.example          committed, with blank values
```

## Environment variables

Copy `.env.example` to `.env` and fill it in. **`.env` is gitignored and must
stay that way.**

```
FIB_CLIENT_ID=
FIB_CLIENT_SECRET=
FIB_ENV=sandbox              # sandbox | production
FIB_CALLBACK_URL=https://your-domain/api/payments/callback
SESSION_SECRET=              # long random string
DATABASE_URL=
```

## Rules for this folder

1. **The secret never leaves.** Not in a response, not in a log, not in an error
   message shown to a user.
2. **Never trust the client.** Not the tier it claims, not the price it sends,
   not a "payment succeeded" message. Prices are looked up on the server from
   the tier name.
3. **Never trust a callback on its own.** Always re-check with FIB.
4. **Payments are idempotent.** FIB may call the callback more than once for the
   same payment. Granting a tier twice must be harmless.
5. **Log payments, not people.** Record payment ids and amounts. Never log
   passwords, tokens, or the secret.
