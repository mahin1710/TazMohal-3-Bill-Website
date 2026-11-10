// server/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, logAudit } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'tazmohal3_secure_property_billing_token_secret_2026';
const TOKEN_EXPIRY = '7d';

// Simple in-memory rate limiter for login
const loginAttempts = new Map();
function rateLimitLogin(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip) || { count: 0, resetTime: now + 60000 };

  if (now > record.resetTime) {
    record.count = 1;
    record.resetTime = now + 60000;
  } else {
    record.count++;
  }
  loginAttempts.set(ip, record);

  if (record.count > 10) {
    return res.status(429).json({ error: 'Too many login attempts. Please wait 1 minute.' });
  }
  next();
}

// Authentication middleware
function requireAuth(req, res, next) {
  let token = null;

  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
}

// Optional Auth (for read or public viewing mode if desired, but user object is attached if present)
function optionalAuth(req, res, next) {
  let token = null;
  if (req.cookies && req.cookies.auth_token) {
    token = req.cookies.auth_token;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (e) {
      // Ignored for optional auth
    }
  }
  next();
}

// POST /api/auth/login
router.post('/login', rateLimitLogin, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) {
    logAudit('LOGIN_FAILED', `Failed login attempt for user: ${username}`, username);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  res.cookie('auth_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  logAudit('LOGIN_SUCCESS', `User ${user.username} logged in successfully`, user.username);

  res.json({
    message: 'Login successful',
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('auth_token');
  res.json({ message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/change-password
router.post('/change-password', requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new passwords are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters long' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(400).json({ error: 'Incorrect current password' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

  logAudit('PASSWORD_CHANGE', `User ${user.username} updated password`, user.username);
  res.json({ message: 'Password updated successfully' });
});

module.exports = {
  router,
  requireAuth,
  optionalAuth
};
