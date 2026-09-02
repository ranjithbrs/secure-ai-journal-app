import express from 'express';
import { db } from '../config/firebase.js';
import { verifyAuth } from '../middleware/auth.js';
import { analyzeJournalEntry } from '../services/gemini.js';

const router = express.Router();

// List all user journal entries (Private per-user)
router.get('/', verifyAuth, async (req, res) => {
  try {
    const snapshot = await db
      .collection('users')
      .doc(req.user.uid)
      .collection('entries')
      .orderBy('createdAt', 'desc')
      .get();

    const entries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create new entry + trigger Gemini AI enrichment
router.post('/', verifyAuth, async (req, res) => {
  try {
    const { title, content, location, mood } = req.body;
    
    // Perform Gemini Analysis
    const aiInsight = await analyzeJournalEntry(content, location?.name);

    const entryData = {
      title: title || 'Untitled Reflection',
      content,
      mood: mood || aiInsight.sentiment,
      location: location || null,
      aiInsight,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const docRef = await db
      .collection('users')
      .doc(req.user.uid)
      .collection('entries')
      .add(entryData);

    res.status(201).json({ id: docRef.id, ...entryData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete entry
router.delete('/:id', verifyAuth, async (req, res) => {
  try {
    await db
      .collection('users')
      .doc(req.user.uid)
      .collection('entries')
      .doc(req.params.id)
      .delete();
    res.json({ success: true, message: 'Entry deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
