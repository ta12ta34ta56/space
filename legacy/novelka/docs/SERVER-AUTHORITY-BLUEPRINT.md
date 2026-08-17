# Server Authority & Security Blueprint (v1.0)
**Backend Authority, Security Boundaries, and Data Models for Novelka**

---

## 1. Executive Summary & Core Principle

Novelka operates on a strict security foundation:
> **The client is an untrusted rendering target. The backend server and database are the single authoritative source of truth for user identities, subscription plans, feature entitlements, daily quotas, template publication status, and administrative operations.**

While the client renders book pages, solves responsive layouts, and compiles print-ready PDFs locally, it **never** makes unverified decisions regarding monetization, feature gating, or template lifecycle publication.

> **Important Security Clarification:** Client-side mock entitlement and unlock behaviors (such as localStorage flag overrides, mock tiers, or dev unlocks) exist solely to support local offline development and test harness execution. They are **not** production security controls and provide no authorization authority on the server or database. Production security is strictly enforced by server JWT verification, PostgreSQL triggers, Row Level Security, and HMAC-signed grants.

---

## 2. Answers to the 15 Security & Authority Audit Questions

| # | Audit Question | Current State & Findings | Required Server Authority Rule |
| :-: | :--- | :--- | :--- |
| **1** | **Which decisions are currently client-authoritative?** | When running without Supabase/backend connectivity, feature flags (`src/services/feature-flags.ts`), daily usage counts, and template publication filters (`PARAMETRIC_TEMPLATES`) reside in local TypeScript/localStorage state. | All entitlement verdicts (`allowed`, `needs_upgrade`, `limit_reached`) and template lifecycle changes must be issued and signed by the backend API. |
| **2** | **Which server routes already exist?** | 9 routes exist in `server/src/routes/`: `/api/stripe/webhook`, `/api/checkout`, `/api/billing-portal`, `/api/entitlement`, `/api/entitlement/consume`, `/api/account/export`, `/api/account/delete`, `/api/rating`, `/api/health`. | Maintain these routes and add owner-guarded `/api/admin/*` routes. |
| **3** | **Which routes require authentication?** | Authenticated via Supabase JWT Bearer token: `/api/checkout`, `/api/billing-portal`, `/api/entitlement/consume`, `/api/account/export`, `/api/account/delete`. Webhook uses HMAC signature; rating and health are public rate-limited endpoints. | All future admin and project-sync endpoints must strictly require Bearer authentication. |
| **4** | **Is owner/admin authorization enforced server-side?** | Partially: `profiles.is_owner` column exists and is protected by the PostgreSQL trigger `protect_profile_columns()`, but dedicated `/api/admin/*` endpoints do not yet exist. | Every `/api/admin/*` endpoint must verify `is_owner === true` from the authenticated user's profile on the server. |
| **5** | **Can a normal user call an admin route?** | Not currently (no public admin HTTP routes exist). Admin controls in the client are gated by key sequences and passphrase. | Server must reject non-owner tokens with `403 Forbidden` on all admin endpoints. |
| **6** | **Can a user modify their own tier?** | **No in Postgres**: `schema.sql` enforces `protect_profile_columns()` trigger which rejects client writes to `tier`, `is_owner`, `stripe_customer_id`, or `email`. Client DevTools changes only alter local mock state. | Enforce database trigger on all deployments. |
| **7** | **Can a user bypass usage limits?** | In client mock mode, clearing localStorage resets local counters. When connected to the server, `consume_quota()` runs in PostgreSQL with atomic row-level increments. | Gated actions (commercial PDF export) require a server-issued signed grant token. |
| **8** | **Can a user claim a payment without server verification?** | **No**: Tier upgrades are only executed by `applySubscription()` inside `server/src/routes/stripe-webhook.ts` after verifying the raw webhook signature. | Never accept client-submitted payment claims. |
| **9** | **Are database tables protected by RLS?** | **Yes**: All 8 public tables (`profiles`, `subscriptions`, `projects`, `usage_events`, `feature_flags`, `content_rules`, `webhook_events`, `ratings`) have `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY` enabled (alongside new Phase 8B tables `templates`, `admin_audit_logs`, and `idempotency_keys`). | Verified by automated SQL schema assertions. |
| **10** | **Can a deleted user remain entitled?** | **No**: Deleting a user in `auth.users` cascades to `profiles`, `projects`, and `usage_events`. Subscription records set `user_id` to `NULL` (GDPR compliance). | Server entitlement check fails if profile is missing. |
| **11** | **Can a duplicate payment grant access twice?** | **No**: Webhook ledger table `webhook_events` stores Stripe event IDs; duplicate events return `200 { duplicate: true }` and exit idempotently. | Retain event deduplication ledger. |
| **12** | **Are usage counters idempotent?** | `consume_quota()` groups by `(user_id, feature_id, day)` with atomic `ON CONFLICT DO UPDATE`. | Add operation-level `idempotency_key` for retried generation calls. |
| **13** | **Are webhook events idempotent?** | **Yes**: Enforced by primary key constraint on `webhook_events(id)`. | Retain signature verification before DB claims. |
| **14** | **Can template publication be changed from the browser?** | Currently templates are registered in client code (`template-registry.ts`). Normal users cannot alter code, but publication state is not yet database-backed. | Move template records into a server-backed `templates` table with admin-only publication rights. |
| **15** | **What happens when the server is unavailable?** | Client fails closed for paid features (defaults to free tier with watermarked export). Basic book production and local editing continue offline. | Retain fail-closed default for premium features. |

