const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { gasCode, ownerCode } = req.query;
    const where = {};
    if (gasCode) where.gasCode = gasCode;
    if (ownerCode) where.ownerCode = ownerCode;
    const rates = await prisma.rateList.findMany({ where, include: { gasType: true }, orderBy: { gasCode: 'asc' } });
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const rate = await prisma.rateList.create({ data: req.body });
    res.status(201).json(rate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER'), async (req, res) => {
  try {
    const rate = await prisma.rateList.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.json(rate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.rateList.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Rate deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
