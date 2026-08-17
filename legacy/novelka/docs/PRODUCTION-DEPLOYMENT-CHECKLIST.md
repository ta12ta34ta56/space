# Production Deployment Checklist (v1.0)
**Pre-Flight Security, Infrastructure, and Configuration Gate for Novelka**

---

## 1. Database & Row Level Security (PostgreSQL)

- [ ] **Run Full Schema Migration:** Apply `server/db/schema.sql` to the target PostgreSQL cluster.
- [ ] **Verify All 11 Public Tables Have RLS Enabled & Forced:**
  1. `public.profiles` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  2. `public.subscriptions` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  3. `public.projects` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  4. `public.usage_events` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  5. `public.feature_flags` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  6. `public.content_rules` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  7. `public.webhook_events` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  8. `public.ratings` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  9. `public.templates` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  10. `public.admin_audit_logs` (`ENABLE & FORCE ROW LEVEL SECURITY`)
  11. `public.idempotency_keys` (`ENABLE & FORCE ROW LEVEL SECURITY`)
- [ ] **Verify Database Triggers Active:**
  - `protect_profile_columns_trg`: Rejects client attempts to modify `tier`, `is_owner`, `stripe_customer_id`, or `email`.
  - `prevent_audit_log_mutation_trg`: Enforces append-only immutability for `admin_audit_logs` (blocks `UPDATE` and `DELETE`).
- [ ] **Verify Stored Procedures Installed:**
  - `consume_quota_atomic()` and `consume_quota()` revoke permissions from `public`, `anon`, and `authenticated`.

---

## 2. Server Environment Secrets

- [ ] **`GRANT_SIGNING_SECRET` Provisioned:**
  - Length: At least 32 characters (recommended: 64 hexadecimal characters via `openssl rand -hex 32`).
  - Key Separation: Strictly distinct from `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY`.
  - Edge Runtime: Set as an environment secret on the backend API router.
- [ ] **`SUPABASE_SERVICE_ROLE_KEY` Protected:**
  - Kept strictly on the backend server; **never** present in Vite/client `.env` or client bundles.
  - Rotated if previously used during staging/dev trials.
- [ ] **`STRIPE_WEBHOOK_SECRET` Configured:**
  - Matches the signing secret (`whsec_...`) from the production Stripe dashboard.
- [ ] **No Secrets in Client Artifacts:**
  - `npm run verify:secrets` passes with 0 leaks across all built chunks.

---

## 3. Safe Owner Account Provisioning

- [ ] **Explicit UUID Promotion:**
  Designate the platform administrator strictly by UUID query in the Supabase SQL editor:
  ```sql
  -- 1. Look up verified owner UUID
  select id, email, created_at from auth.users where email = 'verified_owner@yourdomain.com';

  -- 2. Update profile by explicit UUID
  update public.profiles
     set is_owner = true,
         updated_at = now()
   where id = '<VERIFIED-UUID>'::uuid;
  ```
- [ ] **Assert Non-Owners Rejected:** Verify that non-owner user tokens receive `403 Forbidden` on `/api/admin/overview`.

---

## 4. Multi-Page Host & Domain Routing

- [ ] **`app.novelka.com` (Customer Web App):**
  - Serves `dist/index.html`.
  - Public builds generated via `npm run build:public` (`VITE_ENABLE_ADMIN=false`) to eliminate all admin chunks from client distribution.
- [ ] **`admin.novelka.com` (Owner Control Plane):**
  - Serves `dist/admin.html` with access restricted to authenticated owners.
- [ ] **`api.novelka.com` (Backend Server API):**
  - CORS allowlist restricted to `https://app.novelka.com` and `https://admin.novelka.com`.
  - Security headers present on all responses (`Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`).

---

## 5. Automated Build & Verification Gate

Run the full verification suite before deploying:

```bash
# 1. Zero Lint Errors or Warnings
npm run lint

# 2. TypeScript Compilation
npx tsc -b

# 3. Server Security Test Suites (10 suites, 236 checks)
npm run test:server

# 4. Client Domain & Flow Test Suites (19 suites, 1,100+ checks)
npm run test:unit

# 5. Production Multi-Page Build
npm run build

# 6. Secret Leak Scanner Gate
npm run verify:secrets
```