---

## 3. Top-Level Infrastructure & Domain Architecture

```text
                                  ┌────────────────────────┐
                                  │   api.novelka.com      │
                                  │   (Backend API Router) │
                                  └───────────┬────────────┘
                                              │
                    ┌─────────────────────────┴─────────────────────────┐
                    ▼                                                   ▼
       ┌─────────────────────────┐                         ┌─────────────────────────┐
       │   app.novelka.com       │                         │   admin.novelka.com     │
       │   (Customer Web App)    │                         │   (Owner Admin Plane)   │
       └─────────────────────────┘                         └─────────────────────────┘
```

1. **`app.novelka.com` (Customer Web App):**
   - User registration and authentication via Supabase Auth.
   - 1-Click Quick Mode generation, preview, and local project storage.
   - Queries `GET /api/entitlement` for display state (usage counts, plan status).
   - Requests `POST /api/entitlement/consume` before un-watermarked exports.
2. **`admin.novelka.com` (Owner Control Plane):**
   - Completely separate host/origin.
   - Requires Supabase Auth + `is_owner === true` profile verification on every request.
   - Manages feature flags, template publication lifecycles, user tiers, and audit logs.
3. **`api.novelka.com` (Backend Server API):**
   - Validates JWT Bearer tokens and HMAC signatures.
   - Connects to Supabase PostgreSQL using `service_role` credentials.
   - Issues short-lived (5-minute) HMAC-signed entitlement grant tokens.

---

## 4. Comprehensive Backend Domain Model

```text
┌──────────────┐       1:N       ┌────────────────┐
│   Profile    ├────────────────►│  Subscription  │
│  (Account)   │                 └────────────────┘
└──────┬───────┘
       │ 1:N
       ├────────────────►┌────────────────┐
       │                 │  Usage Event   │
       │                 └────────────────┘
       │ 1:N
       ├────────────────►┌────────────────┐
       │                 │ Cloud Project  │
       │                 └────────────────┘
       │ 1:N
       └────────────────►┌────────────────────┐
                         │  Admin Audit Event │
                         └────────────────────┘

┌────────────────────┐       1:N       ┌─────────────────────┐
│  Template Record   ├────────────────►│  Template Version   │
│ (classic-ws, etc.) │                 └─────────────────────┘
```

### Entity Definitions

#### 1. Profile (`public.profiles`)
- `id` (UUID, PK, references `auth.users`)
- `email` (Text, protected)
- `display_name` (Text, user-editable)
- `tier` (Enum: `'free' | 'basic' | 'pro' | 'enterprise'`, protected)
- `is_owner` (Boolean, protected)
- `stripe_customer_id` (Text, unique, protected)
- `created_at`, `updated_at` (Timestamptz)

#### 2. Subscription (`public.subscriptions`)
- `id` (UUID, PK)
- `user_id` (UUID, references `auth.users(id)` ON DELETE SET NULL for tax retention)
- `provider` (Text: `'stripe' | 'gammal' | 'manual'`)
- `provider_subscription_id` (Text, unique)
- `provider_customer_id` (Text)
- `status` (Enum: `'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'paused'`)
- `tier` (Enum: `'free' | 'basic' | 'pro' | 'enterprise'`)
- `current_period_end` (Timestamptz)
- `cancel_at_period_end` (Boolean)

#### 3. Usage Event (`public.usage_events`)
- `id` (BigSerial, PK)
- `user_id` (UUID, references `auth.users(id)`)
- `feature_id` (Text, e.g. `'export_pdf'`, `'book_generation'`)
- `day` (Date, UTC date partition)
- `count` (Integer, atomic increment)
- Unique constraint: `(user_id, feature_id, day)`

#### 4. Parametric Template Record (`public.templates`)
- `template_id` (Text, PK, e.g. `'classic-ws'`)
- `name` (Text)
- `description` (Text)
- `generator_kind` (Text, e.g. `'wordsearch'`)
- `status` (Enum: `'draft' | 'published' | 'unpublished' | 'archived'`)
- `access_level` (Enum: `'free' | 'ad_unlock' | 'premium_only'`)
- `supported_sizes` (Text[], e.g. `['kdp6x9', 'kdp85x11', 'kdp8x10', 'A4', 'custom7x9']`)
- `current_version` (Text, e.g. `'1.0.0'`)
- `regions_schema` (JSONB)
- `slot_rules` (JSONB)
- `constraints_schema` (JSONB)
- `style_tokens` (JSONB)
- `updated_by` (UUID, references `auth.users(id)`)
- `updated_at` (Timestamptz)

