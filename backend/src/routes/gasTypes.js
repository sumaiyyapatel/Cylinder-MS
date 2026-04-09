const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

// GET /api/gas-types
router.get('/', authenticate, async (req, res) => {
  try {
    const gasTypes = await prisma.gasType.findMany({ orderBy: { gasCode: 'asc' } });
    res.json(gasTypes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/gas-types
router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const gasType = await prisma.gasType.create({ data: req.body });
    res.status(201).json(gasType);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Gas code already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/gas-types/:id
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const gasType = await prisma.gasType.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.json(gasType);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/gas-types/:id
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.gasType.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Gas type deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
