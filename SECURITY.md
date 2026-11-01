# Security Architecture & Audit Report: MindReflect AI

## Overview
MindReflect AI is a secure, authenticated, and privacy-preserving personal journal application powered by **Google Gemini 2.5 Flash**, **Firebase Authentication**, **Google Cloud Firestore**, and **Google Cloud Run**. 

Because personal journaling data contains intimate reflections, mental wellness notes, and personal thoughts, this application was engineered under a **Zero-Trust Privacy Model**.

---

## 1. Threat Model & Data Flow

```
[ User Client ] 
      │
      │ 1. HTTPS / TLS 1.3 (Bearer ID Token)
      ▼
[ Cloud Run Ingress ]
      │
      │ 2. Security Headers & Payload Size Limits (100KB)
      ▼
[ Express API Gateway ]
      ├───> [ Auth Middleware (verifyIdToken + signature/revocation check) ]
      ├───> [ RBAC Middleware (Custom claims + Firestore role validation) ]
      │
      ├───> [ Input Sanitizer & Length Validator (Max 20K chars) ]
      ▼
[ Services & Storage ]
      ├───> [ Gemini 2.5 Flash API via Secret Manager (Secure API Key) ]
      └───> [ Firestore Database (Isolated subcollections: users/{uid}/entries) ]
```

---

## 2. Authentication & Session Management
- **Identity Provider**: Google OAuth 2.0 managed via Firebase Authentication.
- **Token Verification**: Every protected API route enforces cryptographically verified JWT ID Tokens via `firebase-admin/auth`.
- **Session Expiration & Revocation**: Tokens have a 1-hour lifespan. Revoked or forged tokens are rejected with standard `401 Unauthorized` responses.
- **Zero Token Leakage**: Tokens are passed exclusively in the `Authorization: Bearer <token>` header and never serialized in URLs or query parameters.

---

## 3. Data Isolation & Per-User Privacy
- **Path Isolation**: User data is strictly partitioned into `/users/{userId}/entries/{entryId}`.
- **API Guardrails**: Backend queries use `req.user.uid` extracted from the decoded token to query Firestore. Cross-user path traversal is architecturally impossible.
- **Firestore Security Rules**: Enforces database-level isolation. Even if a client makes a direct SDK call, rules mandate `request.auth.uid == userId`.
- **Admin Privilege Boundaries**: Admins can inspect system aggregated statistics (user counts, entry counts, system health), but **cannot read private journal contents**.

---

## 4. Firestore Security Rules Audit
The `firestore.rules` file addresses critical security controls:
1. **Privilege Escalation Prevention**: Users cannot write `{ role: 'admin' }` to their profile document. Role updates are strictly restricted to existing administrators.
2. **Input Validation**: `content` must be a string with `0 < size <= 20000`. `title` must be `<= 200` characters.
3. **Owner Scoping**: Read, update, and delete operations on entries require `request.auth.uid == userId`.

---

## 5. Gemini AI Prompt & Output Security
- **Prompt Injection Mitigation**: Journal contents are wrapped in explicit boundary delimiters (`<<<ENTRY_START>>> ... <<<ENTRY_END>>>`). The system prompt instructs Gemini to ignore embedded override commands and strictly perform sentiment analysis.
- **Safe JSON Extraction**: LLM output is parsed through `extractAndParseJSON()`, which strips markdown fences and extracts only between `{` and `}` boundaries.
- **Schema Sanitization**: `sanitizeAnalysisOutput()` clamps `sentimentScore` to `[-1.0, 1.0]`, normalizes sentiments to valid enum sets, and sanitizes themes and prompt strings.
- **Edge Case Resilience**: Empty inputs, whitespace, short emojis, and non-English text have deterministic, graceful fallbacks without crashing the server.

---

## 6. Secrets & Cloud Run Infrastructure Hardening
- **No Hardcoded Credentials**: API keys and service accounts are excluded via `.gitignore` and `.dockerignore`.
- **Google Cloud Secret Manager**: Production deployments resolve `GEMINI_API_KEY` dynamically at startup from `projects/$PROJECT_ID/secrets/GEMINI_API_KEY/versions/latest`.
- **Container Hardening**: Dockerfile uses multi-stage builds and runs as a non-root user (`USER node`).
- **Challenge Verification Label**: Cloud Run deployment scripts automatically label the service with `dev-tutorial=cloud-run-ai-challenge`.

---

## 7. Security Checklist & Verification Status

| Audit Item | Status | Verification Mechanism |
|---|---|---|
| **Firestore Security Rules** | ✅ PASS | Privilege escalation blocked; strict schema limits enforced |
| **User Data Isolation** | ✅ PASS | Scoped subcollections `/users/{uid}/entries`; cross-access blocked |
| **Gemini Edge Cases** | ✅ PASS | Boundary delimiters, JSON parser, and normalization fallbacks |
| **Auth & Sessions** | ✅ PASS | Bearer JWT verification, token expiration handling |
| **Deployment & Secrets** | ✅ PASS | Non-root container, GCP Secret Manager, `.gitignore` exclusions |
| **Security Documentation** | ✅ PASS | Complete threat model, DFD, and audit matrix in `SECURITY.md` |
| **Authorization Tests** | ✅ PASS | Automated test suite in `tests/` verifying all isolation boundaries |
