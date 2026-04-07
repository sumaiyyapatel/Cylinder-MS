const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const { customerId, page = 1, limit = 50 } = req.query;
    const where = {};
    if (customerId) where.customerId = parseInt(customerId);
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [challans, total] = await Promise.all([
      prisma.challan.findMany({
        where, skip, take: parseInt(limit),
        orderBy: { challanDate: 'desc' },
        include: { customer: { select: { id: true, code: true, name: true } } },
      }),
      prisma.challan.count({ where }),
    ]);
    res.json({ data: challans, total, page: parseInt(page), totalPages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), async (req, res) => {
  try {
    // Generate challan number
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = `CH/${year}/`;
    const last = await prisma.challan.findFirst({ where: { challanNumber: { startsWith: prefix } }, orderBy: { challanNumber: 'desc' } });
    let seq = 1;
    if (last) { const parts = last.challanNumber.split('/'); seq = parseInt(parts[2]) + 1; }
    const challanNumber = `${prefix}${seq.toString().padStart(5, '0')}`;

    const challan = await prisma.challan.create({
      data: {
        challanNumber,
        challanDate: req.body.challanDate ? new Date(req.body.challanDate) : new Date(),
        customerId: parseInt(req.body.customerId),
        cylinderOwner: req.body.cylinderOwner,
        cylindersCount: parseInt(req.body.cylindersCount) || 0,
        quantityCum: req.body.quantityCum ? parseFloat(req.body.quantityCum) : null,
        vehicleNumber: req.body.vehicleNumber,
        transactionType: req.body.transactionType || 'DELIVERY',
        operatorId: req.user.sub,
      },
    });
    res.status(201).json(challan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
