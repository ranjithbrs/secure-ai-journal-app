import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { initFirebaseAdmin } from './config/firebase.js';
import { getGeminiApiKey } from './config/secrets.js';
import { corsOptions } from './config/cors.js';
import journalRoutes from './routes/journal.js';
import aiRoutes from './routes/ai.js';
import adminRoutes from './routes/admin.js';
import notificationRoutes from './routes/notification.js';
import userRoutes from './routes/user.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

// Security: Disable X-Powered-By to prevent technology fingerprinting
app.disable('x-powered-by');

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Explicit CORS Configuration: Zero wildcard default
app.use(cors(corsOptions));

// Body parser with strict payload size limit (mitigates DoS memory exhaustion)
app.use(express.json({ limit: '100kb' }));

// Initialize Services
initFirebaseAdmin();
await getGeminiApiKey();

// API Routes
app.use('/api/entries', journalRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/user', userRoutes);

// Health check endpoint for Cloud Run automated verification & probes
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

// Centralized Error Handling Middleware (prevents stack trace leaks)
app.use((err, req, res, next) => {
  if (err.message && err.message.includes('CORS policy violation')) {
    return res.status(403).json({
      error: 'Forbidden',
      message: err.message
    });
  }

  console.error('Unhandled Server Error:', err.message);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred. Please try again later.' 
      : err.message
  });
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
