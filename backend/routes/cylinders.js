const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

// GET /api/cylinders
router.get('/', authenticate, async (req, res) => {
  try {
    const { status, gasCode, ownerCode, search, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (gasCode) where.gasCode = gasCode;
    if (ownerCode) where.ownerCode = ownerCode;
    if (search) {
      where.OR = [
        { cylinderNumber: { contains: search, mode: 'insensitive' } },
        { particular: { contains: search, mode: 'insensitive' } },
      ];
    }
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [cylinders, total] = await Promise.all([
      prisma.cylinder.findMany({ where, skip, take: parseInt(limit), orderBy: { cylinderNumber: 'asc' }, include: { gasType: true } }),
      prisma.cylinder.count({ where }),
    ]);
    res.json({ data: cylinders, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/cylinders/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const cylinder = await prisma.cylinder.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { gasType: true, holdings: { include: { customer: true }, orderBy: { issuedAt: 'desc' }, take: 20 } },
    });
    if (!cylinder) return res.status(404).json({ error: 'Cylinder not found' });
    res.json(cylinder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/cylinders
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const cylinder = await prisma.cylinder.create({ data: req.body });
    res.status(201).json(cylinder);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Cylinder number already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/cylinders/:id
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const cylinder = await prisma.cylinder.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.json(cylinder);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/cylinders/:id
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.cylinder.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Cylinder deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
