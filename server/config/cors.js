/**
 * Production-Grade CORS Configuration
 * Enforces explicit allowed origins, removes permissive wildcards,
 * and restricts development localhost origins strictly to non-production environments.
 */

export const EXPLICIT_PRODUCTION_ORIGINS = [
  'https://secure-ai-journal-app-br3843311-7472s-projects.vercel.app',
  'https://mindreflect-ai-journal-571017174215.us-central1.run.app'
];

export const DEVELOPMENT_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173'
];

/**
 * Validates whether an incoming HTTP request origin is authorized.
 * Zero wildcard fallback: Disallows '*' across all environments.
 *
 * @param {string|null|undefined} origin - Incoming Origin header value.
 * @param {string} [env] - Environment string (e.g. 'production', 'development', 'test').
 * @param {string} [allowedOriginsEnv] - Comma-delimited list of custom allowed origins.
 * @returns {boolean} Whether the origin is permitted.
 */
export function isOriginAllowed(
  origin, 
  env = process.env.NODE_ENV, 
  allowedOriginsEnv = process.env.ALLOWED_ORIGINS
) {
  // Allow requests without Origin header (same-origin, server-to-server, curl, mobile native)
  if (!origin) {
    return true;
  }

  // Strictly disallow wildcard string '*' as an origin
  if (origin === '*') {
    return false;
  }

  // 1. Explicit production origins
  if (EXPLICIT_PRODUCTION_ORIGINS.includes(origin)) {
    return true;
  }

  // 2. Custom environment-configured origins (comma-delimited)
  if (allowedOriginsEnv) {
    const configuredOrigins = allowedOriginsEnv
      .split(',')
      .map(o => o.trim())
      .filter(o => o.length > 0 && o !== '*'); // Reject wildcard '*' in config

    if (configuredOrigins.includes(origin)) {
      return true;
    }
  }

  // 3. Vercel deployment preview pattern (matches secure-ai-journal-app-*-br3843311-7472s-projects.vercel.app)
  const vercelPreviewRegex = /^https:\/\/secure-ai-journal-app-[a-z0-9-]+-br3843311-7472s-projects\.vercel\.app$/;
  if (vercelPreviewRegex.test(origin)) {
    return true;
  }

  // 4. Google Cloud Run service domain pattern
  const cloudRunRegex = /^https:\/\/mindreflect-ai-journal-[a-z0-9-]+-uc\.a\.run\.app$/;
  if (cloudRunRegex.test(origin)) {
    return true;
  }

  // 5. Local development origins (STRICTLY allowed only when NOT in production)
  if (env !== 'production' && DEVELOPMENT_ORIGINS.includes(origin)) {
    return true;
  }

  // Deny all other origins (No wildcard fallback)
  return false;
}

export const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`CORS policy violation: Origin '${origin}' is not authorized.`));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  maxAge: 86400 // Cache preflight response for 24 hours
};
