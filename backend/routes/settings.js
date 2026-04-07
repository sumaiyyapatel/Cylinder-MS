const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');

const router = express.Router();

// GET /api/settings
router.get('/', authenticate, async (req, res) => {
  try {
    const settings = await prisma.companySetting.findMany();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings
router.put('/', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await prisma.companySetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      });
    }
    res.json({ message: 'Settings updated' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/settings/gst-rates
router.get('/gst-rates', authenticate, async (req, res) => {
  try {
    const rates = await prisma.gstRate.findMany({ orderBy: { gstCode: 'asc' } });
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/settings/gst-rates
router.post('/gst-rates', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    const rate = await prisma.gstRate.create({ data: req.body });
    res.status(201).json(rate);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
