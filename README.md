# Secure AI Journal App on Cloud Run ("MindReflect AI")

> Official Submission for the **Google Cloud Gen AI Academy APAC Edition Ideathon Challenge**.

## Technical Architecture & Features
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, Geolocation API.
- **Backend**: Node.js + Express REST API on Google Cloud Run.
- **Authentication**: Firebase Authentication (Google OAuth 2.0).
- **Database**: Firestore with isolated subcollections (`users/{uid}/entries/{entryId}`) and strict security rules (`firestore.rules`).
- **AI Integration**: `@google/genai` (Gemini 2.5 Flash) for automated sentiment tagging, key themes, and interactive journaling companion.
- **Secret Manager**: `GEMINI_API_KEY` pulled dynamically from GCP Secret Manager with `.env` fallback.
- **Enhancements**:
  - Location-Aware Tagging via Geolocation API.
  - Role-Based Admin Dashboard (RBAC).
  - Webhook Notification Dispatcher (Slack, Discord, Email).

---

## Local Setup Instructions

1. **Clone & Install Dependencies**:
   ```bash
   git clone https://github.com/ranjithbrs/secure-ai-journal-app.git
   cd secure-ai-journal-app
   npm install
   ```

2. **Configure Environment Variables (`.env`)**:
   ```env
   PORT=8080
   GEMINI_API_KEY=your_gemini_api_key_here
   VITE_FIREBASE_API_KEY=your_firebase_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   ```

3. **Run Locally**:
   ```bash
   npm run dev      # Frontend dev server
   npm run server   # Backend Node Express server
   ```

---

## Deployment to Google Cloud Run

Execute the automated script (PowerShell or Bash) to build and deploy to Cloud Run with the mandatory verification tag:

```powershell
.\deploy-cloudrun.ps1
```
Or:
```bash
./deploy-cloudrun.sh
```

**Verification Tag Applied**: `--update-labels dev-tutorial=cloud-run-ai-challenge`
