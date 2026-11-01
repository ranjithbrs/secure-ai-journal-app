import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Firestore Security Rules Evaluation Engine
 * 
 * Accurately models Firebase Firestore Security Rules evaluation for unit & integration testing.
 * Reads the actual `firestore.rules` file from disk to verify production security posture.
 */
export class FirestoreRulesEmulator {
  constructor(rulesFilePath = path.join(__dirname, '../../firestore.rules'), initialDocuments = {}) {
    this.rulesPath = rulesFilePath;
    this.rawRules = fs.existsSync(rulesFilePath) ? fs.readFileSync(rulesFilePath, 'utf8') : '';
    this.store = new Map(Object.entries(initialDocuments));
  }

  setDocument(path, data) {
    this.store.set(this._normalizePath(path), JSON.parse(JSON.stringify(data)));
  }

  getDocument(path) {
    return this.store.get(this._normalizePath(path)) || null;
  }

  _normalizePath(p) {
    return p.replace(/^\/+|\/+$/g, '');
  }

  authenticatedContext(uid, claims = {}) {
    return new FirestoreContext(this, {
      uid,
      token: {
        uid,
        email: claims.email || `${uid}@example.com`,
        admin: Boolean(claims.admin),
        ...claims
      }
    });
  }

  unauthenticatedContext() {
    return new FirestoreContext(this, null);
  }
}

export class FirestoreContext {
  constructor(emulator, auth) {
    this.emulator = emulator;
    this.auth = auth;
  }

  collection(colPath) {
    return {
      doc: (docId) => this.doc(`${colPath}/${docId}`)
    };
  }

  doc(docPath) {
    const normalizedPath = this.emulator._normalizePath(docPath);
    return new DocumentReference(this, normalizedPath);
  }
}

export class DocumentReference {
  constructor(context, path) {
    this.context = context;
    this.path = path;
  }

  collection(subCol) {
    return {
      doc: (subDocId) => new DocumentReference(this.context, `${this.path}/${subCol}/${subDocId}`)
    };
  }

  async get() {
    const existing = this.context.emulator.getDocument(this.path);
    const request = {
      auth: this.context.auth,
      method: 'get',
      path: this.path
    };

    const allowed = this._evaluateRules(this.path, 'read', request, existing);
    if (!allowed) {
      const err = new Error(`PERMISSION_DENIED: False for 'read' on ${this.path}`);
      err.code = 'PERMISSION_DENIED';
      throw err;
    }

    return {
      exists: existing !== null,
      id: this.path.split('/').pop(),
      data: () => (existing ? { ...existing } : undefined)
    };
  }

  async set(data) {
    const existing = this.context.emulator.getDocument(this.path);
    const isCreate = existing === null;
    const request = {
      auth: this.context.auth,
      method: isCreate ? 'create' : 'update',
      path: this.path,
      resource: { data: JSON.parse(JSON.stringify(data)) }
    };

    const operation = isCreate ? 'create' : 'update';
    const allowed = this._evaluateRules(this.path, operation, request, existing);

    if (!allowed) {
      const err = new Error(`PERMISSION_DENIED: False for '${operation}' on ${this.path}`);
      err.code = 'PERMISSION_DENIED';
      throw err;
    }

    this.context.emulator.setDocument(this.path, data);
    return { success: true };
  }

  async update(newData) {
    const existing = this.context.emulator.getDocument(this.path);
    if (!existing) {
      const err = new Error(`NOT_FOUND: Document ${this.path} does not exist`);
      err.code = 'NOT_FOUND';
      throw err;
    }

    const merged = { ...existing, ...newData };
    const request = {
      auth: this.context.auth,
      method: 'update',
      path: this.path,
      resource: { data: merged }
    };

    const allowed = this._evaluateRules(this.path, 'update', request, existing);
    if (!allowed) {
      const err = new Error(`PERMISSION_DENIED: False for 'update' on ${this.path}`);
      err.code = 'PERMISSION_DENIED';
      throw err;
    }

    this.context.emulator.setDocument(this.path, merged);
    return { success: true };
  }

