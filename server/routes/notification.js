import express from 'express';
import axios from 'axios';
import { verifyAuth } from '../middleware/auth.js';
import { processNotificationDispatch } from '../utils/webhookValidator.js';

const router = express.Router();

router.post('/dispatch', verifyAuth, async (req, res) => {
  const result = await processNotificationDispatch(req.body, async (url, payload, options) => {
    return axios.post(url, payload, options);
  });
  return res.status(result.status).json(result.body);
});

export default router;
