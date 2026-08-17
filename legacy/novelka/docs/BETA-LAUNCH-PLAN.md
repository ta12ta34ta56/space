# Free Public Beta Launch & Operational Safeguards Plan (v1.1)
**Configurable Beta Limits, Abuse Prevention, Telemetry, and Server Authority Enforcement**

---

## 1. Beta Strategy & Objectives

Novelka launches initially as a **100% Free Public Beta** without active payment processing, credit card collection, or subscription barriers.

### Key Objectives
1. **Validate Core Word Search Layout Solver:** Verify mathematical placement reliability across the 5 validated print sizes (6×9, 8×10, 8.5×11, A4, 7×9) under varied real-world vocabulary lists.
2. **Confirm KDP Preflight Quality:** Ensure generated PDFs pass Amazon KDP review without gutter collisions or trim defects.
3. **Establish User Trust:** Gather real feedback from authors and low-content creators before opening monetization tiers.

---

## 2. Dynamic & Configurable Beta Operational Limits

> **Important Architecture Rule:** Beta limits are **not** hardcoded client constants. All limits are configured dynamically on the server via `public.feature_flags` and adjustable in real time through the **Admin Control Plane (`admin.novelka.com -> Plans & Flags`)** without code changes or redeploys.

| Resource / Action | Default Beta Baseline | Configuration Parameter | Server Enforcement Route | Admin Control Plane Control |
| :--- | :--- | :--- | :--- | :--- |
| **Daily Book Generations** | **10 Books / Day** | `feature_flags.daily_limit` (`book_generation`) | `consume_quota_atomic()` | Adjustable 0 to $\infty$ in Flags tab |
| **Maximum Pages per Book** | **150 Pages** | `content_rules.max_pages` | Layout Solver & Preflight Gate | Adjustable in Content Rules |
| **Daily PDF Exports** | **5 Full Exports / Day** | `feature_flags.daily_limit` (`export_pdf`) | `/api/entitlement/consume` | Adjustable 0 to $\infty$ in Flags tab |
| **Local Project Storage** | **Up to 25 Saved Books** | Client IndexedDB Quota | Client Storage Layer | Client storage quota clamp |
| **Template Access** | **All Published Templates** | `templates.status = 'published'` | `/api/templates` | Publish / Unpublish in Templates tab |
| **Export Watermark** | **Watermark-Free Beta Badge** | `feature_flags.route_free` (`export_nowatermark`) | Signed Grant Token (`watermark: false`) | Toggle Free Route in Flags tab |
| **API Rate Limits** | **30 req/min (Export) / 120 (API)** | Edge IP Rate Limiter | Server Router Middleware | Configurable on Edge Router |

---

## 3. Client-Side Limitations & Server Enforcement Boundaries

```text
┌──────────────────────────────────────────────┐
│ CLIENT REALM (Untrusted Local Sandbox)       │
│  • Solves word search layouts locally (pure) │
│  • Compiles canvas preview images            │
│  • Stores local drafts in IndexedDB          │
│  ⚠️ Client counters can be wiped via storage │
└──────────────────────┬───────────────────────┘
                       │ HTTP Request + Idempotency-Key
                       ▼
┌──────────────────────────────────────────────┐
│ SERVER & DATABASE REALM (Authoritative)      │
│  • Enforces atomic daily quota counting      │
│  • Validates requireOwner authorization      │
│  • Issues short-lived HMAC-SHA256 grants     │
│  • Filters published vs draft templates      │
│  • Evaluates unwatermarked commercial export │
│  • Controls cloud storage synchronization    │
└──────────────────────────────────────────────┘
```

### Clarification on Client-Side Boundaries:
- **Client-side generation and localStorage counters are NOT unforgeable security.** Anyone can clear browser cookies or inspect local variables.
- **Server authority strictly governs:**
  1. **Commercial & Unwatermarked PDF Export:** Requires a cryptographically signed grant token issued by `/api/entitlement/consume`.
  2. **Paid / Premium Template Access:** Normal users can only query templates returned as `published` by `/api/templates`.
  3. **Paid Entitlements & Plan Changes:** Protected by PostgreSQL triggers; client cannot alter `profiles.tier`.
  4. **Cloud Project Synchronization (when introduced):** Subject to server storage quotas and user authorization.

---

## 4. Abuse Protection & Resource Safeguards

1. **Edge IP Rate Limiting:**
   - General API endpoints: 120 requests / minute per client IP.
   - Generation & Export endpoints (`/api/entitlement/consume`): 30 requests / minute per client IP.
2. **Payload Validation:**
   - Feature keys restricted to `^[a-z0-9_]{1,64}$`.
   - Idempotency keys validated for format and bound to `(user_id, key)` in `public.idempotency_keys`.
   - Project titles and word inputs sanitized against XSS and script injection.
3. **Solver Compute Watchdog:**
   - Word search layout computation runs with a 3-second execution timeout to prevent thread starvation.

---

## 5. Telemetry, Privacy & Bug Reporting

### Minimal Data Collection
- **Account Identification:** User email and display name in `public.profiles`.
- **Daily Quota Events:** Integer usage counters per day in `public.usage_events`.
- **Feedback & Bug Reports:** Star ratings (1–5), version tag, and user comment in `public.ratings`.
- **No Book Contents Stored:** Word lists and book drafts remain entirely on the user's device in IndexedDB.

### Bug Reporting Channels
1. **In-App Star Rating & Feedback Modal:** Prompted after successful PDF export (at most once per version).
2. **Diagnostic Preflight Error Codes:** Users can copy structured preflight error codes (`MISSING_SOLUTION`, `TEXT_OUTSIDE_SAFE_AREA`, `ODD_PAGE_COUNT`) when reporting issues.
3. **Direct Help Reference Guide:** Accessible via the Help navigation tab.

---

## 6. Real-Time Emergency Feature Shut-Off (Admin Control Plane)

If a bug or security defect is discovered in production, the owner can disable the feature across the entire platform in under 5 seconds **without a code redeploy**:

```text
[ Open admin.novelka.com ] ──► [ Plans & Flags ] ──► [ Uncheck "Enabled", Enter Reason, Save ]
                                                                       │
                                                                       ▼
[ Server updates public.feature_flags.enabled = false ] ◄──────────────┘
                               │
                               ▼
[ All /api/entitlement/consume calls for this feature immediately fail closed with 403 ]
```

### Steps to Disable a Broken Feature:
1. Log in to `https://admin.novelka.com` using owner credentials.
2. Navigate to **Plans & Flags**.
3. Locate the failing feature (e.g. `export_pdf` or `module.wordsearch`).
4. Click **Configure**, uncheck **"Enable this feature globally"**, enter an operational reason (e.g. *"Investigating layout overflow issue #102"*), and click **Save Changes**.
5. Gating takes effect immediately in PostgreSQL; all future requests for that feature return a clean fail-closed error (`"This feature is currently switched off."`).
