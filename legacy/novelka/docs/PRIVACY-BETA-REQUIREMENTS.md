# Privacy, Terms & Data Governance Requirements for Free Beta (v1.0)
**Data Minimization, GDPR Compliance, Beta Disclaimers, and Local-First Architecture**

---

## 1. Core Privacy Philosophy & Local-First Model

Novelka is engineered on a **Local-First, Zero-Content-Ingestion** foundation:

> **Your Content Stays on Your Device:** During the free public beta, word lists, puzzle solutions, manuscript pages, and canvas layouts are generated purely in your browser and saved exclusively to local browser storage (`IndexedDB`). Novelka servers never inspect, store, sell, or index your book manuscripts.

---

## 2. Telemetry & Data Category Inventory

| Data Category | Target Database Table | Purpose | Retention Period | GDPR Status |
| :--- | :--- | :--- | :--- | :--- |
| **Account Credentials** | `auth.users`, `public.profiles` | Authentication & session verification | Until account deletion | Article 6(1)(b) Contract |
| **Daily Quota Events** | `public.usage_events` | Enforcing daily generation & export limits | 30 days rolling | Legitimate Interest |
| **User Feedback / Star Ratings** | `public.ratings` | Quality assurance and bug resolution | 1 year | Consent (Optional) |
| **Security Audit Logs** | `public.admin_audit_logs` | Immutable audit trail of owner actions | 7 years (Compliance) | Legal Obligation |
| **Book Contents / Word Lists** | **None (Client IndexedDB)** | Page generation and PDF compilation | Stored only in user's browser | Client-Controlled |

---

## 3. GDPR Compliance Endpoints (Self-Serve)

Novelka provides automated, self-serve GDPR endpoints that require zero administrative support tickets:

### 1. Right to Access & Data Portability (GDPR Articles 15 & 20)
- **Endpoint:** `GET /api/account/export`
- **Authentication:** Bearer JWT required.
- **Payload:** Machine-readable JSON export (`novelka-account-export-v1`) containing profile data, subscription history, quota events, and cloud projects (if present).
- **Download:** Emits `Content-Disposition: attachment; filename="novelka-account-export-....json"`.

### 2. Right to Erasure / Deletion (GDPR Article 17)
- **Endpoint:** `POST /api/account/delete`
- **Authentication:** Bearer JWT + confirmation email validation (`confirmEmail`).
- **Execution:**
  1. Cancels any active payment gateway links.
  2. Cascades deletion to `profiles`, `projects`, and `usage_events`.
  3. Deletes the account from `auth.users`.
  4. Anonymizes historical subscription rows (`user_id = null`, `stripe_customer_id = 'deleted'`) to satisfy statutory EU tax retention rules without retaining personal identifiers.

---

## 4. Beta Terms of Use & Honest Preflight Disclaimer

All beta surfaces and exported deliverables must display truthful, transparent reassurance:

### Permitted Reassurance Language
- *"Novelka preflight passed — gutter margins and safe areas verified."*
- *"Export checks passed for 6×9 in standard trim size."*
- *"Designed to calculate spine gutters based on Amazon KDP page-count bands."*
- *"Validated print sizes: 6×9 in, 8×10 in, 8.5×11 in, A4, and custom 7×9 in."*

### Strictly Forbidden Marketing Claims
- ❌ *"Amazon guaranteed"*
- ❌ *"100% KDP approved"*
- ❌ *"Guaranteed print-ready with zero rejections"*
- ❌ *"Generate in under two minutes"*

### Beta Disclaimer Text
> *"Novelka provides automated preflight inspection to verify trim sizes, spine gutters, safe areas, minimum page counts, and readability thresholds against standard KDP printing guidelines. Passing Novelka preflight verifies technical document geometry but does not constitute an endorsement, guarantee, or approval by Amazon.com, Inc. Authors are responsible for reviewing proofs prior to publication."*

---

## 5. Beta Support & Bug Reporting Protocol

- **In-App Feedback:** In-app rating modal triggered upon PDF export.
- **Diagnostic Codes:** Structured error codes (`MISSING_SOLUTION`, `TOO_FEW_PAGES`, `TEXT_OUTSIDE_SAFE_AREA`, `UNREADABLE_TEXT`) attached to preflight logs.
- **Support Inquiries:** Direct contact available via `support@novelka.com` (or project help modal).
