const express = require('express');
const bcrypt = require('bcryptjs');
const { Prisma } = require('@prisma/client');
const prisma = require('../lib/prisma');
const { createAccessToken, authenticate } = require('../lib/auth');

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await prisma.user.findUnique({ where: { username: username.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    // Check lockout
    if (user.lockedUntil && new Date() < new Date(user.lockedUntil)) {
      const mins = Math.ceil((new Date(user.lockedUntil) - new Date()) / 60000);
      return res.status(429).json({ error: `Account locked. Try again in ${mins} minutes.` });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const attempts = user.failedAttempts + 1;
      const update = { failedAttempts: attempts };
      if (attempts >= 3) {
        update.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 min lockout
      }
      await prisma.user.update({ where: { id: user.id }, data: update });
      const remaining = 3 - attempts;
      if (remaining > 0) {
        return res.status(401).json({ error: `Invalid credentials. ${remaining} attempts remaining.` });
      }
      return res.status(429).json({ error: 'Account locked for 15 minutes due to too many failed attempts.' });
    }

    // Success - reset failed attempts
    await prisma.user.update({
      where: { id: user.id },
      data: { failedAttempts: 0, lockedUntil: null, lastLogin: new Date() },
    });

    const token = createAccessToken(user.id, user.username, user.role);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('Login error:', err);

    if (err instanceof Prisma.PrismaClientInitializationError) {
      return res.status(503).json({
        error: 'Database unavailable. Please ensure PostgreSQL is running and DATABASE_URL is correct.',
      });
    }

    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.sub },
      select: { id: true, username: true, fullName: true, role: true, isActive: true, lastLogin: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
