const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const areas = await prisma.area.findMany({ orderBy: { areaCode: 'asc' } });
    res.json(areas);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const area = await prisma.area.create({ data: req.body });
    res.status(201).json(area);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Area code already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const area = await prisma.area.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.json(area);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.area.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Area deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
