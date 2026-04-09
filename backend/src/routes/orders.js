const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { status, customerId, page = 1, limit = 50 } = req.query;
    const where = {};
    if (status) where.status = status;
    if (customerId) where.customerId = parseInt(customerId);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [orders, total] = await Promise.all([
      prisma.order.findMany({ where, skip, take: parseInt(limit), orderBy: { orderDate: 'desc' } }),
      prisma.order.count({ where }),
    ]);
    res.json({ data: orders, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await prisma.order.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const order = await prisma.order.create({ data: req.body });
    res.status(201).json(order);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'Order number already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    const order = await prisma.order.update({ where: { id: parseInt(req.params.id) }, data: req.body });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    await prisma.order.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
