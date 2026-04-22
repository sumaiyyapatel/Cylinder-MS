const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

function normalizeSettingsPayload(payload = {}) {
  const allowedKeys = new Set([
    'company_name',
    'company_gstin',
    'company_address',
    'company_city',
    'company_phone',
    'financial_year',
    'overdue_threshold_days',
  ]);

  const data = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!allowedKeys.has(key)) continue;
    const stringValue = value == null ? '' : String(value).trim();

    if (key === 'company_gstin' && stringValue && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(stringValue)) {
      throw new AppError(400, 'company_gstin must be a valid GSTIN');
    }

    if (key === 'company_phone' && stringValue && !/^\d{10}$/.test(stringValue.replace(/\D/g, ''))) {
      throw new AppError(400, 'company_phone must be 10 digits');
    }

    if (key === 'overdue_threshold_days' && stringValue) {
      const parsed = Number(stringValue);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        throw new AppError(400, 'overdue_threshold_days must be a positive integer');
      }
      data[key] = String(parsed);
      continue;
    }

    data[key] = key === 'company_gstin' ? stringValue.toUpperCase() : stringValue;
  }

  return data;
}

// GET /api/settings
router.get('/', authenticate, asyncHandler(async (req, res) => {
  const settings = await prisma.companySetting.findMany();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
}));

// PUT /api/settings
router.put('/', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const normalized = normalizeSettingsPayload(req.body);
  const entries = Object.entries(normalized);
  for (const [key, value] of entries) {
    await prisma.companySetting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }

  const settings = await prisma.companySetting.findMany();
  const obj = {};
  settings.forEach(s => { obj[s.key] = s.value; });
  res.json(obj);
}));

// GET /api/settings/gst-rates
router.get('/gst-rates', authenticate, asyncHandler(async (req, res) => {
  const rates = await prisma.gstRate.findMany({ orderBy: { gstCode: 'asc' } });
  res.json(rates);
}));

// POST /api/settings/gst-rates
router.post('/gst-rates', authenticate, authorize('ADMIN'), asyncHandler(async (req, res) => {
  const rate = await prisma.gstRate.create({ data: req.body });
  res.status(201).json(rate);
}));

module.exports = router;
