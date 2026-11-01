import { db } from '../config/firebase.js';

/**
 * Role-Based Access Control (RBAC) Middleware:
 * Verifies that the authenticated user possesses administrative privileges.
 * Checks both Firebase Auth Custom Claims (fast-path) and Firestore role document.
 */
export async function verifyAdmin(req, res, next) {
  if (!req.user || !req.user.uid) {
    return res.status(401).json({ error: 'Unauthorized: User authentication required' });
  }

  try {
    // 1. Fast-path: Check Firebase Custom Claims on ID Token
    if (req.user.admin === true || req.user.claims?.role === 'admin') {
      return next();
    }

    // 2. Database verification: Check Firestore users/{uid} role field
    const uid = req.user.uid;
    const userDoc = await db.collection('users').doc(uid).get();

    if (userDoc.exists && userDoc.data().role === 'admin') {
      return next();
    }

    // User is authenticated, but lacks admin privileges -> 403 Forbidden
    return res.status(403).json({ 
      error: 'Forbidden', 
      message: 'Access restricted: Administrative privileges required' 
    });
  } catch (err) {
    console.error('Admin authorization verification error:', err.message);
    return res.status(500).json({ error: 'Internal Server Error during permission audit' });
  }
}
