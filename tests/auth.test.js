import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verifyAuth } from '../server/middleware/auth.js';
import { verifyAdmin } from '../server/middleware/admin.js';
import { setAuthMock, setDbMock } from '../server/config/firebase.js';

describe('Authentication Middleware (verifyAuth)', () => {
  it('should reject requests with missing Authorization header (401)', async () => {
    let statusCode = null;
    let jsonBody = null;

    const req = { headers: {} };
    const res = {
      status(code) {
        statusCode = code;
        return {
          json(body) {
            jsonBody = body;
          }
        };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAuth(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(jsonBody.error, 'Unauthorized');
    assert.strictEqual(nextCalled, false);
  });

  it('should reject malformed Authorization header missing "Bearer" prefix (401)', async () => {
    let statusCode = null;
    let jsonBody = null;

    const req = { headers: { authorization: 'Basic mysecretcredentials' } };
    const res = {
      status(code) {
        statusCode = code;
        return { json: (body) => { jsonBody = body; } };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAuth(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(jsonBody.error, 'Unauthorized');
    assert.strictEqual(nextCalled, false);
  });

  it('should reject token with length too short / invalid structure (401)', async () => {
    let statusCode = null;
    let jsonBody = null;

    const req = { headers: { authorization: 'Bearer short' } };
    const res = {
      status(code) {
        statusCode = code;
        return { json: (body) => { jsonBody = body; } };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAuth(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(jsonBody.message, 'Invalid token structure');
    assert.strictEqual(nextCalled, false);
  });

  it('should verify valid token, pass checkRevoked=true, and attach sanitized user identity to req.user', async () => {
    const validToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.validpayloadstringhere1234567890';
    let capturedCheckRevoked = null;
    let capturedToken = null;

    setAuthMock({
      async verifyIdToken(token, checkRevoked) {
        capturedToken = token;
        capturedCheckRevoked = checkRevoked;
        if (token === validToken) {
          return {
            uid: 'verified_user_999',
            email: 'user@example.com',
            email_verified: true,
            auth_time: 1730000000
          };
        }
        throw new Error('Invalid token');
      }
    });

    const req = { headers: { authorization: `Bearer ${validToken}` } };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAuth(req, res, next);

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(capturedToken, validToken);
    assert.strictEqual(capturedCheckRevoked, true, 'verifyIdToken MUST be called with checkRevoked=true');
    assert.strictEqual(req.user.uid, 'verified_user_999');
    assert.strictEqual(req.user.email, 'user@example.com');
  });

  it('should handle revoked token with 401 and TokenRevoked code', async () => {
    const revokedToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.revokedpayloadstringhere1234567890';
    let passedCheckRevoked = null;

    setAuthMock({
      async verifyIdToken(token, checkRevoked) {
        passedCheckRevoked = checkRevoked;
        const err = new Error('The Firebase ID token has been revoked.');
        err.code = 'auth/id-token-revoked';
        throw err;
      }
    });

    let statusCode = null;
    let jsonBody = null;
    const req = { headers: { authorization: `Bearer ${revokedToken}` } };
    const res = {
      status(code) {
        statusCode = code;
        return { json: (body) => { jsonBody = body; } };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAuth(req, res, next);

    assert.strictEqual(passedCheckRevoked, true, 'verifyIdToken checkRevoked argument should be true');
    assert.strictEqual(statusCode, 401);
    assert.strictEqual(jsonBody.error, 'TokenRevoked');
    assert.strictEqual(jsonBody.message, 'Token has been revoked. Please sign in again.');
    assert.strictEqual(nextCalled, false);
  });

  it('should handle expired token with 401 and TokenExpired code', async () => {
    const expiredToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.expiredpayloadstringhere1234567890';
    setAuthMock({
      async verifyIdToken() {
        const err = new Error('Token has expired');
        err.code = 'auth/id-token-expired';
        throw err;
      }
    });

    let statusCode = null;
    let jsonBody = null;
    const req = { headers: { authorization: `Bearer ${expiredToken}` } };
    const res = {
      status(code) {
        statusCode = code;
        return { json: (body) => { jsonBody = body; } };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAuth(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(jsonBody.error, 'TokenExpired');
    assert.strictEqual(nextCalled, false);
  });
});

describe('Role-Based Access Control Middleware (verifyAdmin)', () => {
  it('should reject unauthenticated request without req.user (401)', async () => {
    let statusCode = null;
    const req = {};
    const res = {
      status(code) {
        statusCode = code;
        return { json: () => {} };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAdmin(req, res, next);

    assert.strictEqual(statusCode, 401);
    assert.strictEqual(nextCalled, false);
  });

  it('should grant access immediately if user has custom admin claim in token', async () => {
    const req = {
      user: {
        uid: 'admin-user-123',
        admin: true
      }
    };
    const res = {};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAdmin(req, res, next);

    assert.strictEqual(nextCalled, true);
  });

  it('should block non-admin users with 403 Forbidden', async () => {
    setDbMock({
      collection(col) {
        return {
          doc(id) {
            return {
              async get() {
                return { exists: true, data: () => ({ role: 'user' }) };
              }
            };
          }
        };
      }
    });

    let statusCode = null;
    let jsonBody = null;
    const req = {
      user: {
        uid: 'standard-user-456',
        admin: false
      }
    };
    const res = {
      status(code) {
        statusCode = code;
        return { json: (body) => { jsonBody = body; } };
      }
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    await verifyAdmin(req, res, next);

    assert.strictEqual(statusCode, 403);
    assert.strictEqual(jsonBody.error, 'Forbidden');
    assert.strictEqual(nextCalled, false);
  });
});
