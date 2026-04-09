const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

// GET /api/customers
router.get('/', authenticate, async (req, res) => {
  try {
    const { search, city, areaCode, page = 1, limit = 50 } = req.query;
    const where = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (city) where.city = { contains: city, mode: 'insensitive' };
    if (areaCode) where.areaCode = areaCode;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [customers, total] = await Promise.all([
      prisma.customer.findMany({ where, skip, take: parseInt(limit), orderBy: { code: 'asc' }, include: { area: true } }),
      prisma.customer.count({ where }),
    ]);
    res.json({ data: customers, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { area: true, holdings: { where: { status: 'HOLDING' }, include: { cylinder: true } } },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/customers
router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const customer = await prisma.customer.create({ data: req.body });
    res.status(201).json(customer);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Customer code already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/customers/:id
router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const customer = await prisma.customer.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/customers/:id
router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.customer.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
