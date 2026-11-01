import express from 'express';
import { db } from '../config/firebase.js';
import { verifyAuth } from '../middleware/auth.js';

const router = express.Router();

// Permitted profile update fields (privilege escalation defense)
const ALLOWED_PROFILE_FIELDS = ['displayName', 'bio', 'location', 'themePreference'];

/**
 * GET /api/user/profile
 * Retrieves the authenticated user's profile document.
 */
router.get('/profile', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.status(200).json({
        uid,
        email: req.user.email,
        role: req.user.admin ? 'admin' : 'user',
        isNewUser: true
      });
    }

    const data = userDoc.data();
    return res.status(200).json({
      uid,
      email: data.email || req.user.email,
      displayName: data.displayName || null,
      bio: data.bio || null,
      role: data.role || 'user',
      createdAt: data.createdAt || null
    });
  } catch (err) {
    console.error('Fetch profile error:', err.message);
    return res.status(500).json({ error: 'Failed to retrieve user profile' });
  }
});

/**
 * PUT /api/user/profile
 * Updates the authenticated user's profile.
 * Privilege Escalation Defense: Strictly forbids regular users from changing their 'role' to 'admin'.
 */
router.put('/profile', verifyAuth, async (req, res) => {
  try {
    const uid = req.user.uid;
    const body = req.body || {};

    // Block explicit privilege escalation attempts
    if ('role' in body && body.role !== 'user' && !req.user.admin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Privilege escalation rejected: Regular users cannot modify role permissions.'
      });
    }

    // Filter updates to allowed profile fields only
    const updates = {};
    for (const key of ALLOWED_PROFILE_FIELDS) {
      if (key in body && typeof body[key] === 'string') {
        // Enforce reasonable length limits
        updates[key] = body[key].slice(0, 500);
      }
    }

    updates.updatedAt = new Date().toISOString();

    const userRef = db.collection('users').doc(uid);
    await userRef.set(updates, { merge: true });

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      updatedFields: Object.keys(updates)
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    return res.status(500).json({ error: 'Failed to update user profile' });
  }
});

export default router;
