const express = require('express');
const { authenticate } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { getOrGeneratePdf } = require('../services/invoiceService');
const path = require('path');

const router = express.Router();

router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid bill id' });
  const filePath = await getOrGeneratePdf(id);
  const abs = path.resolve(filePath);
  // If file is HTML fallback, send as HTML; otherwise send PDF
  if (abs.endsWith('.html')) {
    res.type('html').sendFile(abs);
  } else {
    res.type('application/pdf').sendFile(abs);
  }
}));

module.exports = router;
