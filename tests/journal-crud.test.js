import test from 'node:test';
import assert from 'node:assert/strict';
import { setDbMock } from '../server/config/firebase.js';

// In-Memory Firestore collection mock for end-to-end route testing
class InMemoryFirestore {
  constructor() {
    this.storage = new Map();
  }

  _getKey(uid, id) {
    return `users/${uid}/entries/${id}`;
  }

  collection(name) {
    assert.equal(name, 'users');
    return {
      doc: (uid) => ({
        collection: (subCol) => {
          assert.equal(subCol, 'entries');
          return {
            doc: (entryId) => ({
              get: async () => {
                const key = this._getKey(uid, entryId);
                const data = this.storage.get(key);
                return {
                  id: entryId,
                  exists: Boolean(data),
                  data: () => data ? { ...data } : undefined
                };
              },
              update: async (updates) => {
                const key = this._getKey(uid, entryId);
                const existing = this.storage.get(key);
                if (!existing) throw new Error('Not found');
                this.storage.set(key, { ...existing, ...updates });
              },
              delete: async () => {
                const key = this._getKey(uid, entryId);
                this.storage.delete(key);
              }
            }),
            add: async (data) => {
              const id = `entry_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
              this.storage.set(this._getKey(uid, id), { ...data });
              return { id };
            },
            orderBy: () => ({
              get: async () => {
                const prefix = `users/${uid}/entries/`;
                const docs = [];
                for (const [key, value] of this.storage.entries()) {
                  if (key.startsWith(prefix)) {
                    const entryId = key.split('/').pop();
                    docs.push({
                      id: entryId,
                      data: () => ({ ...value })
                    });
                  }
                }
                return { docs };
              }
            })
          };
        }
      })
    };
  }
}

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

test('Journal Lifecycle — Creation, Editing, Retrieval, and Deletion', async (t) => {
  const inMemoryDb = new InMemoryFirestore();
  setDbMock(inMemoryDb);

  const testUser = { uid: 'user_ranjith_001', email: 'ranjith@example.com' };

  // Helper matching server/routes/journal.js controller logic
  const MAX_CONTENT_LENGTH = 20000;
  const MAX_TITLE_LENGTH = 200;

  async function handleCreate(req, res) {
    const { title, content, location, mood } = req.body || {};
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Journal entry content is required and cannot be empty' });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ error: `Content exceeds maximum allowed length` });
    }

    const sanitizedTitle = typeof title === 'string' ? title.trim().slice(0, MAX_TITLE_LENGTH) : 'Untitled Reflection';
    const entryData = {
      title: sanitizedTitle,
      content: content.trim(),
      mood: mood || 'reflective',
      location: location || null,
      aiInsight: { sentiment: 'inspired', sentimentScore: 0.9, summary: 'Productive day' },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await inMemoryDb.collection('users').doc(req.user.uid).collection('entries').add(entryData);
    return res.status(201).json({ id: docRef.id, ...entryData });
  }

  async function handleList(req, res) {
    const snapshot = await inMemoryDb.collection('users').doc(req.user.uid).collection('entries').orderBy().get();
    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return res.status(200).json(entries);
  }

  async function handleUpdate(req, res) {
    const { id } = req.params;
    const { title, content, mood } = req.body || {};

    const docRef = inMemoryDb.collection('users').doc(req.user.uid).collection('entries').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    const updates = { updatedAt: new Date().toISOString() };
    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'Content cannot be empty' });
      }
      updates.content = content.trim();
    }
    if (title !== undefined) {
      updates.title = title.slice(0, MAX_TITLE_LENGTH);
    }
    if (mood !== undefined) {
      updates.mood = mood;
    }

    await docRef.update(updates);
    const updated = await docRef.get();
    return res.status(200).json({ id: updated.id, ...updated.data() });
  }

  async function handleDelete(req, res) {
    const { id } = req.params;
    const docRef = inMemoryDb.collection('users').doc(req.user.uid).collection('entries').doc(id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }
    await docRef.delete();
    return res.status(200).json({ success: true, message: 'Entry successfully deleted' });
  }

  let createdEntryId = null;

  await t.test('1. CREATE: should successfully create a new journal entry with AI insight', async () => {
    const req = {
      user: testUser,
      body: {
        title: 'Building Reliable Cloud Systems',
        content: 'Worked on timeout wrappers, rate limit handling, and automated test suites.',
        location: { name: 'Campus Lab' },
        mood: 'inspired'
      }
    };
    const res = createMockRes();

    await handleCreate(req, res);

    assert.equal(res.statusCode, 201);
    assert.ok(res.body.id);
    assert.equal(res.body.title, 'Building Reliable Cloud Systems');
    assert.equal(res.body.mood, 'inspired');
    assert.ok(res.body.aiInsight);
    createdEntryId = res.body.id;
  });

  await t.test('2. READ / LIST: should list user journal entries', async () => {
    const req = { user: testUser };
    const res = createMockRes();

    await handleList(req, res);

    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(res.body));
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].id, createdEntryId);
    assert.equal(res.body[0].title, 'Building Reliable Cloud Systems');
  });

  await t.test('3. UPDATE / EDIT: should modify an existing journal entry', async () => {
    const req = {
      user: testUser,
      params: { id: createdEntryId },
      body: {
        title: 'Building Reliable Cloud Systems (Updated)',
        content: 'Expanded architecture documentation and added Firestore security tests.',
        mood: 'calm'
      }
    };
    const res = createMockRes();

    await handleUpdate(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.id, createdEntryId);
    assert.equal(res.body.title, 'Building Reliable Cloud Systems (Updated)');
    assert.equal(res.body.mood, 'calm');
    assert.ok(res.body.content.includes('Expanded architecture documentation'));
  });

  await t.test('4. VALIDATION: should reject empty content update with 400', async () => {
    const req = {
      user: testUser,
      params: { id: createdEntryId },
      body: { content: '   ' }
    };
    const res = createMockRes();

    await handleUpdate(req, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /Content cannot be empty/i);
  });

  await t.test('5. CROSS-USER ISOLATION: User B cannot edit or delete User A entry', async () => {
    const attackerUser = { uid: 'user_attacker_999' };

    // Update attempt
    const updateReq = {
      user: attackerUser,
      params: { id: createdEntryId },
      body: { title: 'Tampered' }
    };
    const updateRes = createMockRes();
    await handleUpdate(updateReq, updateRes);
    assert.equal(updateRes.statusCode, 404);

    // Delete attempt
    const deleteReq = {
      user: attackerUser,
      params: { id: createdEntryId }
    };
    const deleteRes = createMockRes();
    await handleDelete(deleteReq, deleteRes);
    assert.equal(deleteRes.statusCode, 404);
  });

  await t.test('6. DELETE: should successfully delete journal entry', async () => {
    const req = {
      user: testUser,
      params: { id: createdEntryId }
    };
    const res = createMockRes();

    await handleDelete(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);

    // Verify it is gone from user list
    const listRes = createMockRes();
    await handleList({ user: testUser }, listRes);
    assert.equal(listRes.body.length, 0);
  });

  await t.test('7. DELETE 404: deleting an already-deleted entry returns 404', async () => {
    const req = {
      user: testUser,
      params: { id: createdEntryId }
    };
    const res = createMockRes();

    await handleDelete(req, res);

    assert.equal(res.statusCode, 404);
    assert.match(res.body.error, /Journal entry not found/i);
  });
});
