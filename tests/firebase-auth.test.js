import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAuth } from '../server/middleware/auth.js';
import { setAuthMock } from '../server/config/firebase.js';

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
}

test('Firebase Auth Validation — Authentication Token Integrity & Claims Lifecycle', async (t) => {
  await t.test('should validate genuine Firebase token, enforce checkRevoked=true, and populate req.user', async () => {
    const validToken = 'eyJhbGciOiJSUzI1NiJ9.genuine-token-payload-sample-abcdef1234567890';
    let passedCheckRevoked = null;

    setAuthMock({
      async verifyIdToken(token, checkRevoked) {
        passedCheckRevoked = checkRevoked;
        if (token === validToken) {
          return {
            uid: 'firebase_user_abc123',
            email: 'ranjith@mindreflect.ai',
            email_verified: true,
            auth_time: 1730456000,
            admin: false
          };
        }
        throw new Error('Invalid token');
      }
    });

    const req = {
      headers: {
        authorization: `Bearer ${validToken}`
      }
    };
    const res = createMockRes();
    let nextCalled = false;

    await verifyAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(passedCheckRevoked, true, 'Firebase token verification must check revocation');
    assert.equal(req.user.uid, 'firebase_user_abc123');
    assert.equal(req.user.email, 'ranjith@mindreflect.ai');
    assert.equal(req.user.emailVerified, true);
    assert.equal(req.user.admin, false);
  });

  await t.test('should correctly extract admin claim when present in token', async () => {
    const adminToken = 'eyJhbGciOiJSUzI1NiJ9.admin-token-payload-sample-abcdef1234567890';

    setAuthMock({
      async verifyIdToken(token) {
        return {
          uid: 'admin_master_uid',
          email: 'admin@mindreflect.ai',
          email_verified: true,
          admin: true
        };
      }
    });

    const req = { headers: { authorization: `Bearer ${adminToken}` } };
    const res = createMockRes();
    let nextCalled = false;

    await verifyAuth(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(req.user.admin, true);
  });

  await t.test('should reject expired tokens with 401 TokenExpired code', async () => {
    setAuthMock({
      async verifyIdToken() {
        const err = new Error('Firebase ID token has expired.');
        err.code = 'auth/id-token-expired';
        throw err;
      }
    });

    const req = { headers: { authorization: 'Bearer expired-token-sample-value-1234567890' } };
    const res = createMockRes();
    let nextCalled = false;

    await verifyAuth(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'TokenExpired');
    assert.equal(nextCalled, false);
  });

  await t.test('should reject revoked tokens with 401 TokenRevoked code', async () => {
    setAuthMock({
      async verifyIdToken() {
        const err = new Error('Firebase ID token has been revoked.');
        err.code = 'auth/id-token-revoked';
        throw err;
      }
    });

    const req = { headers: { authorization: 'Bearer revoked-token-sample-value-1234567890' } };
    const res = createMockRes();
    let nextCalled = false;

    await verifyAuth(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'TokenRevoked');
    assert.equal(nextCalled, false);
  });
});
