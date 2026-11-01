import test from 'node:test';
import assert from 'node:assert/strict';
import { isOriginAllowed, corsOptions, EXPLICIT_PRODUCTION_ORIGINS, DEVELOPMENT_ORIGINS } from '../server/config/cors.js';

test('CORS Policy — Explicit Production Origins', async (t) => {
  await t.test('should allow official Vercel production origin', () => {
    const origin = 'https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app';
    assert.equal(isOriginAllowed(origin, 'production'), true);
  });

  await t.test('should allow official Cloud Run production origin', () => {
    const origin = 'https://mindreflect-ai-journal-571017174215.us-central1.run.app';
    assert.equal(isOriginAllowed(origin, 'production'), true);
  });

  await t.test('should allow Vercel feature and git branch preview URLs matching app pattern', () => {
    const previewUrls = [
      'https://secure-ai-journal-app-git-main-br3843311-7472s-projects.vercel.app',
      'https://secure-ai-journal-app-pr-42-br3843311-7472s-projects.vercel.app',
      'https://secure-ai-journal-app-audit-followup-br3843311-7472s-projects.vercel.app'
    ];

    for (const url of previewUrls) {
      assert.equal(isOriginAllowed(url, 'production'), true, `Failed for preview url: ${url}`);
    }
  });

  await t.test('should allow Cloud Run regional preview patterns', () => {
    const cloudRunOrigin = 'https://mindreflect-ai-journal-xyz123-uc.a.run.app';
    assert.equal(isOriginAllowed(cloudRunOrigin, 'production'), true);
  });
});

test('CORS Policy — Wildcard & Permissive Origin Defense', async (t) => {
  await t.test('should strictly reject wildcard "*" as incoming origin', () => {
    assert.equal(isOriginAllowed('*', 'production'), false);
    assert.equal(isOriginAllowed('*', 'development'), false);
  });

  await t.test('should filter out wildcard "*" if configured in ALLOWED_ORIGINS env variable', () => {
    const customConfigWithWildcard = '*, https://allowed-domain.com';
    assert.equal(isOriginAllowed('*', 'production', customConfigWithWildcard), false);
    assert.equal(isOriginAllowed('https://allowed-domain.com', 'production', customConfigWithWildcard), true);
    assert.equal(isOriginAllowed('https://attacker.com', 'production', customConfigWithWildcard), false);
  });

  await t.test('should allow same-origin or tool requests missing the Origin header', () => {
    assert.equal(isOriginAllowed(null, 'production'), true);
    assert.equal(isOriginAllowed(undefined, 'production'), true);
    assert.equal(isOriginAllowed('', 'production'), true);
  });
});

test('CORS Policy — Unauthorized Origins Rejection', async (t) => {
  await t.test('should reject completely untrusted external domains', () => {
    const untrustedOrigins = [
      'https://malicious-site.com',
      'https://phishing-journal.org',
      'https://evil-attacker.vercel.app',
      'https://google.com'
    ];

    for (const origin of untrustedOrigins) {
      assert.equal(isOriginAllowed(origin, 'production'), false, `Allowed untrusted: ${origin}`);
    }
  });

  await t.test('should reject spoofed or subdomain suffix attempts on production URLs', () => {
    const spoofedOrigins = [
      'https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app.attacker.com',
      'https://attacker-secure-ai-journal-app-br3843311-7472s-projects.vercel.app',
      'https://fake-mindreflect-ai-journal-571017174215.us-central1.run.app',
      'http://secure-ai-journal-app-br3843311-7472s-projects.vercel.app' // Plain HTTP
    ];

    for (const origin of spoofedOrigins) {
      assert.equal(isOriginAllowed(origin, 'production'), false, `Allowed spoofed origin: ${origin}`);
    }
  });
});

test('CORS Policy — Development vs Production Environment Isolation', async (t) => {
  await t.test('should permit localhost origins in non-production environments', () => {
    for (const localOrigin of DEVELOPMENT_ORIGINS) {
      assert.equal(isOriginAllowed(localOrigin, 'development'), true);
      assert.equal(isOriginAllowed(localOrigin, 'test'), true);
    }
  });

  await t.test('should strictly block localhost origins in production', () => {
    for (const localOrigin of DEVELOPMENT_ORIGINS) {
      assert.equal(
        isOriginAllowed(localOrigin, 'production'), 
        false, 
        `Localhost origin ${localOrigin} unexpectedly allowed in production!`
      );
    }
  });
});

test('CORS Options Callback & Preflight Security Configuration', async (t) => {
  await t.test('should invoke callback with true for authorized origin', (t, done) => {
    const authorizedOrigin = 'https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app';
    corsOptions.origin(authorizedOrigin, (err, allowed) => {
      assert.equal(err, null);
      assert.equal(allowed, true);
      done();
    });
  });

  await t.test('should invoke callback with Error for unauthorized origin', (t, done) => {
    const blockedOrigin = 'https://unauthorized-domain.com';
    corsOptions.origin(blockedOrigin, (err, allowed) => {
      assert.notEqual(err, null);
      assert.match(err.message, /CORS policy violation/i);
      assert.equal(allowed, undefined);
      done();
    });
  });

  await t.test('should enforce credentials, secure methods, and preflight maxAge', () => {
    assert.equal(corsOptions.credentials, true);
    assert.deepEqual(corsOptions.methods, ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
    assert.deepEqual(corsOptions.allowedHeaders, ['Content-Type', 'Authorization', 'X-Requested-With']);
    assert.equal(corsOptions.maxAge, 86400);
  });
});
