# Security Architecture & Production Hardening Report: MindReflect AI

## Overview
MindReflect AI is a secure, authenticated, and privacy-preserving personal journal application powered by **Google Gemini 2.5 Flash**, **Firebase Authentication**, **Google Cloud Firestore**, and **Google Cloud Run**. 

Because personal journaling data contains intimate reflections, mental wellness notes, and personal thoughts, this application was engineered under an uncompromising **Zero-Trust Privacy Model**.

---

## 1. System Threat Model & Data Flow

```
[ User Client (Browser) ]
       │
       │ 1. HTTPS / TLS 1.3 (Bearer Firebase ID Token)
       ▼
[ Cloud Run Ingress ]
       │
       │ 2. Security Headers (nosniff, DENY, strict-origin) & 100KB Size Limit
       ▼
[ Express API Gateway ]
       ├───> [ Strict CORS Engine (Zero-wildcard, explicit production origins) ]
       ├───> [ Auth Middleware (verifyIdToken + checkRevoked=true) ]
       ├───> [ RBAC Middleware (Custom claims + Firestore role check) ]
       │
       ├───> [ Input Sanitizer & Length Guard (Max 20,000 chars) ]
       ├───> [ Webhook SSRF Validator (HTTPS only, Slack/Discord allowlist, private IP drop) ]
       ▼
[ Services & Storage ]
       ├───> [ Gemini 2.5 Flash via GCP Secret Manager (8s Timeout, 429/503 Fallbacks) ]
       └───> [ Firestore Database (Isolated subcollections: users/{uid}/entries) ]
```

---

## 2. Authentication & Active Session Management
* **Identity Provider**: Google OAuth 2.0 managed via Firebase Authentication.
* **Cryptographic Verification**: Every protected API route enforces JWT ID token signature and issuer verification via `firebase-admin/auth`.
* **Active Revocation Checks**: Unlike standard stateless JWT verification which leaves a 1-hour revocation window, MindReflect AI calls `auth.verifyIdToken(idToken, true)`. Revoked tokens (from logout, password changes, or account termination) are rejected immediately with HTTP `401 TokenRevoked`.
* **Zero Credential Leakage**: Tokens are passed exclusively in the `Authorization: Bearer <token>` header and never serialized in URLs or query strings.

---

## 3. Data Isolation & Per-User Privacy
* **Path Scoping**: User documents are strictly partitioned into `/users/{userId}/entries/{entryId}`.
* **Server-Side Enforcement**: Backend queries use `req.user.uid` extracted from the decoded token to query Firestore. Cross-user path traversal is architecturally impossible.
* **Firestore Security Rules**: Rules enforce database-level boundaries (`request.auth.uid == userId`). Even if a client makes direct Firestore SDK calls, cross-tenant reads or writes are rejected with `PERMISSION_DENIED`.
* **Admin Privacy Boundary**: Administrators can inspect aggregated operational metrics (`GET /api/admin/stats`) and manage user account roles (`PUT /api/admin/users/:id/role`), but **cannot read, edit, or delete personal journal entries**.

---

## 4. Production Security Hardening (Phase 1 Audit)

### 4.1. SSRF Defense for Notification Webhooks
* **Scheme Restriction**: Allows strictly `https:`. Rejects `http:`, `file:`, `gopher:`, `ftp:`, `javascript:`.
* **Provider Allowlist**: Restricts destinations strictly to approved webhook domains:
  * Slack: `hooks.slack.com` with `/services/` prefix.
  * Discord: `discord.com` and `discordapp.com` with `/api/webhooks/` prefix.
