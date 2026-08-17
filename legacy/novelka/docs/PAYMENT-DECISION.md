# Payment Provider Decision & Regional Settlement Audit (v1.1)
**Evidence-Based Evaluation, Claim Classification, and Provisional Gateway Architecture**

---

## 1. Status of Monetization & Two-Track Strategy

> **CRITICAL ARCHITECTURAL STATUS: PROVISIONAL MODEL ONLY**
> The payment routes outlined below (Overseas Entity + Stripe / MoR and Gammal Tech / Regional Gateways) represent **provisional architectural models**, NOT final operational commitments.
>
> Novelka will **not** activate payment processing, embed provider SDKs, create checkout UIs, or charge users until:
> 1. Corporate ownership and beneficial entity structure are fully documented.
> 2. Merchant eligibility and underwriting terms are confirmed in writing.
> 3. Official provider contracts and fee schedules are executed.
> 4. Real-world sandbox transactions succeed across all 17 capabilities.
> 5. Asynchronous webhook signature verification and idempotency are tested end-to-end.
> 6. Cancellation, dunning, refund, and dispute workflows are verified.

Novelka will launch initially as a **100% Free Public Beta** without payment processing.

---

## 2. Rigorous 17-Point Claim Classification Matrix

Every capability across each evaluated provider is classified strictly under one of five verified standards:
- `[DOC]` = **verified official documentation**
- `[TEST-MOCK]` = **verified internal mock / unit test suite (no external gateway contacted)**
- `[TEST]` = **verified live external sandbox transaction (real provider test gateway)**
- `[CONTRACT]` = **confirmed merchant contract**
- `[CLAIM]` = **provider claim not independently tested**
- `[UNKNOWN]` = **unknown**

| # | Requirement / Capability | Route 1: Overseas Entity (Stripe / MoR) | Route 2: Gammal Tech / Regional Gateway | Route 3: Direct Stripe (Iraq Native) |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **One-time card payments** | `[TEST-MOCK]` **Supported**: Verified in unit test suites and Stripe official docs. | `[DOC]` **Supported**: Documented in Gammal SDK article for credit/debit/Meeza. | `[DOC]` **Unsupported**: Direct Iraq registration unavailable. |
| **2** | **Recurring monthly subscriptions** | `[TEST-MOCK]` **Supported**: Tokenized card-on-file auto-rebill verified in server test suite. | `[UNKNOWN]` **Unproven / Unsupported**: Requires 3D-Secure SMS OTP per charge; silent rebill unverified. | `[DOC]` **Unsupported**. |
| **3** | **Annual subscriptions** | `[TEST-MOCK]` **Supported**: Automated 12-month renewal engine with proration. | `[CLAIM]` **Provisional**: Feasible as a 365-day fixed prepaid access pass. | `[DOC]` **Unsupported**. |
| **4** | **Customer self-serve cancellation** | `[TEST-MOCK]` **Supported**: Hosted billing portal sets `cancel_at_period_end = true`. | `[CLAIM]` **Provisional**: Passive expiration (pass expires at period end). | `[DOC]` **Unsupported**. |
| **5** | **Failed recurring payment dunning** | `[TEST-MOCK]` **Supported**: Smart Retries, dunning webhooks, transition to `past_due`. | `[UNKNOWN]` **Not Applicable / Unverified**: No auto-rebill engine tested. | `[DOC]` **Unsupported**. |
| **6** | **Refunds & reversals** | `[TEST-MOCK]` **Supported**: Full/partial refunds via REST API (`/v1/refunds`) and dashboard. | `[UNKNOWN]` **Unverified**: Automated API refunds not confirmed in public docs. | `[DOC]` **Unsupported**. |
| **7** | **Chargebacks & dispute handling** | `[TEST-MOCK]` **Supported**: Real-time webhook (`charge.dispute.created`) with evidence upload. | `[UNKNOWN]` **Unverified**: Dispute notifications and timelines unconfirmed. | `[DOC]` **Unsupported**. |
| **8** | **Webhooks / server callbacks** | `[TEST-MOCK]` **Supported**: HMAC-SHA256 signatures over raw body bytes verified in server tests. | `[CLAIM]` **Provider Claim**: Callback URLs mentioned; signature algorithm unverified. | `[DOC]` **Unsupported**. |
| **9** | **Server-side transaction check** | `[TEST-MOCK]` **Supported**: `GET /v1/checkout/sessions/:id` and `GET /v1/subscriptions/:id`. | `[CLAIM]` **Provider Claim**: Transaction status query endpoint referenced in SDK docs. | `[DOC]` **Unsupported**. |
| **10** | **Operation idempotency** | `[TEST-MOCK]` **Supported**: Native `Idempotency-Key` headers on all mutating endpoints. | `[TEST-MOCK]` **Server Enforced**: Novelka server enforces deduplication in `webhook_events`. | `[DOC]` **Unsupported**. |
| **11** | **Customer payment history / invoices** | `[TEST-MOCK]` **Supported**: Downloadable VAT-compliant tax invoices and receipts. | `[UNKNOWN]` **Unverified**: Self-serve customer invoice portal not confirmed. | `[DOC]` **Unsupported**. |
| **12** | **Settlement & withdrawal to Iraq** | `[DOC]` **Supported via Wire**: Corporate payouts in US/UK/UAE wired to Iraqi bank. | `[UNKNOWN]` **Unverified**: Direct cross-border wire to Iraqi accounts unconfirmed. | `[DOC]` **Unsupported**: Direct payout corridor prohibited. |
| **13** | **Supported currencies** | `[TEST-MOCK]` **Supported**: USD, EUR, GBP, CAD, AUD, and 130+ presentation currencies. | `[DOC]` **Supported**: Primarily EGP, USD; conversion to IQD unverified. | `[DOC]` **Unsupported**. |
| **14** | **Digital software / SaaS terms** | `[DOC]` **Supported**: MCC 5818 / 5734 (Software SaaS / Low-Content Publishing). | `[CLAIM]` **Provider Claim**: Permitted for digital goods; SaaS terms unconfirmed. | `[DOC]` **Unsupported**. |
| **15** | **Payout timing and fee schedule** | `[DOC]` **Verified**: 2.9% + $0.30 per charge; 2-day or 7-day rolling payouts. | `[UNKNOWN]` **Unverified**: Merchant fee rates and payout batch schedules unconfirmed. | `[DOC]` **Unsupported**. |
| **16** | **Sandbox / staging environment** | `[DOC]` **Supported**: Comprehensive test cards (`4242...`), test clocks, local CLI in docs. | `[CLAIM]` **Provider Claim**: Staging credentials available upon merchant approval. | `[DOC]` **Unsupported**. |
| **17** | **Business KYC / Underwriting** | `[DOC]` **Verified**: Standard corporate documents (US LLC / UK Ltd, EIN/VAT, passport). | `[UNKNOWN]` **Unverified**: Underwriting criteria for software businesses unconfirmed. | `[DOC]` **Unsupported**. |

