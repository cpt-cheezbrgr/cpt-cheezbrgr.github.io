const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getUserByUsername, getUserByEmail, updateUser } = require('../services/firestore');
const { sendPasswordReset } = require('../services/email');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
};

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const user = await getUserByUsername(username);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, username: user.username, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, COOKIE_OPTS);
    res.json({ ok: true, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ user: { id: user.id, username: user.username, email: user.email } });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    const user = await getUserByEmail(email);
    // Always return success to prevent email enumeration
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await updateUser(user.id, { resetToken: token, resetTokenExpiry: expiry });
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      await sendPasswordReset(user.email, token, baseUrl);
    }
    res.json({ ok: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const user = await getUserByEmail(req.body.email || '').catch(() => null)
      || await findUserByResetToken(token);

    if (!user || !user.resetToken || user.resetToken !== token) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }
    const expiry = user.resetTokenExpiry?.toDate ? user.resetTokenExpiry.toDate() : new Date(user.resetTokenExpiry);
    if (expiry < new Date()) {
      return res.status(400).json({ error: 'Reset token has expired' });
    }

    const hash = await bcrypt.hash(password, 12);
    await updateUser(user.id, { passwordHash: hash, resetToken: null, resetTokenExpiry: null });
    res.json({ ok: true, message: 'Password updated. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

async function findUserByResetToken(token) {
  const { getUserByEmail: _, ...fs } = require('../services/firestore');
  const { Firestore } = require('@google-cloud/firestore');
  const db = new Firestore({ projectId: process.env.GCP_PROJECT_ID });
  const snap = await db.collection('users').where('resetToken', '==', token).limit(1).get();
  if (snap.empty) return null;
  return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

module.exports = router;
