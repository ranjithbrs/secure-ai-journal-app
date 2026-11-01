import express from 'express';
import { db } from '../config/firebase.js';
import { verifyAuth } from '../middleware/auth.js';
import { analyzeJournalEntry } from '../services/gemini.js';

const router = express.Router();

const MAX_CONTENT_LENGTH = 20000;
const MAX_TITLE_LENGTH = 200;

// ==========================================
// List all user journal entries (Private per-user)
// Strict isolation: Scoped exclusively to req.user.uid
// ==========================================
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
    console.error('List entries error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve journal entries' });
  }
});

// ==========================================
// Get single journal entry
// Verifies ownership: 404 if not found or unauthorized
// ==========================================
router.get('/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid entry ID format' });
    }

    const docRef = db
      .collection('users')
      .doc(req.user.uid)
      .collection('entries')
      .doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error('Get entry error:', err.message);
    res.status(500).json({ error: 'Failed to fetch journal entry' });
  }
});

// ==========================================
// Create new entry + trigger Gemini AI enrichment
// Input sanitization & validation
// ==========================================
router.post('/', verifyAuth, async (req, res) => {
  try {
    const { title, content, location, mood } = req.body;

    // Strict Input Validation
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Journal entry content is required and cannot be empty' });
    }

    if (content.length > MAX_CONTENT_LENGTH) {
      return res.status(400).json({ error: `Content exceeds maximum allowed length of ${MAX_CONTENT_LENGTH} characters` });
    }

    const sanitizedTitle = typeof title === 'string' 
      ? title.trim().slice(0, MAX_TITLE_LENGTH) 
      : 'Untitled Reflection';

    const sanitizedLocation = location && typeof location.name === 'string'
      ? { name: location.name.trim().slice(0, 150) }
      : null;

    // Perform Gemini Analysis with graceful fallback & error handling
    const aiInsight = await analyzeJournalEntry(content, sanitizedLocation?.name);

    const entryData = {
      title: sanitizedTitle,
      content: content.trim(),
      mood: typeof mood === 'string' ? mood.slice(0, 50) : aiInsight.sentiment,
      location: sanitizedLocation,
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
    console.error('Create entry error:', err.message);
    res.status(500).json({ error: 'Failed to save journal entry' });
  }
});

// ==========================================
// Update an existing journal entry
// ==========================================
router.put('/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, location, mood } = req.body;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid entry ID format' });
    }

    const docRef = db
      .collection('users')
      .doc(req.user.uid)
      .collection('entries')
      .doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    const updates = { updatedAt: new Date().toISOString() };

    if (content !== undefined) {
      if (typeof content !== 'string' || content.trim().length === 0) {
        return res.status(400).json({ error: 'Content cannot be empty' });
      }
      if (content.length > MAX_CONTENT_LENGTH) {
        return res.status(400).json({ error: `Content exceeds maximum length` });
      }
      updates.content = content.trim();
      // Re-analyze when content changes
      updates.aiInsight = await analyzeJournalEntry(updates.content, location?.name);
    }

    if (title !== undefined) {
      updates.title = typeof title === 'string' ? title.trim().slice(0, MAX_TITLE_LENGTH) : 'Untitled Reflection';
    }

    if (location !== undefined) {
      updates.location = location && typeof location.name === 'string' ? { name: location.name.trim().slice(0, 150) } : null;
    }

    if (mood !== undefined) {
      updates.mood = typeof mood === 'string' ? mood.slice(0, 50) : 'reflective';
    }

    await docRef.update(updates);
    const updatedDoc = await docRef.get();

    res.json({ id: updatedDoc.id, ...updatedDoc.data() });
  } catch (err) {
    console.error('Update entry error:', err.message);
    res.status(500).json({ error: 'Failed to update journal entry' });
  }
});

// ==========================================
// Delete entry
// Scoped to owning user only
// ==========================================
router.delete('/:id', verifyAuth, async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Invalid entry ID format' });
    }

    const docRef = db
      .collection('users')
      .doc(req.user.uid)
      .collection('entries')
      .doc(id);

    const doc = await docRef.get();
    if (!doc.exists) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    await docRef.delete();
    res.json({ success: true, message: 'Entry successfully deleted' });
  } catch (err) {
    console.error('Delete entry error:', err.message);
    res.status(500).json({ error: 'Failed to delete journal entry' });
  }
});

export default router;
