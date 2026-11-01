let adminInstance = null;
let db = null;
let auth = null;

export async function initFirebaseAdmin() {
  if (!adminInstance) {
    try {
      const adminModule = await import('firebase-admin');
      adminInstance = adminModule.default;
      if (!adminInstance.apps.length) {
        adminInstance.initializeApp({
          credential: adminInstance.credential.applicationDefault()
        });
      }
      db = adminInstance.firestore();
      auth = adminInstance.auth();
      console.log('Firebase Admin SDK initialized successfully.');
    } catch (err) {
      console.warn('Firebase Admin SDK initialization deferred or mocked:', err.message);
    }
  }
  return { db, auth };
}

// Allow injecting mock auth or db for test isolation
export function setAuthMock(mockAuth) {
  auth = mockAuth;
}

export function setDbMock(mockDb) {
  db = mockDb;
}

export { db, auth };