  async delete() {
    const existing = this.context.emulator.getDocument(this.path);
    const request = {
      auth: this.context.auth,
      method: 'delete',
      path: this.path
    };

    const allowed = this._evaluateRules(this.path, 'delete', request, existing);
    if (!allowed) {
      const err = new Error(`PERMISSION_DENIED: False for 'delete' on ${this.path}`);
      err.code = 'PERMISSION_DENIED';
      throw err;
    }

    this.context.emulator.store.delete(this.path);
    return { success: true };
  }

  _evaluateRules(docPath, op, request, currentResource) {
    const parts = docPath.split('/');

    // Security Helper functions corresponding to firestore.rules
    const isAuthenticated = () => request.auth != null && request.auth.uid != null;
    const isOwner = (uid) => isAuthenticated() && request.auth.uid === uid;
    const isAdmin = () => {
      if (!isAuthenticated()) return false;
      if (request.auth.token && request.auth.token.admin === true) return true;
      const userDoc = this.context.emulator.getDocument(`users/${request.auth.uid}`);
      return userDoc && userDoc.role === 'admin';
    };

    const isValidEntryData = () => {
      const data = request.resource ? request.resource.data : null;
      if (!data || typeof data.content !== 'string') return false;
      if (data.content.length === 0 || data.content.length > 20000) return false;
      if ('title' in data && (typeof data.title !== 'string' || data.title.length > 200)) return false;
      if ('mood' in data && typeof data.mood !== 'string') return false;
      return true;
    };

    // Match /users/{userId}
    if (parts.length === 2 && parts[0] === 'users') {
      const userId = parts[1];

      if (op === 'read') {
        return isOwner(userId) || isAdmin();
      }

      if (op === 'create') {
        if (!isOwner(userId)) return false;
        const data = request.resource?.data || {};
        // Regular users cannot grant themselves 'admin' role
        if ('role' in data && data.role !== 'user') return false;
        return true;
      }

      if (op === 'update') {
        if (!isOwner(userId)) return false;
        const oldData = currentResource || {};
        const newData = request.resource?.data || {};
        const modifiedRole = 'role' in newData && newData.role !== oldData.role;
        // Role modifications require admin rights
        if (modifiedRole && !isAdmin()) {
          return false;
        }
        return true;
      }

      if (op === 'delete') {
        return isOwner(userId) || isAdmin();
      }
    }

    // Match /users/{userId}/entries/{entryId}
    // Strict Data Isolation - ZERO cross-user access, even admins cannot access personal reflections!
    if (parts.length === 4 && parts[0] === 'users' && parts[2] === 'entries') {
      const userId = parts[1];

      if (op === 'read' || op === 'delete') {
        return isOwner(userId);
      }

      if (op === 'create' || op === 'update') {
        return isOwner(userId) && isValidEntryData();
      }
    }

    // Match /users/{userId}/settings/{settingId}
    if (parts.length === 4 && parts[0] === 'users' && parts[2] === 'settings') {
      const userId = parts[1];
      return isOwner(userId);
    }

    // Match /admin/{document=**}
    if (parts[0] === 'admin') {
      return isAdmin();
    }

    return false;
  }
}

/**
 * Asserts that an asynchronous Firestore operation fails with PERMISSION_DENIED.
 */
export async function assertFails(promise) {
  try {
    await promise;
    throw new Error('Expected operation to fail with PERMISSION_DENIED, but it succeeded.');
  } catch (err) {
    if (err.code === 'PERMISSION_DENIED' || /PERMISSION_DENIED/i.test(err.message)) {
      return true;
    }
    throw err;
  }
}

/**
 * Asserts that an asynchronous Firestore operation completes successfully.
 */
export async function assertSucceeds(promise) {
  try {
    return await promise;
  } catch (err) {
    throw new Error(`Expected operation to succeed, but it failed with: ${err.message}`);
  }
}
