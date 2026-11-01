import { auth } from '../config/firebase.js';

/**
 * Authentication Middleware:
 * Validates Firebase ID Tokens passed via Authorization: Bearer <token>
 * Attaches decoded user identity (uid, email, custom claims) to req.user
 */
export async function verifyAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || typeof authHeader !== 'string') {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Missing Authorization header. Expected Bearer <token>' 
    });
  }

  const parts = authHeader.trim().split(/\s+/);
  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Malformed Authorization header format. Expected Bearer <token>' 
    });
  }

  const idToken = parts[1];
  if (!idToken || idToken.length < 20) {
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid token structure' 
    });
  }

  try {
    // Verify cryptographic signature, expiration, and issuer
    const decodedToken = await auth.verifyIdToken(idToken);
    
    // Attach sanitized user context
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      emailVerified: decodedToken.email_verified || false,
      admin: Boolean(decodedToken.admin),
      authTime: decodedToken.auth_time,
      claims: decodedToken
    };

    next();
  } catch (err) {
    // Specific error mapping for debugging and client clarity
    if (err.code === 'auth/id-token-expired') {
      return res.status(401).json({ 
        error: 'TokenExpired', 
        message: 'Firebase ID token has expired. Please refresh your session.' 
      });
    }

    if (err.code === 'auth/id-token-revoked') {
      return res.status(401).json({ 
        error: 'TokenRevoked', 
        message: 'Token has been revoked. Please sign in again.' 
      });
    }

    console.error('Token verification failure:', err.message);
    return res.status(401).json({ 
      error: 'Unauthorized', 
      message: 'Invalid or forged authentication token' 
    });
  }
}
