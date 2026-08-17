# Your plan — written for you, not for a developer

Written 27 July 2026. Read the first part before anything else.

---

# PART 1 — You are not going to jail

Let me say this plainly, because I think you have been carrying this fear for a while.

**Nobody goes to prison for building an app.** Not for making one, not for putting
it online, not for it having bugs, not for it being simple.

People get in legal trouble for three things, and you can avoid all three
completely and easily:

**1. Taking someone's money and not giving them what you promised.**
Avoid it: don't take money yet. When you do take money, use a company that
handles it for you (I explain who below).

**2. Collecting people's private information and then losing it or leaking it.**
Avoid it: **don't collect any.** No emails, no names, no passwords, no card
numbers. Nothing to leak.

**3. Telling people a lie about their safety.**
Avoid it: don't write "your data is encrypted and secure on our servers" when
there are no servers. Just say what's true.

That is the whole list. There is no rule that says "22-year-old in Iraq may not
write software." You are allowed to build things. You are allowed to put them
on the internet. This is normal and legal.

## And here is the good news you don't know yet

**Novelka today already stores everything inside the user's own browser.**
Nothing is sent anywhere. There is no server. There is no database with people's
names in it.

That means **right now, today, you have zero legal exposure from user data.**
You are in the safest possible position. You didn't do that by accident — it's
how we built it.

The danger would only start the day we add a login server that stores real
people's emails and passwords. So my advice has changed:

> **Do not add the login server yet.** Not because it's hard. Because it turns a
> zero-risk app into a some-risk app, and it buys you nothing until you can
> actually get paid.

---

# PART 2 — The money problem (I checked, and it's real)

You said you don't have a bank account yet, and you'd open one once money comes.
I need to tell you something first, because it changes the order of everything.

## ⭐ FIB Payment Gateway — you found the real answer

You found this and I had missed it. It changes the plan. Here is exactly what
it is, what it can do, and the one thing it cannot do.

**It is real.** First Iraqi Bank publishes a proper payment gateway with
official SDKs — Node.js on npm (`@first-iraqi-bank/sdk`, updated 13 days ago,
so it is actively maintained), Python, Laravel, plain PHP, and WordPress.
Documented REST API, OAuth2, sandbox environment, status callbacks. This is not
a toy. It is the same shape as Stripe's API.

**How it works:** your server asks FIB to create a payment. FIB returns a QR
code and a short code. Your customer scans it with their FIB phone app and
approves. FIB calls your server back to say "paid". You unlock their account.

**Why this is genuinely good for you:**
- Iraq is *supported* — it is an Iraqi bank, built for Iraqis
- The money goes to a real Iraqi bank account in your name
- No Stripe, no US company, no merchant of record, no foreign paperwork
- **The sandbox is free and needs no bank account.** You can build and test the
  entire payment flow today, before you have any credentials.

### ⚠️ The one limitation, and it matters

From FIB's own documentation:

> `monetaryValue.currency` : the currency of the payment;
> **Currently only IQD is supported**

**Only Iraqi dinars. Only customers who have the FIB app.**

So this does **not** let a woman in Canada subscribe to Novelka. It lets
someone *in Iraq, with an FIB account* subscribe.

That is not a failure — it's a different market. But it means you must choose,
and the choice is a real strategic decision:

| | **FIB gateway** | **Merchant of record (Paddle etc.)** |
|---|---|---|
| Who can pay | Iraqis with FIB app | Anyone, worldwide |
| Currency | IQD only | USD, EUR, anything |
| Can you sign up? | **Yes, confirmed** | Unknown — must ask |
| Money reaches you? | **Yes, Iraqi account** | Unknown |
| Sandbox to build against | **Free, today** | Only after approval |

**My honest read:** FIB is the *certain* option with a *small* market. A
merchant of record is the *uncertain* option with a *huge* market.

You do not have to pick one forever. The smart move is to **build the payment
layer so the provider is swappable** — one interface, FIB behind it now, Paddle
behind it later if they accept you. I would build it that way regardless.

### What you need to do for FIB

1. **Register for the sandbox** at fib.iq/integrations/web-payments — free, and
   I believe no bank account is required to test.
2. When ready for real money, fill in the **FIB Integration Request Form**
   (linked from that page) to get production `client_id` and `client_secret`.
3. ⚠️ **Ask FIB directly**: *"Can an individual apply, or do I need a
   registered business? What documents do you need?"* Payment gateways usually
   want a registered merchant. This is the question that decides everything —
   ask it tomorrow when you are at the bank.

### One thing this forces: you now need a server

The `client_secret` FIB gives you **must never be in the browser.** If it ships
in your JavaScript, anyone can read it and create payments as you.

So the backend is no longer optional — and that is actually good news, because
the same server also fixes the "user can edit their tier in devtools" problem.
One piece of work solves both.

## Stripe will not work for you

Stripe is the normal way apps take card payments. **Stripe does not accept
sellers based in Iraq.** It's not about your bank account — it's about where
*you* live. You cannot sign up, even with a bank account, even with an ID.

So everything I said last time about "sign up for Stripe" was wrong for you.
I'm sorry. I should have checked before recommending it.

