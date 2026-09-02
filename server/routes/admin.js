import express from 'express';
import { db } from '../config/firebase.js';
import { verifyAuth } from '../middleware/auth.js';
import { verifyAdmin } from '../middleware/admin.js';

const router = express.Router();

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

export default router;
