# Staging Deployment Runbook (v1.0)
**Step-by-Step Staging Host Deployment, Configuration Gates, and 16-Step Smoke Test**

---

## 1. Staging Host Topology & DNS Routing

The staging environment replicates the production multi-host security boundary without mixing administrative interfaces into customer traffic:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                          STAGING HOST TOPOLOGY                            │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ staging-app.novelka.com │ │staging-admin.novelka.com│ │ staging-api.novelka.com │
│ (Customer Web App)      │ │(Owner Control Plane)    │ │(Server API Router)      │
│ Serves: dist/index.html │ │Serves: dist/admin.html  │ │Routes: /api/*           │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
```

### Routing Rules
1. **`staging-app.novelka.com`**:
   - Serves `dist/index.html` and public customer assets (`main-*.js`, `main-*.css`).
   - Admin chunks are omitted from this host distribution.
2. **`staging-admin.novelka.com`**:
   - Serves `dist/admin.html` and administrative assets (`admin-*.js`, `admin-*.css`).
   - Access requires valid owner credentials (`is_owner === true`).
3. **`staging-api.novelka.com`**:
   - Edge router proxy handling `/api/*`.
   - Rejects unlisted origins with zero `Access-Control-Allow-Origin` headers.

---

## 2. Environment Variables & Secret Configuration

> **Security Rule:** Never paste production or live secrets into documentation or commit logs.

| Environment Variable | Target Host | Required Scope | Secret Protection Rule |
| :--- | :--- | :--- | :--- |
| `SUPABASE_URL` | Edge API Router | Server Runtime | Project URL (`https://<project-id>.supabase.co`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Edge API Router | Server Runtime Only | **Strictly server-only.** Never present in browser code. |
| `SUPABASE_ANON_KEY` | Edge Router + App | Server & Client | Public key for client auth session verification. |
| `GRANT_SIGNING_SECRET` | Edge API Router | Server Runtime Only | **Strictly server-only.** Must be at least 32 characters (prefer 64 hex via `openssl rand -hex 32`). Distinct from Supabase keys. |
| `APP_URL` | Edge API Router | Server Runtime | Primary allowed origin (`https://staging-app.novelka.com`). |
| `APP_URL_ALT` | Edge API Router | Server Runtime | Admin allowed origin (`https://staging-admin.novelka.com`). |
| `STRIPE_WEBHOOK_SECRET` | Edge API Router | Disabled / Mock | Kept inactive during free beta. |

---

## 3. CORS & Security Headers Configuration

The API edge router enforces strict headers on all responses:

```http
Content-Type: application/json; charset=utf-8
Cache-Control: no-store, no-cache, must-revalidate, private
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: geolocation=(), microphone=(), camera=(), payment=()
Vary: Origin
```

- **Origin Validation:** Origins must exactly match `staging-app.novelka.com` or `staging-admin.novelka.com`.
- **No Wildcards:** Wildcard `Access-Control-Allow-Origin: *` is strictly prohibited.

---

## 4. Safe Owner Account Provisioning

Never promote accounts by arbitrary email strings in production or staging. Obtain the verified user UUID from `auth.users` and execute:

```sql
-- 1. Query verified account UUID in auth.users
select id, email, created_at from auth.users where email = 'verified_owner@yourdomain.com';

-- 2. Promote strictly by explicit immutable UUID (Run as DBA in SQL Editor)
update public.profiles
   set is_owner = true,
       updated_at = now()
 where id = '00000000-0000-0000-0000-000000000000'::uuid;

-- 3. Verify profile record
select id, email, tier, is_owner from public.profiles where id = '00000000-0000-0000-0000-000000000000'::uuid;
```

---

## 5. Staging 16-Step Smoke Test Suite

Execute the following 16-step verification sequence against the staging deployment before public beta approval:

| Step | Action | Endpoint / Surface | Expected Result | Pass Criteria |
| :-: | :--- | :--- | :--- | :--- |
| **1** | **Customer Account Creation** | `staging-app.novelka.com` | Account created in `auth.users` and `public.profiles`. | Session token issued; tier is `'free'`. |
| **2** | **Generate 24-Page Book** | Quick Word Search Wizard | 20 puzzles + 4 solution pages generated. | `book.ok === true`, exactly 24 pages created. |
| **3** | **Save & Reload Project** | IndexedDB Storage | Project saved locally and reloaded in editor. | Page count preserved, puzzle frames match. |
| **4** | **Run Full Preflight** | Preflight Engine | Preflight checks gutter bands and page size. | `status === 'pass'`, 0 blocker errors. |
| **5** | **Export Interior PDF** | `POST /api/entitlement/consume` | PDF compiles and downloads. | Server returns `200` with signed grant token. |
| **6** | **Verify Export Grant** | Server HMAC Verification | Grant claims inspected server-side. | Valid signature, short TTL, `watermark: false` (beta). |
| **7** | **Attempt Invalid Export** | 13-Page Under-Minimum Book | Preflight intercepts short book. | Export blocked; UI displays 24-page requirement. |
| **8** | **Owner Sign-In** | `staging-admin.novelka.com` | Owner credentials submitted. | Session loads; `requireOwner` returns 200. |
| **9** | **View Admin Overview** | `GET /api/admin/overview` | Platform metrics dashboard renders. | Total users, tier breakdown, daily exports shown. |
| **10** | **Update Beta Limit** | `PUT /api/admin/flags/export_pdf` | Daily limit updated to `10`. | Server updates `feature_flags`; audit log written. |
| **11** | **Confirm Client Limit Sync** | `GET /api/entitlement` | Customer app fetches updated entitlement. | App reflects new daily limit without redeploy. |
| **12** | **Emergency Feature Disable** | `PUT /api/admin/flags/export_pdf` | Feature `enabled` set to `false`. | `consume_quota_atomic` returns `403 Forbidden`. |
| **13** | **Confirm Fail-Closed State** | Customer Export Attempt | Customer clicks export. | Export blocked with `"Feature currently switched off"`. |
| **14** | **Re-Enable Feature** | Admin Control Plane | Feature `enabled` set back to `true`. | Normal customer export functionality restored. |
| **15** | **Account Deletion (GDPR)** | `POST /api/account/delete` | Customer account deleted with confirmation. | Profile, usage, and projects erased from server. |
| **16** | **Fail-Closed on Deleted User** | `GET /api/entitlement` | Deleted account token presented. | Server rejects request with `401 Unauthorized`. |

---

## 6. Deployment Rollback Procedure

If any staging smoke test fails or critical exceptions occur:

1. **Edge Router Rollback:** Revert edge deployment traffic to the previous known-good deployment artifact via hosting dashboard / CLI.
2. **Database Rollback:** If schema issues arise, revert non-destructive migrations using pre-deployment schema backups.
3. **Emergency Feature Lockout:** If an exploitable bug is live, set `feature_flags.enabled = false` via Admin Control Plane (`https://staging-admin.novelka.com -> Plans & Flags`) to fail closed in under 5 seconds.
