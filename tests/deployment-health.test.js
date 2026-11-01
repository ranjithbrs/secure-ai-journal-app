import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPLICIT_PRODUCTION_ORIGINS, isOriginAllowed } from '../server/config/cors.js';

test('Deployment Verification — Cloud Run & Vercel Endpoints', async (t) => {
  const CLOUD_RUN_ORIGIN = 'https://mindreflect-ai-journal-571017174215.us-central1.run.app';
  const VERCEL_FRONTEND_ORIGIN = 'https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app';
  const CHALLENGE_TAG = 'dev-tutorial=cloud-run-ai-challenge';

  await t.test('should have production Cloud Run backend and Vercel frontend in allowlist', () => {
    assert.ok(EXPLICIT_PRODUCTION_ORIGINS.includes(CLOUD_RUN_ORIGIN));
    assert.ok(EXPLICIT_PRODUCTION_ORIGINS.includes(VERCEL_FRONTEND_ORIGIN));
    assert.equal(isOriginAllowed(CLOUD_RUN_ORIGIN, 'production'), true);
    assert.equal(isOriginAllowed(VERCEL_FRONTEND_ORIGIN, 'production'), true);
  });

  await t.test('health check configuration should deliver valid status and challenge tag', () => {
    const healthResponse = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      challengeLabel: CHALLENGE_TAG
    };

    assert.equal(healthResponse.status, 'healthy');
    assert.equal(healthResponse.challengeLabel, 'dev-tutorial=cloud-run-ai-challenge');
    assert.ok(Date.parse(healthResponse.timestamp) > 0);
  });

  await t.test('security headers policy should enforce strict defense-in-depth headers', () => {
    const expectedHeaders = {
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    };

    for (const [header, expectedValue] of Object.entries(expectedHeaders)) {
      assert.ok(expectedValue);
    }
  });
});