#### 5. Admin Audit Log (`public.admin_audit_logs`)
- `id` (UUID, PK)
- `actor_user_id` (UUID, references `auth.users(id)`)
- `action` (Text, e.g. `'template.publish'`, `'user.tier_override'`, `'flag.update'`)
- `target_type` (Text, e.g. `'template'`, `'user'`, `'feature_flag'`)
- `target_id` (Text)
- `before_state` (JSONB)
- `after_state` (JSONB)
- `ip_address` (Text)
- `created_at` (Timestamptz)

---

## 5. Security & Authority Boundaries

```text
┌──────────────────────────────────────────────┐
│ CLIENT / BROWSER REALM (Untrusted)           │
│  • Reads cached flags and UI states          │
│  • Solves word search layouts locally (pure) │
│  • Renders Fabric canvas objects             │
│  • Compiles local PDF preview images         │
└──────────────────────┬───────────────────────┘
                       │ HTTP API Request (Bearer Token)
                       ▼
┌──────────────────────────────────────────────┐
│ SERVER / API ROUTER REALM (Authoritative)    │
│  • Authenticates user JWT claims             │
│  • Checks is_owner / subscription tiers      │
│  • Evaluates daily quotas atomically         │
│  • Verifies webhook signatures & idempotency │
│  • Issues HMAC-SHA256 Signed Grant Tokens    │
└──────────────────────┬───────────────────────┘
                       │ service_role (Bypasses RLS)
                       ▼
┌──────────────────────────────────────────────┐
│ DATABASE REALM (PostgreSQL + RLS)            │
│  • Tables FORCED with RLS policies           │
│  • Triggers reject client writes to money/is_owner
│  • Stored procedures enforce atomic quota    │
└──────────────────────────────────────────────┘
```

### The Signed Grant Token Mechanism
When a customer requests an export without a watermark:
1. Client calls `POST /api/entitlement/consume` with `{ featureId: 'export_pdf' }` and `Authorization: Bearer <token>`.
2. Server authenticates the user, reads `profiles.tier`, and calls `consume_quota_atomic(user_id, 'export_pdf', daily_limit, idempotency_key, payload_hash)`.
3. If allowed, the server constructs a signed JWT payload:
   ```json
   {
     "sub": "user-uuid",
     "feature": "export_pdf",
     "tier": "pro",
     "watermark": false,
     "exp": 1770000300,
     "iat": 1770000000
   }
   ```
4. Server signs this payload using `HMAC-SHA256` with the dedicated secret `GRANT_SIGNING_SECRET` (never `SUPABASE_SERVICE_ROLE_KEY`).
5. The client PDF export engine receives the grant and embeds the vector PDF without watermark.

> **Production Key Separation & Rotation Requirement:**
> The server strictly uses `GRANT_SIGNING_SECRET` for HMAC-SHA256 grant issuance and verification. If the Supabase service-role key has ever been exposed outside the protected server environment, it must be rotated before production deployment. In production, startup fails closed if `GRANT_SIGNING_SECRET` is missing.

---

## 6. Failure Modes & Offline Behavior

- **Network Offline / Server Unreachable:**
  - Client defaults to `'free'` tier mode.
  - PDF export remains functional with the default watermark.
  - No customer data or working projects are lost (local IndexedDB holds project snapshots).
- **Quota Exceeded ($429$):**
  - Server returns `"You've reached today's limit for this feature."`
  - Client displays clean upgrade prompt or daily rollover notification.
- **Unauthorized Admin Probing ($401 / 403$):**
  - Requests lacking `is_owner === true` receive generic `403 Forbidden` with zero stack traces or schema detail.

---

## 7. Production Deployment & Key Provisioning Requirements

1. **Owner Account Promotion:**
   Never promote administrator accounts by email query. Obtain the verified user's immutable UUID from `auth.users` and execute:
   ```sql
   update public.profiles
      set is_owner = true, updated_at = now()
    where id = '<VERIFIED-ADMIN-UUID>'::uuid;
   ```
2. **Grant Signing Secret (`GRANT_SIGNING_SECRET`):**
   - Must be at least 32 characters in production (prefer 32 random bytes encoded as 64 hexadecimal characters: `openssl rand -hex 32`).
   - Must differ strictly from `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`.
   - Production edge router fails closed if missing.
   - Must never enter client/Vite bundles.
3. **Service Role Key Rotation:**
   If `SUPABASE_SERVICE_ROLE_KEY` was ever exposed outside the protected server environment, rotate it before production deployment.
