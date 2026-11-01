import test from 'node:test';
import assert from 'node:assert/strict';
import { FirestoreRulesEmulator, assertFails, assertSucceeds } from './helpers/firestore-rules-evaluator.js';

test('Firestore Security Rules — Cross-User Journal Access Isolation', async (t) => {
  const emulator = new FirestoreRulesEmulator();

  // Seed existing entries for Alice and Bob
  emulator.setDocument('users/bob/entries/bob_entry_01', {
    content: 'Bob private thoughts and reflections',
    title: 'Secret Plans',
    mood: 'calm',
    createdAt: new Date().toISOString()
  });

  emulator.setDocument('users/alice/entries/alice_entry_01', {
    content: 'Alice personal reflection log',
    title: 'Morning Motivation',
    mood: 'energized',
    createdAt: new Date().toISOString()
  });

  const aliceDb = emulator.authenticatedContext('alice');
  const bobDb = emulator.authenticatedContext('bob');
  const unauthedDb = emulator.unauthenticatedContext();

  await t.test('should strictly deny Alice from reading Bob journal entry', async () => {
    await assertFails(aliceDb.doc('users/bob/entries/bob_entry_01').get());
  });

  await t.test('should strictly deny unauthenticated visitor from reading any entry', async () => {
    await assertFails(unauthedDb.doc('users/bob/entries/bob_entry_01').get());
    await assertFails(unauthedDb.doc('users/alice/entries/alice_entry_01').get());
  });

  await t.test('should strictly deny Alice from creating an entry under Bob account', async () => {
    await assertFails(
      aliceDb.doc('users/bob/entries/malicious_entry').set({
        content: 'Unauthorized content written by Alice into Bob account',
        title: 'Tampered Entry',
        mood: 'angry'
      })
    );
  });

  await t.test('should strictly deny Alice from updating Bob journal entry', async () => {
    await assertFails(
      aliceDb.doc('users/bob/entries/bob_entry_01').update({
        content: 'Overwritten by attacker'
      })
    );
  });

  await t.test('should strictly deny Alice from deleting Bob journal entry', async () => {
    await assertFails(aliceDb.doc('users/bob/entries/bob_entry_01').delete());
  });

  await t.test('should permit Alice to read, update, and delete her own journal entry', async () => {
    // Read
    const doc = await assertSucceeds(aliceDb.doc('users/alice/entries/alice_entry_01').get());
    assert.equal(doc.data().title, 'Morning Motivation');

    // Update
    await assertSucceeds(
      aliceDb.doc('users/alice/entries/alice_entry_01').update({
        mood: 'peaceful'
      })
    );

    // Verify update
    const updated = await assertSucceeds(aliceDb.doc('users/alice/entries/alice_entry_01').get());
    assert.equal(updated.data().mood, 'peaceful');

    // Delete
    await assertSucceeds(aliceDb.doc('users/alice/entries/alice_entry_01').delete());
  });

  await t.test('should permit Alice to create a new entry with valid schema under her own path', async () => {
    await assertSucceeds(
      aliceDb.doc('users/alice/entries/alice_entry_02').set({
        content: 'Just had a wonderful breakthrough solving complex security tests.',
        title: 'Breakthrough',
        mood: 'inspired'
      })
    );

    const doc = await assertSucceeds(aliceDb.doc('users/alice/entries/alice_entry_02').get());
    assert.equal(doc.data().title, 'Breakthrough');
  });
});

test('Firestore Security Rules — Admin Privacy Boundary (No Reflection Peeking)', async (t) => {
  const emulator = new FirestoreRulesEmulator();

  emulator.setDocument('users/bob/entries/bob_private_entry', {
    content: 'Extremely personal journal reflection that even admins must never read.',
    title: 'Vulnerable Thoughts',
    mood: 'sad'
  });

  emulator.setDocument('users/admin_user', {
    email: 'admin@mindreflect.ai',
    role: 'admin'
  });

  const adminDb = emulator.authenticatedContext('admin_user', { admin: true });

  await t.test('should forbid admins from reading user personal reflections', async () => {
    await assertFails(adminDb.doc('users/bob/entries/bob_private_entry').get());
  });

  await t.test('should forbid admins from tampering with or deleting user journal entries', async () => {
    await assertFails(
      adminDb.doc('users/bob/entries/bob_private_entry').update({
        content: 'Tampered by admin'
      })
    );
    await assertFails(adminDb.doc('users/bob/entries/bob_private_entry').delete());
  });

  await t.test('should allow admin to inspect user profile metadata (but not entries)', async () => {
    emulator.setDocument('users/bob', {
      email: 'bob@example.com',
      role: 'user',
      createdAt: '2026-09-01T00:00:00Z'
    });

    const userProfile = await assertSucceeds(adminDb.doc('users/bob').get());
    assert.equal(userProfile.data().email, 'bob@example.com');
  });
});

test('Firestore Security Rules — Schema & Content Validation (isValidEntryData)', async (t) => {
  const emulator = new FirestoreRulesEmulator();
  const userDb = emulator.authenticatedContext('carol');

  await t.test('should deny entry creation with empty content', async () => {
    await assertFails(
      userDb.doc('users/carol/entries/entry_empty').set({
        content: '',
        title: 'Empty'
      })
    );
  });

  await t.test('should deny entry creation exceeding 20,000 characters limit', async () => {
    const oversized = 'x'.repeat(20001);
    await assertFails(
      userDb.doc('users/carol/entries/entry_oversized').set({
        content: oversized,
        title: 'Oversized'
      })
    );
  });

  await t.test('should deny entry creation with title exceeding 200 characters', async () => {
    const longTitle = 'T'.repeat(201);
    await assertFails(
      userDb.doc('users/carol/entries/entry_long_title').set({
        content: 'Valid content here',
        title: longTitle
      })
    );
  });
});

test('Firestore Security Rules — Privilege Escalation Defense on User Profiles', async (t) => {
  const emulator = new FirestoreRulesEmulator();
  const normalUserDb = emulator.authenticatedContext('dave');
  const adminDb = emulator.authenticatedContext('system_admin', { admin: true });

  await t.test('should forbid regular user Dave from granting himself admin role on create', async () => {
    await assertFails(
      normalUserDb.doc('users/dave').set({
        email: 'dave@example.com',
        role: 'admin'
      })
    );
  });

  await t.test('should permit regular user Dave to create standard user profile', async () => {
    await assertSucceeds(
      normalUserDb.doc('users/dave').set({
        email: 'dave@example.com',
        role: 'user'
      })
    );
  });

  await t.test('should forbid Dave from updating his role to admin', async () => {
    await assertFails(
      normalUserDb.doc('users/dave').update({
        role: 'admin'
      })
    );
  });

  await t.test('should permit regular user Dave to update non-role profile fields (e.g. bio, name)', async () => {
    await assertSucceeds(
      normalUserDb.doc('users/dave').update({
        displayName: 'Dave P.',
        bio: 'Reflective developer'
      })
    );

    const doc = await assertSucceeds(normalUserDb.doc('users/dave').get());
    assert.equal(doc.data().displayName, 'Dave P.');
  });

  await t.test('should permit existing admin to update role on their own profile', async () => {
    emulator.setDocument('users/system_admin', {
      email: 'admin@mindreflect.ai',
      role: 'admin'
    });

    await assertSucceeds(
      adminDb.doc('users/system_admin').update({
        role: 'superadmin'
      })
    );

    const doc = await assertSucceeds(adminDb.doc('users/system_admin').get());
    assert.equal(doc.data().role, 'superadmin');
  });
});
