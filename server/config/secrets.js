import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import dotenv from 'dotenv';
dotenv.config();

let cachedApiKey = null;

export async function getGeminiApiKey() {
  if (cachedApiKey) return cachedApiKey;

  if (process.env.GEMINI_API_KEY) {
    cachedApiKey = process.env.GEMINI_API_KEY;
    console.log('Using GEMINI_API_KEY from environment variables.');
    return cachedApiKey;
  }

  try {
    const client = new SecretManagerServiceClient();
    const projectId = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT;
    const name = `projects/${projectId}/secrets/GEMINI_API_KEY/versions/latest`;
    
    const [version] = await client.accessSecretVersion({ name });
    cachedApiKey = version.payload.data.toString('utf8');
    console.log('Successfully fetched GEMINI_API_KEY from Secret Manager.');
    return cachedApiKey;
  } catch (err) {
    console.warn('Secret Manager access warning:', err.message);
    return process.env.GEMINI_API_KEY || '';
  }
}