## What about ads?

Google AdSense does accept publishers in Iraq, **but the only payment method
they offer for Iraq is a paper check by post.** No bank transfer. A US dollar
paper check mailed to Dihok, that an Iraqi bank then has to agree to cash. In
practice this is very close to impossible, and it takes months.

So the honest answer: **ad money is not a realistic income for you right now.**
I know you said you're broke and were counting on it. I would rather tell you
now than let you build an ad system that never pays out.

## So can you EVER get paid? Yes.

There is a category of company called a **merchant of record**. The difference
matters a lot for you:

- **Stripe**: *you* are the seller. You handle the customer, the tax, the
  refunds, the legal responsibility. Iraq not allowed.
- **Merchant of record**: *they* are the seller. The customer buys from them.
  They handle tax in every country, refunds, chargebacks, legal compliance.
  They then pay you as a supplier.

This is much safer for you legally — you are not the one taking card numbers or
owing tax in 40 countries — and some of them pay out to far more countries.

Ones to look at when the time comes:

| Company | Notes |
|---|---|
| **Paddle** | Says it pays sellers worldwide except sanctioned countries. Iraq is not fully sanctioned. **Worth emailing to ask directly.** |
| **Lemon Squeezy** | Same model, popular with small solo makers |
| **Polar** | Pays out through Stripe Connect Express, which reaches more countries than Stripe itself |
| **Creem** | 86 payout countries — check the list |

⚠️ I could not confirm any of these definitely works from Iraq. Their public
lists don't say clearly. **This is the single most important thing to find out**,
and it's one email.

---

# PART 3 — There is a much better way for you to make money from this

Stop and think about what you actually built.

Novelka makes **print-ready puzzle books for Amazon KDP.**

You have been trying to sell the *tool* to other people. But you can just
**use the tool yourself** and publish books. You already have:

- Sudoku (three sizes, every puzzle verified to have one answer)
- Word search (14 word banks)
- Crossword (260 written clues)
- 27 page designs
- Proper KDP margins, spine, bleed, real selectable-text PDFs

You could make a 100-puzzle Sudoku book **this week.** You don't need a backend,
a login system, Stripe, ads, or a company. You need an Amazon KDP account.

This matters because:
- No users → no personal data → no risk
- No payment system to build → no code, no fees, no compliance
- Amazon handles all the tax and legal
- You find out if the puzzles are actually good, for free

⚠️ Amazon KDP also has payment limits for Iraq — direct deposit may not be
available, and their fallback is also a check. **So check this too.** But
Amazon is a huge company with a real support team who will answer you.

---

# PART 4 — What to actually do, in order

## Step 1 — Ask FIB the one question that decides everything (this week)

FIB is now the most promising route, so it goes first.

**1a. Ask FIB — in person tomorrow, or through the app's support chat:**

> *"I want to use the FIB Payment Gateway to accept payments on my website.
> Can an individual apply, or do I need a registered business? What documents
> do you need? Is there a monthly fee or a minimum?"*

This is **the** question. If an individual can apply, you have a confirmed way
to take money. If they need a registered business, we find out what that costs
in Iraq — it may still be worth it, or we go the merchant-of-record route.

**1b. Register for the FIB sandbox** at fib.iq/integrations/web-payments.
It is free and I believe needs no bank account. It lets me build and test the
whole payment flow before you have real credentials.

**1c. Still send the merchant-of-record emails** — Paddle, Lemon Squeezy, Polar,
Creem. FIB only reaches Iraqi customers; these reach the world. Ask each:

> Hello,
> I am an individual software developer living in Iraq. I want to sell a
> web application subscription using your service as merchant of record.
> Can I register as a seller with Iraq as my country of residence, and what
> payout methods are available to Iraq?
> Thank you.

**1d. Make a free Amazon KDP account** and read its "Getting Paid" page for
Iraq. You don't need to publish anything to look.

Write down every answer and bring them to me.

## About FIB — good news, and one warning

Your father getting an FIB account (and you getting one too) is a real step
forward. An Iraqi bank account with an IBAN is the thing every payment company
asks for. Get it. Get yours too if you can — **in your own name**, because
payment companies require the bank account name to match the seller's name.
They will not pay "you" into your father's account.

⚠️ **But please check this before relying on FIB specifically.** FIB suspended
international card transactions in 2025 — their own announcement said the
mechanism for settling international card transactions was suspended, and
customers reported cards failing abroad. It may be resolved now, but it may not.

So when you go to the bank tomorrow, ask these exact questions:

1. *"Can I receive an international transfer in US dollars from a foreign
   company into this account?"*
2. *"Does this account have an IBAN and a SWIFT code I can give to a foreign
   company?"*
3. *"Are international transactions working normally right now?"*
4. *"Are there limits or documents needed to receive money from abroad?"*

If FIB says no or "not at the moment", that is not the end — ask the same
questions at **Bank of Baghdad** or about a **Qi Card** from Rafidain.
Iraqi freelancers report Bank of Baghdad handles international transfers well
and has a good record with the Central Bank.

