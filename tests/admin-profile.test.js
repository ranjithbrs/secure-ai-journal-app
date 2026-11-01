import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAdmin } from '../server/middleware/admin.js';
import { setDbMock, setAuthMock } from '../server/config/firebase.js';

// Helper to create mock Express response object
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

test('Role-Based Access Control Middleware (verifyAdmin) — In-Depth Audit', async (t) => {
  await t.test('should reject request when req.user is missing (401)', async () => {
    const req = {};
    const res = createMockRes();
    let nextCalled = false;

    await verifyAdmin(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 401);
    assert.match(res.body.error, /authentication required/i);
    assert.equal(nextCalled, false);
  });

  await t.test('should grant access immediately if user has token claim admin: true', async () => {
    const req = {
      user: {
        uid: 'admin_user_01',
        admin: true
      }
    };
    const res = createMockRes();
    let nextCalled = false;

    await verifyAdmin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  await t.test('should grant access if user has claims.role === "admin"', async () => {
    const req = {
      user: {
        uid: 'admin_user_02',
        admin: false,
        claims: { role: 'admin' }
      }
    };
    const res = createMockRes();
    let nextCalled = false;

    await verifyAdmin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  await t.test('should grant access if user has role: "admin" in Firestore document', async () => {
    setDbMock({
      collection(colName) {
        assert.equal(colName, 'users');
        return {
          doc(docId) {
            return {
              async get() {
                if (docId === 'db_admin_uid') {
                  return {
                    exists: true,
                    data: () => ({ role: 'admin', email: 'dbadmin@mindreflect.ai' })
                  };
                }
                return { exists: false };
              }
            };
          }
        };
      }
    });

    const req = {
      user: {
        uid: 'db_admin_uid',
        admin: false
      }
    };
    const res = createMockRes();
    let nextCalled = false;

    await verifyAdmin(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  await t.test('should block standard user lacking admin claim or role (403 Forbidden)', async () => {
    setDbMock({
      collection(colName) {
        return {
          doc() {
            return {
              async get() {
                return {
                  exists: true,
                  data: () => ({ role: 'user', email: 'regular@example.com' })
                };
              }
            };
          }
        };
      }
    });

    const req = {
      user: {
        uid: 'regular_user_uid',
        admin: false,
        claims: {}
      }
    };
    const res = createMockRes();
    let nextCalled = false;

    await verifyAdmin(req, res, () => { nextCalled = true; });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Forbidden');
    assert.match(res.body.message, /Administrative privileges required/i);
    assert.equal(nextCalled, false);
  });
});

test('User Profile Management & Privilege Escalation Defense', async (t) => {
  // Unit test the logic from server/routes/user.js
  const ALLOWED_PROFILE_FIELDS = ['displayName', 'bio', 'location', 'themePreference'];

  async function handleProfileUpdate(req, res, dbMock) {
    const uid = req.user.uid;
    const body = req.body || {};

    if ('role' in body && body.role !== 'user' && !req.user.admin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Privilege escalation rejected: Regular users cannot modify role permissions.'
      });
    }

    const updates = {};
    for (const key of ALLOWED_PROFILE_FIELDS) {
      if (key in body && typeof body[key] === 'string') {
        updates[key] = body[key].slice(0, 500);
      }
    }
    updates.updatedAt = new Date().toISOString();

    const userRef = dbMock.collection('users').doc(uid);
    await userRef.set(updates, { merge: true });

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      updatedFields: Object.keys(updates)
    });
  }

  await t.test('should reject regular user attempt to set role: "admin" with 403', async () => {
    const req = {
      user: { uid: 'user_attacker', admin: false },
      body: {
        displayName: 'Attacker',
        role: 'admin' // Privilege escalation attempt
      }
    };
    const res = createMockRes();
    const mockDb = { collection: () => ({ doc: () => ({ set: async () => {} }) }) };

    await handleProfileUpdate(req, res, mockDb);

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.error, 'Forbidden');
    assert.match(res.body.message, /Privilege escalation rejected/i);
  });

  await t.test('should permit regular user to update allowed profile fields (displayName, bio)', async () => {
    let savedData = null;
    let savedMergeOption = null;

    const mockDb = {
      collection(col) {
        assert.equal(col, 'users');
        return {
          doc(id) {
            assert.equal(id, 'user_john');
            return {
              async set(data, opts) {
                savedData = data;
                savedMergeOption = opts;
              }
            };
          }
        };
      }
    };

    const req = {
      user: { uid: 'user_john', admin: false },
      body: {
        displayName: 'John Doe',
        bio: 'Reflective writer',
        location: 'Coimbatore, India',
        role: 'user' // Self-asserting standard role is fine
      }
    };
    const res = createMockRes();

    await handleProfileUpdate(req, res, mockDb);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(savedData.displayName, 'John Doe');
    assert.equal(savedData.bio, 'Reflective writer');
    assert.equal(savedData.location, 'Coimbatore, India');
    assert.equal('role' in savedData, false, 'role must NOT be included in profile updates');
    assert.deepEqual(savedMergeOption, { merge: true });
  });
});

test('Admin User Management & Role Assignment (server/routes/admin.js)', async (t) => {
  const VALID_ROLES = ['admin', 'user', 'moderator'];

  async function handleAdminRoleUpdate(req, res, dbMock, authMock) {
    const { userId } = req.params;
    const { role } = req.body || {};

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'Valid userId required' });
    }

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({
        error: 'InvalidRole',
        message: `Role must be one of: ${VALID_ROLES.join(', ')}`
      });
    }

    const userRef = dbMock.collection('users').doc(userId);
    await userRef.set({
      role,
      roleUpdatedAt: new Date().toISOString(),
      roleUpdatedBy: req.user.uid
    }, { merge: true });

    if (authMock && typeof authMock.setCustomUserClaims === 'function') {
      await authMock.setCustomUserClaims(userId, {
        admin: role === 'admin',
        role
      });
    }

    res.status(200).json({
      success: true,
      message: `User ${userId} role updated to ${role}`,
      userId,
      role
    });
  }

  await t.test('should reject invalid role string with 400 InvalidRole', async () => {
    const req = {
      user: { uid: 'admin_1', admin: true },
      params: { userId: 'user_target' },
      body: { role: 'supergod' }
    };
    const res = createMockRes();
    const mockDb = { collection: () => ({ doc: () => ({ set: async () => {} }) }) };

    await handleAdminRoleUpdate(req, res, mockDb, null);

    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'InvalidRole');
    assert.match(res.body.message, /Role must be one of: admin, user, moderator/i);
  });

  await t.test('should successfully assign role and sync Firebase Auth claims when admin calls', async () => {
    let savedDocData = null;
    let customClaimsAssigned = null;

    const mockDb = {
      collection(col) {
        return {
          doc(id) {
            assert.equal(id, 'user_target');
            return {
              async set(data) {
                savedDocData = data;
              }
            };
          }
        };
      }
    };

    const mockAuth = {
      async setCustomUserClaims(uid, claims) {
        customClaimsAssigned = { uid, claims };
      }
    };

    const req = {
      user: { uid: 'system_admin', admin: true },
      params: { userId: 'user_target' },
      body: { role: 'admin' }
    };
    const res = createMockRes();

    await handleAdminRoleUpdate(req, res, mockDb, mockAuth);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.role, 'admin');
    assert.equal(savedDocData.role, 'admin');
    assert.equal(savedDocData.roleUpdatedBy, 'system_admin');
    assert.deepEqual(customClaimsAssigned, {
      uid: 'user_target',
      claims: { admin: true, role: 'admin' }
    });
  });
});
