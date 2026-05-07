const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate, authorize } = require('../lib/auth');
const asyncHandler = require('../middleware/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { getGstMode, calculateGstBreakup } = require('../services/businessRules');
const { createSerializedIssueBill } = require('../services/billingService');
const { generateBillPdfFile } = require('../services/pdfService');
const { generateBillNumber } = require('../services/numberingService');
const whatsappService = require('../services/whatsappService');
const { parseDateRange } = require('../lib/validation');

const router = express.Router();

async function buildBillResponse(tx, bill, { salesBookEntry: salesBookEntryIn, companyGstin: companyGstinIn } = {}) {
  const salesBookEntry = salesBookEntryIn === undefined
    ? await tx.salesBook.findFirst({
        where: { billNumber: bill.billNumber },
        select: { billNumber: true, subtotal: true, gstAmount: true, totalAmount: true, gstCode: true, rate: true },
      })
    : salesBookEntryIn;

  const companyGstin = companyGstinIn === undefined
    ? (await tx.companySetting.findUnique({
        where: { key: 'company_gstin' },
        select: { value: true },
      }))?.value
    : companyGstinIn;

  const gstBreakup = salesBookEntry
    ? calculateGstBreakup(
        parseFloat(salesBookEntry.subtotal || 0),
        salesBookEntry.gstCode ? parseInt(salesBookEntry.gstCode.replace(/^[IS]/, ''), 10) : 0,
        bill.gstMode || getGstMode(companyGstin, bill.customer?.gstin)
      )
    : null;

  return {
    ...bill,
    salesBook: salesBookEntry,
    gstBreakup,
    companyGstin,
    hsnCode: bill.items?.[0]?.hsnCode || bill.items?.[0]?.cylinder?.gasType?.hsnCode || null,
  };
}

router.get('/', authenticate, asyncHandler(async (req, res) => {
  const { customerId, gasCode, dateFrom, dateTo, page = 1, limit = 50 } = req.query;

  const where = {};
  if (customerId && !isNaN(parseInt(customerId, 10))) where.customerId = parseInt(customerId, 10);
  if (gasCode) where.gasCode = gasCode;
  Object.assign(where, parseDateRange(dateFrom, dateTo, 'billDate'));

  const parsedPage = parseInt(page, 10);
  const parsedLimit = parseInt(limit, 10);
  const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
  const skip = (safePage - 1) * safeLimit;

  const [bills, total] = await Promise.all([
    prisma.bill.findMany({
      where,
      skip,
      take: safeLimit,
      orderBy: [{ billDate: 'desc' }, { id: 'desc' }],
      include: {
        customer: {
          select: {
            id: true,
            code: true,
            name: true,
            phone: true,
            gstin: true,
            address1: true,
            city: true,
          },
        },
        items: {
          orderBy: [{ id: 'asc' }],
          include: {
            bill: { select: { id: true } },
            cylinder: {
              select: {
                gasCode: true,
                gasType: { select: { hsnCode: true, gstRate: true } },
              },
            },
          },
        },
      },
    }),
    prisma.bill.count({ where }),
  ]);

  const billNumbers = bills.map((bill) => bill.billNumber).filter(Boolean);
  const [salesBookEntries, companyGstinSetting] = await Promise.all([
    billNumbers.length
      ? prisma.salesBook.findMany({
          where: { billNumber: { in: billNumbers } },
          select: { billNumber: true, subtotal: true, gstAmount: true, totalAmount: true, gstCode: true, rate: true },
        })
      : Promise.resolve([]),
    prisma.companySetting.findUnique({
      where: { key: 'company_gstin' },
      select: { value: true },
    }),
  ]);

  const salesBookByBillNumber = new Map(salesBookEntries.map((entry) => [entry.billNumber, entry]));
  const companyGstin = companyGstinSetting?.value ?? null;
  const enrichedBills = await Promise.all(
    bills.map((bill) =>
      buildBillResponse(prisma, bill, {
        salesBookEntry: salesBookByBillNumber.get(bill.billNumber) ?? null,
        companyGstin,
      })
    )
  );

  res.json({
    data: enrichedBills,
    total,
    page: safePage,
    totalPages: Math.ceil(total / safeLimit),
  });
}));

router.post('/', authenticate, authorize('ADMIN', 'MANAGER', 'OPERATOR'), asyncHandler(async (req, res) => {
  const { createdBill, warnings } = await createSerializedIssueBill(prisma, req.body, {
    operatorId: req.user.sub,
  });

  const responseBill = await buildBillResponse(prisma, createdBill);
  res.status(201).json({
    message: 'Bill created',
    warnings,
    bill: responseBill,
  });

  (async () => {
    try {
      await generateBillPdfFile(createdBill.id, { userId: req.user.sub });
      const pdfUrl = `${req.protocol}://${req.get('host')}/api/bills/${createdBill.id}/pdf`;
      const sent = await whatsappService.sendBillNotification(createdBill.customerId, createdBill.billNumber, pdfUrl);
      if (sent) {
        await prisma.bill.update({ where: { id: createdBill.id }, data: { whatsappSent: true } });
      }
    } catch (err) {
      console.error('Post-bill notification failed:', err.message || err);
    }
  })();
}));

router.patch('/:id/whatsapp-sent', authenticate, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) throw new AppError(400, 'Invalid bill id');

  const bill = await prisma.bill.update({
    where: { id },
    data: { whatsappSent: true },
  });

  res.json({ message: 'WhatsApp marked sent', bill });
}));

router.get('/next-bill-number', authenticate, asyncHandler(async (req, res) => {
  const { ownerCode = 'COC' } = req.query;
  const billNumber = await generateBillNumber(prisma, ownerCode);
  res.json({ billNumber });
}));

module.exports = router;
