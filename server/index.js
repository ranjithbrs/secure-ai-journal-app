import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initFirebaseAdmin } from './config/firebase.js';
import { getGeminiApiKey } from './config/secrets.js';
import journalRoutes from './routes/journal.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());
app.use(express.json());

// Initialize Services
initFirebaseAdmin();
await getGeminiApiKey();

// API Routes
app.use('/api/entries', journalRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Health check endpoint for Cloud Run automated verification
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    challengeLabel: 'dev-tutorial=cloud-run-ai-challenge'
  });
});

// Serve frontend static build in production
const distPath = path.join(__dirname, '../dist');
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