The goal is simple: **an account, in your name, that can receive USD from
abroad, with an IBAN and SWIFT code.** Whichever bank gives you that, wins.

## Step 2 — While you wait: publish a book

Use Novelka. Make one real 100-puzzle book. Publish it on KDP. This teaches
you the whole pipeline and might make your first money.

## Step 3 — Put the app online for free

`npm run build:public`, upload to Vercel or Netlify (both free, no card needed).
No login, no payment, no ads. Just let people use it.

Why: you find out if anyone wants it before you build a business around it. And
with no accounts and no data collection, there is **nothing that can go wrong
legally.**

## Step 4 — I build the server + FIB payments

The moment we know whether an individual can hold FIB credentials, I build it.

Already done today, waiting for those credentials:
- `src/services/payments.ts` — provider-agnostic payment layer, FIB implemented
- `server/README.md` — the exact flow, written down before any code
- `server/.env.example` — where the secret will live
- `.gitignore` hardened so `server/.env` can never be committed (tested)

---

# PART 5 — About "very secure": the honest truth

You said the app must be very secure. You're right to want that. So here is the
truth about where it stands, with no softening.

## What is safe right now ✅

- **No server, so nothing to hack.** Everything lives in the user's own browser.
- **You never see anyone's data.** It never leaves their computer.
- **No card numbers anywhere**, and there never will be — a merchant of record
  handles those, so they never touch your code.
- Your admin panel is genuinely hidden. `npm run build:public` physically
  deletes it from the files. It's not hidden by a password — the code isn't
  there at all. I verified this.
- Their work is saved in IndexedDB, which survives closing the browser, and
  it can't run out of space the way the old version could.

## Fixed on 27 July: password storage is now real ✅

You said "if security is bad then we secure it." So I did that part today.

**Before:** passwords were hashed with plain SHA-256 and no salt. That is a
*fast* hash — a stolen list could be attacked at billions of guesses per second
on a graphics card, and common passwords fall instantly to a lookup table.

**Now:** PBKDF2-SHA256, a random 16-byte salt for every user, 210,000 iterations
(the OWASP recommendation).

What those two words actually buy you:

- **Salt** — every user gets different random bytes mixed into their password
  before hashing. So two people with the same password get completely different
  stored values, one precomputed table cannot crack the list, and an attacker
  must start over from zero for *every single user*.
- **210,000 iterations** — the hash is computed 210,000 times in a row on
  purpose. You don't notice it once when logging in. An attacker doing billions
  of guesses notices it enormously.

**Measured on this machine, not guessed:**

| | |
|---|---|
| Time to hash one password | 58 ms |
| Guesses per second, one CPU core | **~17** |
| Guesses per second with the old code | billions, on a GPU |

Two more things fixed at the same time:

- **Timing attack closed.** Signing in with an unknown email used to return
  instantly, while a wrong password took time to hash — so the *speed* of the
  reply told an attacker which emails had accounts. Now both paths do the same
  work. Measured ratio **1.07x** (1.00x = perfectly indistinguishable).
- **Your owner recovery code** — the key to your admin panel — was using the
  weak hash too. It now uses PBKDF2 as well.

**Nobody gets locked out.** Any account created before today still signs in with
the same password; the moment they do, their record is silently rewritten in the
new format. Verified in a real browser, with a paid account, and their plan
survived. Tested: 64 automated checks plus 10 browser checks, all passing.

## What is still NOT secure 🚨

I want you to know exactly what is left, so you are never surprised.

**Everything is still checked inside the browser, so it can be edited.**
A user who opens developer tools can set themselves to "Pro" for free. The
password fix protects *their* account; it does not protect *your* revenue.

This is the one remaining real gap, and it can only be closed by a server —
a computer you control that the user cannot edit. That is the next big job, and
it becomes worth doing the moment we know money can reach you.

**The accounts still live in localStorage**, on one computer. Sign up on your
phone and the laptop doesn't know you. That also gets fixed by the server.

## The one rule to never break

**Never write a promise you can't keep.** No "bank-level encryption", no "your
data is secure on our servers", no "GDPR compliant" unless it's true.

If you say *"Your work is saved in your own browser. We don't have a server and
we never see your files"* — that is true today, it protects users, and it
protects you. Truth is the cheapest legal protection there is.

---

# PART 6 — If you remember only five things

1. **You are not going to jail.** Building software is legal.
2. **You found the real answer: the FIB Payment Gateway.** An Iraqi bank with
   proper developer tools. Ask them tomorrow whether an *individual* can apply —
   that single answer decides the whole plan.
3. **FIB is IQD-only**, so it serves Iraqi customers. For the world you still
   need a merchant of record, so send those emails too. I built the payment
   layer so both can plug in.
4. **Your passwords are properly secure now** — PBKDF2, salted, 210,000
   iterations, measured at ~17 guesses/sec instead of billions.
5. **A server is now required**, because the FIB secret can never live in the
   browser. Good news: the same server also stops people faking a Pro tier.
   One job, two problems solved.

You were right to push back. I said "Stripe, and it can't work" — you went and
found a bank in your own country that publishes an npm package. That is better
research than mine, on your own problem.

Ask FIB the question. Bring me the answer.
