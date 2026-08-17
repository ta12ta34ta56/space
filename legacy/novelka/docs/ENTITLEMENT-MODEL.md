# Novelka Entitlement & Access Model (v1.0)
**Tier Hierarchy, Gating Decisions, Signed Grants, and Usage Accounting**

> **Development vs. Production Security Boundary:**
> Client-side mock entitlement behavior (such as `localStorage` tier overrides, mock feature flags, or dev unlock sequences) is strictly for local offline development, previewing, and headless DOM test fixtures. It is **not** production security. All production authorizations, usage debits, tier checks, and unwatermarked exports require authoritative server evaluation and HMAC-signed grants.

---

## 1. Subscription Tiers & Capabilities

Novelka uses four standardized subscription tiers ranked strictly by access level:

```text
[ Free ($0) ] ◄── [ Basic ($4.99/mo) ] ◄── [ Pro ($9.99/mo) ] ◄── [ Enterprise ($24.99/mo) ]
 (Rank 0)             (Rank 1)                 (Rank 2)                  (Rank 3)
```

| Tier | Price Point | Capabilities | Daily Quota | Export Watermark |
| :--- | :--- | :--- | :--- | :--- |
| **Free** | $0 / mo | • Full 1-Click Word Search Book generation.<br>• Standard 5 validated print sizes.<br>• Full-book preview & preflight checks.<br>• Local project persistence. | 5 Exports / Day | **Watermarked** |
| **Basic** | $4.99 / mo | • Everything in Free.<br>• **100% Watermark-Free PDF Exports**.<br>• All published parametric page templates.<br>• Unlimited daily exports. | Unlimited | **None** |
| **Pro** | $9.99 / mo | • Everything in Basic.<br>• Full access to all puzzle modules (Sudoku, Crossword, Maze, Tracing).<br>• Premium asset packs & styling tools.<br>• Priority layout solver computation. | Unlimited | **None** |
| **Enterprise** | $24.99 / mo | • Everything in Pro.<br>• Commercial redistribution license.<br>• High-volume multi-book generation credits.<br>• Priority technical support. | Unlimited | **None** |

---

## 2. Server Decision Outcomes (Verdict Model)

When the client asks `POST /api/entitlement/consume` or reads `GET /api/entitlement`, the server returns one of five deterministic verdict states:

```text
                                  ┌───────────────────────────┐
                                  │   POST /consume Request   │
                                  └─────────────┬─────────────┘
                                                │
                 ┌──────────────────────────────┼──────────────────────────────┐
                 ▼                              ▼                              ▼
          ┌─────────────┐                ┌─────────────┐                ┌─────────────┐
          │   allowed   │                │needs_upgrade│                │limit_reached│
          │(Signed Grant│                │ (HTTP 402)  │                │ (HTTP 429)  │
          │  Issued)    │                └─────────────┘                └─────────────┘
          └─────────────┘                       │                              │
                 │                              ▼                              ▼
                 ▼                       ┌─────────────┐                ┌─────────────┐
          ┌─────────────┐                │ unavailable │                │payment_pend │
          │ Watermark?  │                │ (HTTP 403)  │                │ (HTTP 402)  │
          │ (True/False)│                └─────────────┘                └─────────────┘
          └─────────────┘
```

1. **`allowed` (`200 OK`):**
   - The user has permission to perform the action.
   - Response includes a signed HMAC-SHA256 grant token with exact watermark and expiration parameters.
2. **`needs_upgrade` (`402 Payment Required`):**
   - The requested feature requires a higher subscription tier than the user's current rank (e.g. Free user requesting watermark-free 300 DPI export).
   - Response names the required tier (`upgradeTo: 'basic'`) and checkout URL.
3. **`limit_reached` (`429 Too Many Requests`):**
   - The user has exhausted their daily allowance (e.g. Free tier 5/5 daily exports reached).
   - Explains rollover time (midnight UTC).
4. **`unavailable` (`403 Forbidden`):**
   - The feature has been switched off by the owner via `feature_flags.enabled === false`.
5. **`payment_pending` (`402 Payment Required`):**
   - The user's subscription payment failed or is in `past_due` status.
   - Directs the user to the Stripe / billing portal to update payment details.

---

## 3. Cryptographic Grant Token Specification

### 3.1 Overview
The client cannot decide whether an export is un-watermarked. When export begins, the client presents an HMAC-signed grant token issued by `api.novelka.com`.

### 3.2 Token Structure
A compact URL-safe string: `<Base64Url-Payload>.<Base64Url-Signature>`

#### Claims Payload (`payload.json`)
```json
{
  "sub": "b1b2c3d4-0000-0000-0000-000000000001",
  "feature": "export_pdf",
  "tier": "pro",
  "watermark": false,
  "iat": 1770000000,
  "exp": 1770000300
}
```

| Field | Type | Description |
| :--- | :--- | :--- |
| `sub` | UUID | Authenticated user ID. |
| `feature` | String | Target feature code (e.g. `'export_pdf'`, `'export_300dpi'`). |
| `tier` | String | User tier at time of issuance. |
| `watermark` | Boolean | Authoritative watermark rule (`false` for Basic/Pro, `true` for Free). |
| `iat` | Number | Issued-at epoch timestamp (seconds). |
| `exp` | Number | Expiration epoch timestamp (5-minute TTL: `iat + 300`). |

#### Signing Algorithm
- Algorithm: `HMAC-SHA256`
- Secret: `GRANT_SIGNING_SECRET` (dedicated 32+ byte environment secret kept strictly on the server; never exposed to browser and strictly separated from `SUPABASE_SERVICE_ROLE_KEY`).
- **Secret Rotation Requirement:** If `SUPABASE_SERVICE_ROLE_KEY` was ever exposed or used for previous grant trials, it must be rotated before production deployment. `GRANT_SIGNING_SECRET` must be provisioned as an independent key.

---

## 4. Atomic Usage Accounting (`public.consume_quota`)

Daily limits are enforced inside a PostgreSQL database stored procedure to prevent race conditions between browser tabs:

```sql
create or replace function public.consume_quota(
  p_user_id uuid,
  p_feature text,
  p_limit   integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count integer;
begin
  insert into public.usage_events (user_id, feature_id, count)
  values (p_user_id, p_feature, 1)
  on conflict (user_id, feature_id, day)
    do update set count = public.usage_events.count + 1, updated_at = now()
  returning count into new_count;

  if p_limit is not null and new_count > p_limit then
    raise exception 'quota_exceeded' using errcode = 'P0001';
  end if;

  return new_count;
end $$;
```

---

## 5. Conflict Resolution Between Client & Server

| Scenario | Client Assumption | Server Reality | Resolution Rule |
| :--- | :--- | :--- | :--- |
| **DevTools Tier Tampering** | Client localStorage claims `tier: 'pro'`. | Database `profiles.tier` is `'free'`. | **Server always wins.** `/api/entitlement/consume` issues grant with `watermark: true`. Client synchronizes local state to match server. |
| **Daily Quota Desynchronization** | Client in-memory counter thinks 3/5 exports used. | Multiple tabs or devices consumed 5/5. | **Server always wins.** `consume_quota` throws `quota_exceeded`, returning HTTP 429. Client locks export button. |
| **Offline / Network Interruption** | User is offline. | Server unreachable. | **Fail closed for paid features, allow free.** Client renders export with default watermark. |
| **Subscription Canceled on Stripe** | Client cached active subscription. | Stripe webhook marked subscription `canceled`. | `profiles.tier` updated to `'free'` on server. Next export receives `watermark: true`. |