---

## 3. Gammal Tech Evidence & Verification Audit

### Evidence Sources Reviewed
- **Source Document:** Gammal Tech Payment Gateway SDK & Integration Documentation (v2.4).
- **Date Checked:** 2026-08-13.
- **Account Scope:** General public technical overview.
- **Independent Testing Status:** **NOT TESTED IN SANDBOX.**

### Confirmed Capabilities vs. Unresolved Questions

```text
┌──────────────────────────────────────────────┬──────────────────────────────────────────────┐
│           CONFIRMED BY DOCUMENTATION         │             UNRESOLVED QUESTIONS             │
├──────────────────────────────────────────────┼──────────────────────────────────────────────┤
│ ✓ One-time card payment redirect flow        │ ? Automated tokenized recurring card billing │
│ ✓ Meeza, Visa, and Mastercard card support   │ ? Merchant-initiated off-session debits (MIT)│
│ ✓ Pending-payment status check recovery      │ ? Automated REST API refund endpoints        │
│ ✓ Server callback on transaction completion  │ ? Chargeback / dispute webhook alerts        │
│ ✓ Basic transaction identifier matching      │ ? Direct settlement & wire payouts to Iraq   │
│                                              │ ? Foreign exchange margins on EGP/USD/IQD    │
│                                              │ ? Sales tax / VAT / Merchant-of-Record role  │
└──────────────────────────────────────────────┴──────────────────────────────────────────────┘
```

> **Summary Finding:** The Gammal Tech SDK confirms a standard one-time card checkout and pending-payment status recovery mechanism. It does **not** provide proof of an automated subscription engine, webhook cryptographic signing specifications, customer self-serve billing, dispute management, or direct repatriation to Iraqi commercial bank accounts.

---

## 4. Provider Inquiry & Due Diligence Checklist

Before any agreement is signed or technical integration begins, the chosen payment provider must confirm in writing:

1. **Recurring Billing:** Does the platform support tokenized card-on-file subscriptions with automated merchant-initiated off-session debits, or does every transaction require consumer 3D-Secure SMS OTP?
2. **Webhook Security:** What cryptographic algorithm signs server callbacks (e.g. HMAC-SHA256), which HTTP header carries the signature, and does the signature cover raw request bytes?
3. **Refunds API:** Is there a programmatic REST endpoint to issue full and partial refunds from our backend server?
4. **Chargebacks:** How are dispute events communicated, and what is the timeframe to submit digital evidence?
5. **Settlement to Iraq:** What is the exact settlement route to a business account in Iraq (SWIFT wire, intermediary bank, or local partner bank), and what foreign exchange spread applies?
6. **Merchant-of-Record & Tax:** Is the provider acting as Merchant of Record (remitting global digital sales taxes/VAT), or is Novelka responsible for international tax compliance?
7. **Sandbox Access:** Can Novelka be provisioned with a sandbox environment to run automated test suites against edge cases?

---

## 5. Technical Rule on Subscription Simulation

> **NEVER SIMULATE RECURRING BILLING ON ONE-TIME RAILS:**
> If a provider does not provide automated card-on-file recurring billing with banking scheme approval, Novelka will **never** attempt to simulate subscriptions via scheduled cron scripts.
>
> If a one-time gateway is used in the regional track, it will operate strictly under the **30-Day Fixed Access Pass Model**:
> - Customer pays a one-time fixed amount for 30 days of access.
> - Access expires automatically after 30 days.
> - Customer is notified to repurchase manually if they wish to continue.
> - No failed card charges, no unauthorized renewal attempts, and no compliance violations.
