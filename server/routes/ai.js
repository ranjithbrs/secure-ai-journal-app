import express from 'express';
import { verifyAuth } from '../middleware/auth.js';
import { chatWithCompanion } from '../services/gemini.js';

const router = express.Router();

router.post('/chat', verifyAuth, async (req, res) => {
  try {
    const { history, message } = req.body;
    const aiReply = await chatWithCompanion(history || [], message);
    res.json({ reply: aiReply });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
