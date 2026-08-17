# Payment Provider Requirements & Regional Integration Blueprint (v1.0)
**Evaluation of Stripe, Gammal Tech, and Regional Payment Architectures for Iraq**

---

## 1. Provider Requirements Checklist

To safely support digital subscription commerce, a payment gateway must fulfill twelve technical and financial requirements:

| # | Requirement | Description | Why It Is Mandatory |
| :-: | :--- | :--- | :--- |
| **1** | **Recurring Billing Engine** | Automated calendar/monthly billing without requiring manual re-entry of card credentials on every renewal. | Manual card entry causes $>40\%$ renewal churn on SaaS products. |
| **2** | **Asynchronous Webhooks** | Server-to-server HTTP callbacks signed with HMAC-SHA256 containing event payloads (`subscription.created`, `subscription.updated`, `payment.failed`). | Browser redirects can be forged, dropped, or blocked by adblockers. |
| **3** | **Webhook Idempotency** | Webhook payloads must include unique event IDs (`evt_xxx`) to prevent duplicate processing during network retries. | Prevents granting multiple months or duplicating charges. |
| **4** | **Server Transaction Verification** | Dedicated REST API to query transaction status (`GET /payments/:id`) using a secret server API key. | Allows the server to verify status independently of client claims. |
| **5** | **Hosted Checkout (PCI Scope SAQ A)** | Hosted payment portal or tokenized iframe where cardholder data never touches Novelka servers. | Minimizes legal and compliance liability under PCI-DSS Level 1. |
| **6** | **Cancellation & Downgrade** | Customer self-serve cancellation portal or API that sets `cancel_at_period_end = true`. | Legal requirement for recurring digital subscriptions. |
| **7** | **Failed Payment Dunning** | Automated retry schedule (e.g. Smart Retries over 3, 5, 7 days) and state transition to `past_due` before cancellation. | Protects revenue against temporary bank outages. |
| **8** | **Refund & Partial Reversals** | API and dashboard endpoints to issue full or partial refunds for billing disputes. | Essential for customer service resolution. |
| **9** | **Chargeback / Dispute Notifications** | Real-time webhook notification when a customer files a dispute with their bank. | Enables immediate revocation of enterprise credentials. |
| **10** | **Customer Payment History** | Exportable invoice and receipt PDF generation for customer accounting and tax compliance. | GDPR Article 15/20 and commercial accounting compliance. |
| **11** | **Regional Settlement in Iraq** | Direct settlement support in USD or Iraqi Dinar (IQD) to local banking accounts (FIB, Qi Card, ZainCash, Trade Bank of Iraq). | Ensures fund repatriation without intermediary exchange bans. |
| **12** | **Digital Subscription Terms** | Merchant Category Code (MCC 5818 / 5734: Digital Goods / Software as a Service) permit without physical delivery proofs. | Prevents merchant account freezes from physical shipping disputes. |

---

## 2. Evaluation: Stripe vs. Regional Payment Providers (Gammal Tech / FIB / Qi Card)

```text
┌──────────────────────────────────────┬──────────────────────────────────────┐
│        Stripe (International)        │       Regional (Gammal / FIB / Qi)   │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ • Automated recurring card engine    │ • Predominantly one-time card/wallet │
│ • Robust HMAC signed webhooks        │ • Limited automated recurring debits │
│ • Complete Customer Billing Portal   │ • Webhook support varies by gateway  │
│ • Full SAQ A hosted checkout         │ • Local IQD / FIB wallet settlement  │
│ • Currency: USD global settlement    │ • Settlement direct in Iraq          │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

### Critical Architecture Warning:
> **A one-time card SDK call is NOT a subscription system.**
> If a regional payment provider supports only one-time checkout (e.g., wallet scans or 3D-Secure SMS OTP for every transaction), attempting to simulate recurring subscriptions via background cron jobs without cardholder tokenization will fail and violate payment scheme rules.

---

## 3. Alternative Monetization Models (If Gammal Lacks Recurring Engine)

If Gammal Tech or regional Iraqi gateways cannot support automated tokenized recurring billing, Novelka must adopt one of three safe non-recurring models:

```text
                                  ┌───────────────────────────┐
                                  │ Alternative Models (Iraq) │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
          ┌─────────────┐                ┌─────────────┐                ┌─────────────┐
          │  30-Day     │                │ Generation  │                │ Pre-Paid    │
          │ Access Pass │                │   Credits   │                │ Annual Key  │
          │  ($5 / mo)  │                │(50 Books/mo)│                │  ($49 / yr) │
          └─────────────┘                └─────────────┘                └─────────────┘
```

### Model A: 30-Day Fixed Access Pass (Recommended for One-Time Gateways)
- **Concept:** Customer pays a one-time fee (e.g. 7,500 IQD or $5.00) via Gammal/FIB/ZainCash for **30 days of watermark-free access**.
- **Expiration:** Database sets `profiles.tier_expires_at = now() + interval '30 days'`.
- **Renewal:** Client displays `"Access expires in 3 days — Click to renew"`. When expired, account returns to Free tier safely without failed card errors.

### Model B: Generation Volume Credits
- **Concept:** Pre-purchased book packs (e.g. *"Pack of 10 Complete Books"*).
- **Accounting:** Stored in `profiles.generation_credits`.
- **Deduction:** Consumed atomically via `consume_credit()` stored procedure upon PDF export.

### Model C: Annual Fixed License Key
- **Concept:** Single annual payment for 365 days of Pro access.

---

## 4. Webhook & Transaction Security Specifications

Regardless of whether Stripe or Gammal Tech is used, all webhook handlers must enforce:

1. **Raw Body Signature Verification:**
   - Raw bytes must be hashed using the shared webhook secret. JSON re-serialization before verification is strictly forbidden.
2. **Idempotency Claims Table:**
   - Every incoming transaction ID (`provider_transaction_id`) is claimed in `public.webhook_events` prior to executing profile tier upgrades.
   - Replayed callbacks return `HTTP 200 { received: true, duplicate: true }`.
3. **Re-Query from API for High-Value Events:**
   - For subscription grants and chargebacks, the backend re-reads the transaction record from the provider's API to protect against out-of-order webhook delivery.
4. **Failure Recovery:**
   - If a database write fails during webhook processing, the idempotency lock is released and the server returns `HTTP 500` so the payment gateway automatically retries.
