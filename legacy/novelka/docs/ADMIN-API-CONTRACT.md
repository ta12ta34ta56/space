# Novelka Admin API Contract (v1.0)
**Owner Control Plane & Administrative HTTP API Specification**

---

## 1. Authentication & Security Guard

Every request to `/api/admin/*` must pass through the `requireOwner` security guard on the server before reaching any handler:

```text
[ Incoming Request to /api/admin/* ]
                │
                ▼
      [ Check Authorization Header ] ── (Missing / Invalid -> 401 Unauthorized)
                │
                ▼
       [ Verify JWT with Supabase ] ── (Expired / Forged -> 401 Unauthorized)
                │
                ▼
    [ Query profiles WHERE id = uid ]
                │
                ▼
       [ Is is_owner === true? ] ────── (False -> 403 Forbidden, Fail Closed)
                │
                ▼
      [ Allow to Admin Handler ]
```

### Security Guarantees
1. **Zero Obscurity Reliance:** The dedicated admin domain (`admin.novelka.com`) is a convenience interface; security is enforced 100% on the server API (`api.novelka.com`).
2. **Atomic Audit Logging:** Every mutating administrative action (`PATCH`, `PUT`, `POST`, `DELETE`) writes a record to `public.admin_audit_logs` within the same transaction.
3. **No Information Leakage:** Rejections return generic error envelopes (`{ "error": "Forbidden" }`) with no internal table names or stack traces.

---

## 2. API Endpoints

### 2.1 Admin Overview
`GET /api/admin/overview`
- **Description:** Retrieve top-level platform metrics.
- **Headers:** `Authorization: Bearer <owner-jwt>`
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "metrics": {
      "totalUsers": 1250,
      "tierBreakdown": {
        "free": 1100,
        "basic": 95,
        "pro": 50,
        "enterprise": 5
      },
      "activeSubscriptions": 150,
      "templates": {
        "published": 3,
        "draft": 1,
        "archived": 0
      },
      "dailyExportsToday": 420
    }
  }
  ```

---

### 2.2 User Management

#### List Users
`GET /api/admin/users?limit=50&offset=0&search=john`
- **Description:** Paginated list of registered users.
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "users": [
      {
        "id": "b1b2c3d4-0000-0000-0000-000000000001",
        "email": "author@example.com",
        "displayName": "Jane Doe",
        "tier": "pro",
        "isOwner": false,
        "stripeCustomerId": "cus_abc123",
        "createdAt": "2026-08-01T10:00:00Z",
        "lastActiveAt": "2026-08-12T14:30:00Z"
      }
    ],
    "total": 1250
  }
  ```

#### Get User Details
`GET /api/admin/users/:userId`
- **Description:** Detailed view of a single user account including active subscriptions and daily usage counts.
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "user": {
      "id": "b1b2c3d4-0000-0000-0000-000000000001",
      "email": "author@example.com",
      "displayName": "Jane Doe",
      "tier": "pro",
      "isOwner": false,
      "subscriptions": [
        {
          "id": "sub-uuid",
          "provider": "stripe",
          "status": "active",
          "tier": "pro",
          "currentPeriodEnd": "2026-09-01T10:00:00Z",
          "cancelAtPeriodEnd": false
        }
      ],
      "usageToday": {
        "export_pdf": 4,
        "book_generation": 12
      }
    }
  }
  ```

#### Override User Tier
`PATCH /api/admin/users/:userId/tier`
- **Description:** Manual grant or override of a user's subscription tier by the owner (e.g. VIP comp or enterprise partnership).
- **Request Body:**
  ```json
  {
    "tier": "pro",
    "reason": "Enterprise partnership agreement #402"
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "userId": "b1b2c3d4-0000-0000-0000-000000000001",
    "previousTier": "free",
    "newTier": "pro",
    "updatedAt": "2026-08-12T19:00:00Z"
  }
  ```

---

### 2.3 Feature Flags Management

#### List Feature Flags
`GET /api/admin/flags`
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "flags": [
      {
        "featureId": "export_pdf",
        "enabled": true,
        "routeFree": true,
        "routeAd": false,
        "routePaid": true,
        "minTier": "free",
        "dailyLimit": 5,
        "note": "Free accounts can export 5 books a day."
      },
      {
        "featureId": "export_nowatermark",
        "enabled": true,
        "routeFree": false,
        "routeAd": false,
        "routePaid": true,
        "minTier": "basic",
        "dailyLimit": null,
        "note": "Upgrade to remove the watermark."
      }
    ]
  }
  ```

