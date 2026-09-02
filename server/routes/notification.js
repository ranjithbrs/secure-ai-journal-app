import express from 'express';
import axios from 'axios';
import { verifyAuth } from '../middleware/auth.js';

const router = express.Router();

router.post('/dispatch', verifyAuth, async (req, res) => {
  try {
    const { channel, webhookUrl, email, message } = req.body;

    if (channel === 'slack' || channel === 'discord') {
      if (!webhookUrl) return res.status(400).json({ error: 'Webhook URL required' });
      await axios.post(webhookUrl, {
        text: `🧠 *MindReflect Journal Notification*\n${message}`
      });
      return res.json({ success: true, message: `Notification dispatched to ${channel}` });
    }

    res.json({ success: true, message: `Simulated notification sent to ${email || 'user'}` });
  } catch (err) {
    res.status(500).json({ error: 'Notification failed: ' + err.message });
  }
});

export default router;
