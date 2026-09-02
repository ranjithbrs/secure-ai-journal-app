import { db } from '../config/firebase.js';

export async function verifyAdmin(req, res, next) {
  try {
    const uid = req.user.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (userDoc.exists && userDoc.data().role === 'admin') {
      return next();
    }
    
    if (req.user.admin === true) {
      return next();
    }

    res.status(403).json({ error: 'Forbidden: Requires Admin Role' });
  } catch (err) {
    res.status(500).json({ error: 'Admin check failed: ' + err.message });
  }
}