#### Update Feature Flag
`PUT /api/admin/flags/:featureId`
- **Request Body:**
  ```json
  {
    "enabled": true,
    "routeFree": false,
    "routeAd": true,
    "routePaid": true,
    "minTier": "basic",
    "dailyLimit": 10,
    "note": "Watch a short ad or upgrade to export without limits."
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "featureId": "export_pdf",
    "updatedAt": "2026-08-12T19:05:00Z"
  }
  ```

---

### 2.4 Parametric Template Publication Control

#### List Templates (All Lifecycle Statuses)
`GET /api/admin/templates`
- **Description:** Retrieve all parametric templates including draft, published, unpublished, and archived records.
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "templates": [
      {
        "templateId": "classic-ws",
        "version": "1.0.0",
        "name": "Classic Word Search",
        "status": "published",
        "accessLevel": "free",
        "generatorKinds": ["wordsearch"],
        "supportedSizes": ["kdp6x9", "kdp8x10", "kdp85x11", "A4", "custom7x9"]
      },
      {
        "templateId": "draft-experiment-ws",
        "version": "0.1.0",
        "name": "Experimental Draft Template",
        "status": "draft",
        "accessLevel": "free",
        "generatorKinds": ["wordsearch"],
        "supportedSizes": ["kdp6x9"]
      }
    ]
  }
  ```

#### Update Template Publication Status
`PUT /api/admin/templates/:templateId/status`
- **Description:** Transition a template between lifecycle states (`draft` $\to$ `published` $\to$ `unpublished` $\to$ `archived`).
- **Request Body:**
  ```json
  {
    "status": "published",
    "reason": "Phase 6 parametric testing passed all 58 assertions."
  }
  ```
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "templateId": "draft-experiment-ws",
    "previousStatus": "draft",
    "currentStatus": "published",
    "updatedAt": "2026-08-12T19:10:00Z"
  }
  ```

---

### 2.5 Audit Logs

`GET /api/admin/audit-logs?limit=50`
- **Description:** Retrieve immutable security audit trail of administrative actions.
- **Response `200 OK`:**
  ```json
  {
    "ok": true,
    "logs": [
      {
        "id": "audit-uuid-1",
        "actorUserId": "owner-uuid",
        "action": "template.publish",
        "targetType": "template",
        "targetId": "classic-ws",
        "beforeState": { "status": "draft" },
        "afterState": { "status": "published" },
        "ipAddress": "198.51.100.1",
        "createdAt": "2026-08-12T18:00:00Z"
      }
    ]
  }
  ```

---

## 4. Production Owner Provisioning Procedure

Owner privilege grants administrative control over feature gating, user plans, and parametric templates. In production, owner promotion must **never** be performed using arbitrary or mutable email strings.

### Safe Explicit UUID-Based Owner Bootstrap

1. **Locate Target Account UUID:**
   Inspect `auth.users` in the Supabase SQL editor to obtain the verified account's immutable UUID:
   ```sql
   select id, email, created_at from auth.users where email = 'verified_owner@yourdomain.com';
   ```

2. **Grant Owner Privilege via Explicit UUID:**
   ```sql
   -- Run as DBA / Service Role in SQL Editor
   update public.profiles
      set is_owner = true,
          updated_at = now()
    where id = '00000000-0000-0000-0000-000000000000'::uuid; -- Replace with verified user UUID
   ```

3. **Verify Profile Record:**
   ```sql
   select id, email, tier, is_owner from public.profiles where id = '00000000-0000-0000-0000-000000000000'::uuid;
   ```

---

## 5. Error Responses & Standard Envelopes

All error responses adhere to a consistent JSON contract:

```json
{
  "error": "Human readable error description",
  "code": "ERROR_CODE_STRING",
  "status": 400
}
```

| HTTP Status | Code | Description |
| :--- | :--- | :--- |
| `400 Bad Request` | `INVALID_INPUT` | Malformed JSON or invalid parameter shape. |
| `401 Unauthorized` | `AUTHENTICATION_REQUIRED` | Missing or invalid Bearer JWT token. |
| `403 Forbidden` | `OWNER_PRIVILEGE_REQUIRED` | User is authenticated but `is_owner !== true`. |
| `404 Not Found` | `RESOURCE_NOT_FOUND` | Target user, template, or flag does not exist. |
| `429 Too Many Requests` | `RATE_LIMIT_EXCEEDED` | Request throttled by IP rate limiter. |
| `500 Server Error` | `INTERNAL_ERROR` | Server exception (stack traces omitted). |
