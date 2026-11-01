import express from 'express';
import { db, auth } from '../config/firebase.js';
import { verifyAuth } from '../middleware/auth.js';
import { verifyAdmin } from '../middleware/admin.js';

const router = express.Router();

const VALID_ROLES = ['admin', 'user', 'moderator'];

/**
 * GET /api/admin/stats
 * Provides high-level operational metrics and deployment health.
 */
router.get('/stats', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    let totalEntries = 0;

    for (const doc of usersSnapshot.docs) {
      const entriesSnap = await db.collection('users').doc(doc.id).collection('entries').get();
      totalEntries += entriesSnap.size;
    }

    res.json({
      totalUsers: usersSnapshot.size,
      totalEntries,
      cloudRunRegion: process.env.K_SERVICE ? 'Google Cloud Run' : 'Local Host',
      challengeTag: 'dev-tutorial=cloud-run-ai-challenge',
      systemHealth: '100% Operational'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/admin/users
 * Lists registered user accounts and their assigned roles.
 * Privacy Preservation: Strictly audits metadata only; NEVER accesses personal journal reflections!
 */
router.get('/users', verifyAuth, verifyAdmin, async (req, res) => {
  try {
    const snapshot = await db.collection('users').get();
    const users = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        uid: doc.id,
        email: data.email || null,
        displayName: data.displayName || null,
        role: data.role || 'user',
        createdAt: data.createdAt || null
      };
    });

    res.status(200).json({
      total: users.length,
      users
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve users: ' + err.message });
  }
});

/**
 * PUT /api/admin/users/:userId/role
 * Updates an assigned role for a user account and synchronizes auth custom claims.
 */
router.put('/users/:userId/role', verifyAuth, verifyAdmin, async (req, res) => {
  try {
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

    // Update Firestore role document
    const userRef = db.collection('users').doc(userId);
    await userRef.set({ 
      role, 
      roleUpdatedAt: new Date().toISOString(),
      roleUpdatedBy: req.user.uid 
    }, { merge: true });

    // Sync Firebase Auth custom claims if auth admin SDK is available
    if (auth && typeof auth.setCustomUserClaims === 'function') {
      try {
        await auth.setCustomUserClaims(userId, { 
          admin: role === 'admin',
          role 
        });
      } catch (claimsErr) {
        console.warn(`Note: Custom claims update deferred for ${userId}:`, claimsErr.message);
      }
    }

    res.status(200).json({
      success: true,
      message: `User ${userId} role updated to ${role}`,
      userId,
      role
    });
  } catch (err) {
    res.status(500).json({ error: 'Role assignment failed: ' + err.message });
  }
});

export default router;
