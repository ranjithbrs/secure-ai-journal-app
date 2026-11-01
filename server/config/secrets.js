// Native .env loader in Node.js 20+ (zero dependency)
if (typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile();
  } catch {
    // .env file is optional in production containers
  }
}

let cachedApiKey = null;

/**
 * Retrieves the Gemini API Key with multi-layered secret resolution:
 * 1. Process environment (local dev & testing)
 * 2. Google Cloud Secret Manager (production on Cloud Run)
 * Never prints or leaks raw keys into application logs.
 */
export async function getGeminiApiKey() {
  if (cachedApiKey) return cachedApiKey;

  // 1. Environment Variable check
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0) {
    cachedApiKey = process.env.GEMINI_API_KEY.trim();
    console.log('[Security] Using GEMINI_API_KEY from environment.');
    return cachedApiKey;
  }

  // 2. Google Cloud Secret Manager check
  const projectId = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) {
    return '';
  }

  try {
    const { SecretManagerServiceClient } = await import('@google-cloud/secret-manager');
    const client = new SecretManagerServiceClient();
    const name = `projects/${projectId}/secrets/GEMINI_API_KEY/versions/latest`;
    
    const [version] = await client.accessSecretVersion({ name });
    cachedApiKey = version.payload.data.toString('utf8').trim();
    console.log('[Security] Successfully loaded GEMINI_API_KEY from Google Secret Manager.');
    return cachedApiKey;
  } catch (err) {
    console.warn('[Security] Secret Manager retrieval warning:', err.message);
    return process.env.GEMINI_API_KEY || '';
  }
}
