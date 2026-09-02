import admin from 'firebase-admin';

let db;
let auth;

export function initFirebaseAdmin() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault()
    });
  }
  db = admin.firestore();
  auth = admin.auth();
  console.log('Firebase Admin SDK initialized successfully.');
}

export { db, auth };
