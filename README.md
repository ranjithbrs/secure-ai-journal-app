# Secure AI Journal App on Cloud Run ("MindReflect AI")

> 🏆 Official Submission for the **Google Cloud Gen AI Academy APAC Edition Ideathon Challenge**.

[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-success?style=for-the-badge&logo=vercel)](https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app)
[![Challenge](https://img.shields.io/badge/Google%20Cloud-Gen%20AI%20Academy-blue?style=for-the-badge&logo=googlecloud)](https://github.com/ranjithbrs/secure-ai-journal-app)
[![Mandatory Label](https://img.shields.io/badge/Cloud%20Run%20Label-dev--tutorial%3Dcloud--run--ai--challenge-orange?style=for-the-badge)](https://github.com/ranjithbrs/secure-ai-journal-app)

---

### 🌐 Live Links & Demos
- 🚀 **Live Interactive Web App**: [https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app](https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app)
- 📢 **Social Media Demo Post**: [LinkedIn Post with #AccelerateAIwithCloudRun](https://lnkd.in/p/e9jNfGD2)
- 📦 **Source Code Repository**: [https://github.com/ranjithbrs/secure-ai-journal-app](https://github.com/ranjithbrs/secure-ai-journal-app)

---

## 🌟 Architecture & Key Features

```
 +-----------------------------------------------------------------------+
 |                       Client (React 18 + Vite)                        |
 | - Firebase Auth (Google Sign-In)   - Interactive Location Map View     |
 | - Rich Journal Editor & AI Insights - Role-Based Admin Dashboard       |
 +-----------------------------------------------------------------------+
                                  |
                  HTTPS (Firebase ID Token Bearer)
                                  v
 +-----------------------------------------------------------------------+
 |                  Backend (Node.js + Express Server)                   |
 | - Firebase Admin SDK (Auth & Firestore verification)                  |
 | - Google Gen AI SDK (@google/genai for Gemini 2.5 Flash)              |
 | - Secret Manager client / env setup for API Key security              |
 | - Notification Dispatcher (Slack/Discord Webhooks & Email)             |
 +-----------------------------------------------------------------------+
                      /                       \
                     v                         v
      +----------------------------+  +----------------------------+
      |   Firestore Database       |  |  Google Cloud Run          |
      | - Private /users/{uid}/... |  | - Mandatory Label:         |
      | - Strict firestore.rules   |  |   dev-tutorial=            |
      | - Admin metadata collection|  |   cloud-run-ai-challenge   |
      +----------------------------+  +----------------------------+
```

1. **Authentication**: Firebase Authentication with Google OAuth 2.0 and JWT token verification.
2. **Gemini 2.5 Flash Integration**:
   - Automated journal entry sentiment tagging and emotion scoring.
   - Intelligent self-reflection follow-up prompts.
   - Real-time multi-turn conversational AI companion ("MindReflect Companion").
3. **User-Isolated Private Storage**:
   - Firestore subcollections under `/users/{uid}/entries/{entryId}`.
   - Enforced by production `firestore.rules` ensuring complete data privacy.
4. **Secret Manager Security**:
   - Dynamic Google Cloud Secret Manager retrieval for `GEMINI_API_KEY` (zero hardcoded secrets).
5. **Enhancements**:
   - 📍 Location-Aware Reflections using HTML5 Geolocation API.
   - 🛡️ Role-Based Admin Dashboard (RBAC) with system metrics and Cloud Run verification.
   - 🔔 Webhook Notification Dispatcher (Slack & Discord).

---

## 💻 Local Setup & Development

1. **Clone the Repository**:
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
   npm run dev      # Launch React frontend (Vite)
   npm run server   # Launch Express backend server
   ```

---

## 🚀 Deployment to Google Cloud Run

To build and deploy the container to Google Cloud Run with the mandatory verification label:

### PowerShell (Windows):
```powershell
.\deploy-cloudrun.ps1
```

### Bash (Linux / Cloud Shell):
```bash
chmod +x deploy-cloudrun.sh
./deploy-cloudrun.sh
```

**Verification Tag Applied**:
```bash
--update-labels dev-tutorial=cloud-run-ai-challenge
```
