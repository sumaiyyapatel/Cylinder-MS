const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
}

// GET /api/users
router.get('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, fullName: true, role: true, isActive: true, lastLogin: true, createdAt: true },
      orderBy: { username: 'asc' },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users
router.post('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { username, fullName, password, role } = req.body;
    if (!username || !password || !fullName) {
      return res.status(400).json({ error: 'Username, full name and password required' });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { username: username.toLowerCase(), fullName, passwordHash: hash, role: role || 'VIEWER' },
    });
    res.status(201).json({ id: user.id, username: user.username, fullName: user.fullName, role: user.role });
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id
router.put('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const { fullName, role, isActive, password } = req.body;
    const data = {};
    if (fullName !== undefined) data.fullName = fullName;
    if (role !== undefined) data.role = role;
    if (isActive !== undefined) data.isActive = isActive;
    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) {
        return res.status(400).json({ error: passwordError });
      }
      data.passwordHash = await bcrypt.hash(password, 10);
    }
    
    const user = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data,
      select: { id: true, username: true, fullName: true, role: true, isActive: true },
    });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
