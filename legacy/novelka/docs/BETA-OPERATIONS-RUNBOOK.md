# Beta Operations Runbook (v1.0)
**Day-to-Day Administration, Quota Tuning, Incident Response, and Telemetry Monitoring**

---

## 1. Daily Operations & Dashboard Routine

The platform administrator should perform the following daily operational checks:

```text
[ Open admin.novelka.com ] ──► [ Check Overview Metrics ] ──► [ Review Feedback / Ratings ]
                                                                       │
                                                                       ▼
                                                          [ Audit Logs Inspection ]
```

1. **Review Overview Dashboard (`/api/admin/overview`):**
   - Monitor total registered user growth and daily active export volume.
   - Verify daily export counters reset cleanly at `00:00 UTC`.
2. **Review User Feedback & Star Ratings:**
   - Query `public.ratings` to assess customer satisfaction scores.
   - Identify recurring layout or preflight issues reported in user comments.
3. **Inspect Security Audit Logs (`/api/admin/audit-logs`):**
   - Confirm all administrative changes have valid reason strings.
   - Verify zero un-sanitized secrets appear in diff payloads.

---

## 2. Dynamic Quota & Limit Tuning

All beta operational limits are adjustable in real time without code changes or downtime:

| Operational Scenario | Target Flag | Action in Admin Control Plane | Effective Server Result |
| :--- | :--- | :--- | :--- |
| **High Traffic / Server Overload** | `export_pdf` | Reduce `dailyLimit` from 5 to 3 | Free accounts throttled to 3 daily exports |
| **Community Promotion / Event** | `export_pdf` | Increase `dailyLimit` to 10 | Free accounts permitted 10 daily exports |
| **Word Search Generator Bug** | `module.wordsearch` | Set `enabled = false` | Wizard displays friendly temporary maintenance alert |
| **Watermark Enforcement** | `export_nowatermark` | Set `route_free = false` | Free exports require watermark grant |

### Tuning Procedure:
1. Log in to `https://admin.novelka.com`.
2. Click **Plans & Flags**.
3. Select the target feature and click **Configure**.
4. Adjust limits, toggle route availability, provide a mandatory reason string, and save.
5. Verification: Client `GET /api/entitlement` returns the updated limit on the next user action.

---

## 3. Preflight & Layout Defect Troubleshooting

When a customer reports an export failure or preflight blocker:

1. **Request Diagnostic Code:** Ask the customer for the preflight error code (`MISSING_SOLUTION`, `TEXT_OUTSIDE_SAFE_AREA`, `ODD_PAGE_COUNT`, `TOO_FEW_PAGES`).
2. **Reproduce via Parametric Resolver:**
   - Check if the issue relates to title auto-scaling or large word bank overflow.
   - For short books ($<24$ pages), remind the author that Amazon KDP requires a minimum 24-page interior for perfect-bound print volumes.
3. **Template Rollback:** If a newly published parametric template causes layout defects, open **Templates** in the Admin Control Plane and click **Unpublish** to remove it from customer projects instantly.

---

## 4. Emergency Incident Response: 5-Second Feature Kill-Switch

In the event of a critical security vulnerability, infinite loop in client layout solving, or corrupted PDF compilation:

```text
[ Critical Vulnerability Detected ]
                │
                ▼
   [ Open admin.novelka.com ]
                │
                ▼
    [ Navigate to Plans & Flags ]
                │
                ▼
[ Locate Failing Feature -> Uncheck "Enabled" -> Save ]
                │
                ▼
[ Result: Database updates public.feature_flags.enabled = false ]
                │
                ▼
[ All /api/entitlement/consume calls immediately return 403 Forbidden ]
```

- **Execution Time:** Under 5 seconds.
- **Scope:** Completely halts server grant issuance for the affected module while allowing unaffected generators (e.g. Sudoku, Crossword, Maze) to remain operational.

---

## 5. Security & Logging Constraints

To protect customer privacy and comply with data minimization requirements:

- **Logs Must NEVER Contain:**
  - User passwords or password hashes.
  - JWT Bearer tokens or grant tokens.
  - `SUPABASE_SERVICE_ROLE_KEY` or `GRANT_SIGNING_SECRET`.
  - Stripe or payment credentials.
  - Full customer book word lists or canvas JSON payloads.
- **Allowed Log Content:**
  - Request IDs (`req_...`).
  - Origin IP addresses (for rate limiting).
  - Feature identifiers and integer status codes.
  - Anonymized error messages.
