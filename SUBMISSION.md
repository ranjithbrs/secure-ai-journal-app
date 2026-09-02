# Hack2Skill Ideathon Prototype Submission Draft

**Project Title**: Secure AI Journal App on Cloud Run ("MindReflect AI")
**Track**: Accelerate AI with Cloud Run - Gen AI Academy APAC Edition

---

### 1. Live Deployment & Repository Links
- **Live Cloud Run App URL**: `https://mindreflect-ai-journal-xxxxxx-uc.a.run.app`
- **Public GitHub Repository**: `https://github.com/ranjithbrs/secure-ai-journal-app`

---

### 2. Mandatory Verification Check
- [x] **Cloud Run Label Applied**: `dev-tutorial=cloud-run-ai-challenge`
- [x] **Firebase Auth Integrated**: Google Sign-In with JWT verification.
- [x] **Private Storage**: Firestore per-user subcollections (`/users/{uid}/entries/{entryId}`) guarded by `firestore.rules`.
- [x] **Secret Manager**: API Keys fetched dynamically via Google Cloud Secret Manager.

---

### 3. Feature Description
MindReflect AI is a secure, authenticated mental wellness and journaling platform built on Google Cloud Run. Key capabilities include:
1. **Automated AI Insights**: Every entry is processed by Gemini 2.5 Flash for sentiment scoring, theme discovery, and self-reflection prompts.
2. **Interactive AI Companion**: Multi-turn chat assistant grounded in empathetic conversational guidelines.
3. **Location Awareness**: Automatic browser geolocation tagging for entry context.
4. **Role-Based Admin Dashboard**: Global metric monitoring and system status tracking.
5. **Multi-Channel Notifications**: Real-time webhook integration with Slack and Discord.

---

### 4. Social Media Post Copy

```text
🚀 Excited to launch MindReflect AI — a secure, authenticated AI Journal App built for the Google Cloud Gen AI Academy APAC Edition Ideathon!

✨ Key Stack & Features:
- Powered by Google Cloud Run & Gemini 2.5 Flash
- Firebase Auth & strict per-user Firestore security rules
- Secret Manager API Key security
- Location-aware reflections & RBAC admin metrics

Check out the code and deploy your own!
https://github.com/ranjithbrs/secure-ai-journal-app

#AccelerateAIwithCloudRun #GoogleCloud #GenAI #CloudRun #BuildWithGemini
```
