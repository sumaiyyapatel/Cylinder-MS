const express = require('express');
const { authenticate } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { streamBillPdf } = require('../services/pdfService');

const router = express.Router();

router.get('/:id/pdf', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || id <= 0) throw new AppError(400, 'Invalid bill id');
  const sent = await streamBillPdf(res, id);
  if (!sent) throw new AppError(404, 'Bill not found');
}));

module.exports = router;