* **Private Destination Blocking**: Explicitly blocks cloud metadata IPs (`169.254.169.254`, `metadata.google.internal`), loopback interfaces (`127.0.0.0/8`, `::1`, `localhost`), and RFC-1918 private subnets (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`).
* **Open-Redirect Mitigation**: Sets `maxRedirects: 0` to prevent attackers from using open redirects to reach internal services.

### 4.2. Strict CORS Allowlist (Zero Wildcard)
* **Elimination of `*`**: Permanently removed the permissive wildcard fallback.
* **Explicit Production Origins**:
  * `https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app`
  * `https://mindreflect-ai-journal-571017174215.us-central1.run.app`
  * Vercel preview regex: `^https:\/\/secure-ai-journal-app-[a-z0-9-]+-br3843311-7472s-projects\.vercel\.app$`
  * Cloud Run service regex: `^https:\/\/mindreflect-ai-journal-[a-z0-9-]+-uc\.a\.run\.app$`
* **Localhost Environment Isolation**: Localhost origins (`localhost:3000`, `localhost:5173`) are permitted only in non-production environments (`NODE_ENV !== 'production'`) and strictly rejected in production.

### 4.3. Privilege Escalation Prevention
* User profile updates (`PUT /api/user/profile`) filter permitted fields (`displayName`, `bio`, `location`, `themePreference`).
* Regular users attempting to set `role: 'admin'` are rejected with HTTP `403 Forbidden` (`Privilege escalation rejected: Regular users cannot modify role permissions`).

---

## 5. Reliability & Upstream AI Resilience (Phase 2)
* **8-Second Fail-Safe Timeout**: Upstream Gemini calls are wrapped in `withTimeout(..., 8000)`, preventing hanging requests and thread starvation on Cloud Run.
* **429 & 503 Graceful Degradation**: Catches `RESOURCE_EXHAUSTED` and `UNAVAILABLE` errors, providing deterministic, reassuring fallback reflections so user entries are **never lost or discarded**.
* **Prompt Injection Defense**: Journal contents are wrapped in explicit boundary delimiters (`<<<ENTRY_START>>> ... <<<ENTRY_END>>>`). The system prompt instructs the model to ignore embedded override commands.
* **Output Sanitization**: `sanitizeAnalysisOutput()` clamps `sentimentScore` to `[-1.0, 1.0]`, validates enum sets, and cleanses summary/theme arrays.

---

## 6. Comprehensive Automated Test Matrix

MindReflect AI features **135 automated unit and integration tests** executed natively via `node --test tests/*.test.js` in < 1 second:

| Test Suite | Tests | Scope | Status |
|---|:---:|---|:---:|
| [`tests/auth.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/auth.test.js) | 9 | Bearer token parsing, token expiration, revocation checking, RBAC | ✅ PASS |
| [`tests/cors.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/cors.test.js) | 19 | Production origins, wildcard rejection, preview regexes, environment isolation | ✅ PASS |
| [`tests/webhook.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/webhook.test.js) | 29 | SSRF defense, cloud metadata block, private subnet block, Slack/Discord check | ✅ PASS |
| [`tests/firestore-rules.integration.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/firestore-rules.integration.test.js) | 22 | Rules emulator evaluation, cross-user denial, admin privacy, schema limits | ✅ PASS |
| [`tests/admin-profile.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/admin-profile.test.js) | 12 | Privilege escalation prevention, role assignment, custom claim syncing | ✅ PASS |
| [`tests/gemini-reliability.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/gemini-reliability.test.js) | 12 | 8s timeouts, 429 rate limit recovery, 503 outages, corrupted JSON fallback | ✅ PASS |
| [`tests/gemini.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/gemini.test.js) | 12 | JSON extraction, markdown fences, sentiment clamping, input boundaries | ✅ PASS |
| [`tests/isolation.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/isolation.test.js) | 3 | Multi-tenant UID scoping and 20K char limits | ✅ PASS |
| [`tests/journal-crud.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/journal-crud.test.js) | 7 | End-to-end create, list, edit, delete, cross-user block, 404 handling | ✅ PASS |
| [`tests/firebase-auth.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/firebase-auth.test.js) | 5 | Authentic token verification, claims propagation, expiration & revocation | ✅ PASS |
| [`tests/deployment-health.test.js`](file:///C:/Users/B%20Ranjith/.gemini/antigravity/scratch/secure-ai-journal-app/tests/deployment-health.test.js) | 5 | Cloud Run & Vercel production endpoints, health tag, security headers | ✅ PASS |
| **Total** | **135** | **Zero-trust production security & reliability** | **100% PASS** |

---

## 7. Cloud Run & Infrastructure Compliance
* **Container Hardening**: Multi-stage Docker build running as a non-root user (`USER node`).
* **Secret Management**: Zero hardcoded secrets in source control; loaded in-memory from **Google Cloud Secret Manager**.
* **Challenge Label Verification**:
  ```bash
  --update-labels dev-tutorial=cloud-run-ai-challenge
  ```
