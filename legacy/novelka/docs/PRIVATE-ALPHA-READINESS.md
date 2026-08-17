# Private Alpha Readiness & Controlled Rollout Plan (v1.0)
**Invite-Only Staged Cohorts, Operational Telemetry, Safeguards, and Risk Register**

---

## 1. Staged Private Alpha Rollout Sequence

Novelka will not launch directly into a wide public beta. To protect infrastructure, validate layout solving under diverse user vocabularies, and collect real-world KDP print proofs, rollout proceeds through four controlled stages:

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                     PRIVATE ALPHA PROGRESSION PIPELINE                    │
└─────────────────────────────────────┬─────────────────────────────────────┘
                                      │
 ┌────────────────────────────────────┼────────────────────────────────────┐
 ▼                                    ▼                                    ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│ Stage 1: Owner Testing  │ │ Stage 2: Small Alpha    │ │ Stage 3: Expanded Alpha │
│ 1 Internal User         │ │ 2 to 5 Trusted Creators │ │ 10 to 20 Creators       │
│ • Full smoke test suite │ │ • End-to-end KDP prints │ │ • Server load telemetry │
│ • Admin kill-switch     │ │ • Workflow bug triage   │ │ • Quota tuning          │
└─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘
                                      │
                                      ▼
                        ┌───────────────────────────┐
                        │ Stage 4: Public Free Beta │
                        │ Open Registration (Free)  │
                        │ 100% Free Gated Quotas    │
                        └───────────────────────────┘
```

---

## 2. Minimalist Operational Telemetry (Zero Content Ingestion)

Novelka tracks **only** essential technical reliability metrics:

| Metric | Target / Benchmark | Purpose | Telemetry Source |
| :--- | :--- | :--- | :--- |
| **Generation Success Rate** | $> 99.5\%$ | Catch unsolvable word lists or solver timeouts | In-Memory Solver Watchdog |
| **Export Compilation Success** | $> 99.0\%$ | Catch PDF rendering or fontkit embed errors | `/api/entitlement/consume` logs |
| **Preflight Blocker Distribution** | Logged by code (`TOO_FEW_PAGES`, etc.) | Identify common formatting errors | Diagnostic Error Logs |
| **Server Response Latency** | $< 150\text{ ms}$ (p95) | Monitor edge router performance | Server Request Timers |
| **Quota Exhaustion Rate** | $< 5\%$ of active users | Tune daily generation/export limits | `public.usage_events` |
| **Local Storage Failures** | $0$ data loss reports | Warn on browser IndexedDB exhaustion | Client Storage Manager |
| **Server 5xx Error Rate** | $< 0.1\%$ | Detect database or API edge exceptions | Server Error Handler |

> **Privacy Guarantee:** Novelka does **not** log or ingest customer word lists, book titles, puzzle grids, or manuscript contents to server databases.

---

## 3. Public Beta Safeguards Pre-Flight Checklist

Before opening registration beyond the private alpha cohorts:

- [x] **Privacy Policy Live:** Comprehensive data minimization and GDPR Article 15/17/20 documentation published.
- [x] **Beta Terms of Use Live:** Clear terms outlining beta software status and backup recommendations.
- [x] **Support / Feedback Channel Live:** Integrated rating modal (`/api/rating`) and direct support email (`support@novelka.com`).
- [x] **Backup / Export Guidance Visible:** Customer advised to export print-ready PDFs and save project copies locally.
- [x] **Exact Local Storage Limit Stated:** UI states clear guidance: *"Up to 25 books saved locally in your browser."* (No vague ranges).
- [x] **Honest Preflight Disclaimer:** Prohibits *"Amazon guaranteed"* / *"100% KDP approved"*; clearly describes preflight checks for trim size, safe area, and KDP spine gutters.
- [x] **Zero Payment Information Requested:** No card forms, no provider SDKs, and no billing gates active in beta.
- [x] **Zero Accidental Payment UI Reachable:** Checkout and subscription screens are completely inactive.

---

## 4. Remaining Production & Operational Risks

| Risk Area | Current State & Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **1. Regional Payment Terms** | Gammal Tech / regional gateways lack confirmed tokenized recurring billing terms. | Launch 100% free beta first. If one-time gateway is used, adopt the 30-Day Access Pass model. |
| **2. Client Browser Storage Limits** | Heavy books (100+ pages) consume local IndexedDB space on mobile/tablet devices. | Client storage warning triggers when quota headroom is low; recommends immediate PDF export. |
| **3. Complex Word Intersections** | Highly dense word lists with long vocabulary words ($>18$ chars) may exhaust grid density. | Layout solver implements adaptive bank fallbacks, auto-grid scaling, and squeeze warnings. |
| **4. Edge IP Rate Limit Collisions** | Multiple users behind university or corporate shared NAT IPs sharing the same egress IP. | Rate limit set to generous 120 req/min for general API, with per-user authenticated quota enforcement. |
