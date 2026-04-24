const express = require('express');
const prisma = require('../lib/prisma');
const { authenticate } = require('../lib/auth');
const { runReconciliation, validateHoldingRents, findOrphanedHoldings, auditBillToEcrMatching } = require('../services/reconciliationService');
const { createAuditLog } = require('../services/auditService');
const { sendReportPdf, formatAmount, formatDate } = require('../services/reportPdfService');
const {
  getAgeAnalysisOutstandingReport,
  getBookReport,
  getCustomerStatementReport,
  getCylinderRotationReport,
  getDailyReport,
  getHoldingStatementReport,
  getIssueWithoutPurchaseReport,
  getOutstandingReport,
  getPartyRentalReport,
  getReconciliationReport,
  getSaleReturnReport,
  getSaleReturnSummaryReport,
  getSaleTransactionsReport,
  getSalesSummaryReport,
  getTrialBalanceReport,
} = require('../services/reportQueryService');

const router = express.Router();

function extractCount(countValue) {
  if (typeof countValue === 'number') return countValue;
  if (countValue && typeof countValue._all === 'number') return countValue._all;
  return 0;
}

async function buildReportPdfPayload(type, query) {
  switch (type) {
    case 'holding': {
      const data = await getHoldingStatementReport(prisma, query);
      return {
        title: 'Holding Statement',
        subtitle: query.filter === 'overdue' ? 'Overdue cylinders only' : 'Active cylinder holdings',
        fileName: 'holding-statement',
        layout: 'landscape',
        sections: data.map((group) => ({
          title: `${group.customerCode} - ${group.customerName}`,
          headers: ['Cylinder', 'Gas', 'Owner', 'Issued', 'Bill No', 'Hold Days'],
          rows: group.cylinders.map((item) => [
            item.cylinderNumber || '-',
            item.gasCode || '-',
            item.ownerCode || '-',
            formatDate(item.issuedAt),
            item.billNumber || '-',
            item.holdDays ?? '-',
          ]),
        })),
      };
    }
    case 'daily': {
      const data = await getDailyReport(prisma, query);
      return {
        title: 'Daily Report',
        subtitle: `Date: ${formatDate(data.date)}`,
        fileName: `daily-report-${formatDate(data.date).replace(/\//g, '-')}`,
        sections: [
          {
            title: 'Issues',
            headers: ['Bill No', 'Customer', 'Cylinder', 'Gas', 'Quantity'],
            rows: data.issues.map((item) => [
              item.billNumber || '-',
              item.customer?.name || '-',
              item.cylinderNumber || '-',
              item.gasCode || '-',
              item.quantityCum ?? '-',
            ]),
          },
          {
            title: 'Returns',
            headers: ['ECR No', 'Customer', 'Cylinder', 'Hold Days', 'Rent'],
            rows: data.returns.map((item) => [
              item.ecrNumber || '-',
              item.customer?.name || '-',
              item.cylinderNumber || '-',
              item.holdDays ?? '-',
              formatAmount(item.rentAmount || 0),
            ]),
          },
        ],
      };
    }
    case 'customer-stmt': {
      const data = await getCustomerStatementReport(prisma, query);
      return {
        title: 'Customer Statement',
        subtitle: `${data.customer?.code || '-'} - ${data.customer?.name || '-'}`,
        fileName: `customer-statement-${data.customer?.code || 'report'}`,
        sections: [
          {
            title: 'Issues',
            headers: ['Bill No', 'Date', 'Cylinder', 'Gas', 'Quantity'],
            rows: data.issues.map((item) => [
              item.billNumber || '-',
              formatDate(item.billDate),
              item.cylinderNumber || '-',
              item.gasCode || '-',
              item.quantityCum ?? '-',
            ]),
          },
          {
            title: 'Returns',
            headers: ['ECR No', 'Date', 'Cylinder', 'Hold Days', 'Rent'],
            rows: data.returns.map((item) => [
              item.ecrNumber || '-',
              formatDate(item.ecrDate),
              item.cylinderNumber || '-',
              item.holdDays ?? '-',
              formatAmount(item.rentAmount || 0),
            ]),
          },
        ],
      };
    }
    case 'trial-balance': {
      const data = await getTrialBalanceReport(prisma, query);
      return {
        title: 'Trial Balance',
        subtitle: 'Grouped by party code',
        fileName: 'trial-balance',
        sections: [
          {
            title: 'Balances',
            headers: ['Party Code', 'Party Name', 'Debit', 'Credit', 'Balance'],
            rows: data.map((item) => [
              item.partyCode || '-',
              item.partyName || '-',
              formatAmount(item.debit || 0),
              formatAmount(item.credit || 0),
              `${formatAmount(Math.abs(item.balance || 0))} ${item.balance > 0 ? 'Dr' : 'Cr'}`,
            ]),
          },
        ],
      };
    }
    case 'cylinder-rotation': {
      const data = await getCylinderRotationReport(prisma, query);
      return {
        title: 'Cylinder Rotation',
        subtitle: 'Cylinder lifecycle history',
        fileName: 'cylinder-rotation',
        layout: 'landscape',
        sections: data.map((group) => ({
          title: `${group.cylinderNumber} (${group.currentStatus || '-'})`,
          headers: ['Customer', 'Bill No', 'Issued', 'Returned', 'Days Held', 'Status'],
          rows: group.history.map((item) => [
            `${item.customerCode || '-'} - ${item.customerName || '-'}`,
            item.billNumber || '-',
            formatDate(item.issuedAt),
            item.returnedAt ? formatDate(item.returnedAt) : '-',
            item.holdDays ?? '-',
            item.status || '-',
          ]),
        })),
      };
    }
    case 'sale-txn': {
      const data = await getSaleTransactionsReport(prisma, query);
      return {
        title: 'Sale Transactions',
        subtitle: 'Filtered transaction detail',
        fileName: 'sale-transactions',
        layout: 'landscape',
        sections: [
          {
            title: 'Transactions',
            headers: ['Bill No', 'Date', 'Customer', 'Cylinder', 'Gas', 'Quantity'],
            rows: data.map((item) => [
              item.billNumber || '-',
              formatDate(item.billDate),
              item.customer?.name || '-',
              item.cylinderNumber || '-',
              item.gasCode || '-',
              item.quantityCum ?? '-',
            ]),
          },
        ],
      };
    }
    case 'outstanding': {
      const data = await getOutstandingReport(prisma);
      return {
        title: 'Outstanding Payments',
        subtitle: 'Receivable and payable balances',
        fileName: 'outstanding-payments',
        sections: [
          {
            title: 'Outstanding',
            headers: ['Party', 'Debit', 'Credit', 'Balance', 'Type'],
            rows: data.map((item) => [
              `${item.partyCode || '-'} - ${item.partyName || '-'}`,
              formatAmount(item.debit || 0),
              formatAmount(item.credit || 0),
              `${formatAmount(Math.abs(item.balance || 0))} ${item.balance > 0 ? 'Dr' : 'Cr'}`,
              item.type || '-',
            ]),
          },
        ],
      };
    }
    case 'sales-summary': {
      const data = await getSalesSummaryReport(prisma, query);
      return {
        title: 'Sales Summary',
        subtitle: 'Grouped by gas and customer',
        fileName: 'sales-summary',
        sections: [
          {
            title: 'By Gas',
            headers: ['Gas', 'Bills', 'Total Cu.M'],
            rows: data.byGas.map((item) => [item.gasCode || '-', item.count, item.totalCum ?? 0]),
          },
          {
            title: 'By Customer',
            headers: ['Customer', 'Bills', 'Total Cu.M'],
            rows: data.byCustomer.map((item) => [`${item?.code || '-'} - ${item?.name || '-'}`, item.count, item.totalCum ?? 0]),
          },
        ],
      };
    }
    case 'party-rental': {
      const data = await getPartyRentalReport(prisma, query);
      return {
        title: 'Party Wise Rental',
        subtitle: 'Rental dues grouped by customer',
        fileName: 'party-rental',
        sections: [
          {
            title: 'Rental Summary',
            headers: ['Party', 'Returned Cylinders', 'Total Days', 'Total Rent'],
            rows: data.map((item) => [
              `${item.partyCode || '-'} - ${item.partyName || '-'}`,
              item.count || 0,
              item.totalDays || 0,
              formatAmount(item.totalRent || 0),
            ]),
          },
        ],
      };
    }
    case 'cash-book':
    case 'bank-book':
    case 'journal-book': {
      const selected =
        type === 'cash-book'
          ? {
              title: 'Cash Book',
              data: await getBookReport(prisma, query, ['CASH_RECEIPT', 'CASH_PAYMENT']),
            }
          : type === 'bank-book'
            ? {
                title: 'Bank Book',
                data: await getBookReport(prisma, query, ['BANK_RECEIPT', 'BANK_PAYMENT']),
              }
            : {
                title: 'Journal Book',
                data: await getBookReport(prisma, query, ['JOURNAL', 'CONTRA', 'DEBIT_NOTE', 'CREDIT_NOTE']),
              };
      return {
        title: selected.title,
        subtitle: 'Ledger movement',
        fileName: type,
        layout: 'landscape',
        sections: [
          {
            title: selected.title,
            headers: type === 'journal-book'
              ? ['Voucher No', 'Date', 'Party', 'Type', 'Particular', 'Debit', 'Credit']
              : ['Voucher No', 'Date', 'Party', 'Particular', 'Debit', 'Credit', 'Running Balance'],
            rows: selected.data.map((item) =>
              type === 'journal-book'
                ? [
                    item.voucherNumber || '-',
                    formatDate(item.voucherDate),
                    item.customer?.name || item.partyCode || '-',
                    (item.transactionType || '-').replace(/_/g, ' '),
                    item.particular || '-',
                    item.debitAmount ? formatAmount(item.debitAmount) : '-',
                    item.creditAmount ? formatAmount(item.creditAmount) : '-',
                  ]
                : [
                    item.voucherNumber || '-',
                    formatDate(item.voucherDate),
                    item.customer?.name || item.partyCode || '-',
                    item.particular || '-',
                    item.debitAmount ? formatAmount(item.debitAmount) : '-',
                    item.creditAmount ? formatAmount(item.creditAmount) : '-',
                    formatAmount(item.runningBalance || 0),
                  ]
            ),
          },
        ],
      };
    }
    case 'reconciliation': {
      const data = await getReconciliationReport(prisma, query);
      return {
        title: 'Reconciliation',
        subtitle: 'Holding parity checks',
        fileName: 'reconciliation',
        layout: 'landscape',
        sections: [
          {
            title: 'Mismatches',
            headers: ['Customer', 'Gas', 'Owner', 'Issued', 'Returned', 'Balance', 'Holdings', 'Delta'],
            rows: (data.mismatches || []).map((item) => [
              `${item.customerCode} - ${item.customerName}`,
              item.gasCode || '-',
              item.ownerCode || '-',
              item.issued,
              item.returned,
              item.balance,
              item.activeHoldings,
              item.delta,
            ]),
          },
          {
            title: 'Missing ECR',
            headers: ['Customer', 'Cylinder', 'Issued', 'Returned'],
            rows: (data.missingEcr || []).map((item) => [
              item.customerCode || '-',
              item.cylinderNumber || '-',
              formatDate(item.issuedAt),
              item.returnedAt ? formatDate(item.returnedAt) : '-',
            ]),
          },
          {
            title: 'Duplicate Issues',
            headers: ['Cylinder', 'Active Holdings', 'Customers'],
            rows: (data.duplicateIssues || []).map((item) => [
              item.cylinderNumber || '-',
              item.count || 0,
              item.records?.map((record) => record.customerCode).join(', ') || '-',
            ]),
          },
        ],
      };
    }
    default:
      throw new Error(`Unsupported report export type: ${type}`);
  }
}

router.get('/export', authenticate, async (req, res) => {
  try {
    const type = String(req.query.type || '').trim();
    if (!type) return res.status(400).json({ error: 'type is required' });

    const payload = await buildReportPdfPayload(type, req.query);
    await sendReportPdf(res, payload);

    await createAuditLog(prisma, {
      action: 'PDF_DOWNLOAD',
      module: 'reports',
      userId: req.user.sub,
      entityId: type,
      newValue: { reportType: type, downloadedAt: new Date().toISOString(), filters: req.query },
    });
  } catch (err) {
    if (!res.headersSent) {
      const statusCode = /required|unsupported/i.test(err.message) ? 400 : 500;
      res.status(statusCode).json({ error: err.message });
    }
  }
});

// Holding Statement - all customers x gas types
router.get('/holding-statement', authenticate, async (req, res) => {
  try {
    const { customerId, gasCode, asOfDate, filter } = req.query;
    const thresholdSetting = await prisma.companySetting.findUnique({
      where: { key: 'overdue_threshold_days' },
      select: { value: true },
    });
    const parsedThreshold = parseInt(thresholdSetting?.value, 10);
    const overdueThresholdDays = Number.isFinite(parsedThreshold) && parsedThreshold > 0
      ? parsedThreshold
      : 30;

    const where = { status: { in: ['HOLDING', 'BILLED'] } };
    if (customerId) where.customerId = parseInt(customerId);
    if (asOfDate) where.issuedAt = { lte: new Date(asOfDate + 'T23:59:59Z') };

    const holdings = await prisma.cylinderHolding.findMany({
      where,
      include: {
        customer: { select: { code: true, name: true } },
        cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true, capacity: true } },
        transaction: { select: { billNumber: true, billDate: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });

    // Group by customer
    const grouped = {};
    for (const h of holdings) {
      const key = h.customer.code;
      if (!grouped[key]) {
        grouped[key] = { customerCode: h.customer.code, customerName: h.customer.name, cylinders: [] };
      }
      const holdDays = Math.ceil((new Date() - new Date(h.issuedAt)) / (1000 * 60 * 60 * 24));
      const cylinderData = {
        cylinderNumber: h.cylinder.cylinderNumber,
        gasCode: h.cylinder.gasCode,
        ownerCode: h.cylinder.ownerCode,
        issuedAt: h.issuedAt,
        billNumber: h.transaction?.billNumber,
        holdDays,
        isOverdue: holdDays > overdueThresholdDays,
      };
      
      // Filter by overdue if requested
      if (filter === 'overdue' && !cylinderData.isOverdue) continue;
      
      grouped[key].cylinders.push(cylinderData);
    }

    // Filter by gasCode if provided
    if (gasCode) {
      for (const key of Object.keys(grouped)) {
        grouped[key].cylinders = grouped[key].cylinders.filter(c => c.gasCode === gasCode);
        if (grouped[key].cylinders.length === 0) delete grouped[key];
      }
    }

    // Remove empty customer groups (can happen with overdue filter)
    for (const key of Object.keys(grouped)) {
      if (grouped[key].cylinders.length === 0) delete grouped[key];
    }

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Customer Statement
router.get('/customer-statement', authenticate, async (req, res) => {
  try {
    const { customerId, dateFrom, dateTo } = req.query;
    if (!customerId) return res.status(400).json({ error: 'Customer ID required' });

    const dateFilter = {};
    if (dateFrom) dateFilter.gte = new Date(dateFrom);
    if (dateTo) dateFilter.lte = new Date(dateTo + 'T23:59:59Z');

    const [customer, issues, returns] = await Promise.all([
      prisma.customer.findUnique({ where: { id: parseInt(customerId) } }),
      prisma.transaction.findMany({
        where: { customerId: parseInt(customerId), ...(Object.keys(dateFilter).length ? { billDate: dateFilter } : {}) },
        orderBy: { billDate: 'asc' },
      }),
      prisma.ecrRecord.findMany({
        where: { customerId: parseInt(customerId), ...(Object.keys(dateFilter).length ? { ecrDate: dateFilter } : {}) },
        orderBy: { ecrDate: 'asc' },
      }),
    ]);

    res.json({ customer, issues, returns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily Report
router.get('/daily-report', authenticate, async (req, res) => {
  try {
    const { date } = req.query;
    const reportDate = date ? new Date(date) : new Date();
    reportDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const [issues, returns] = await Promise.all([
      prisma.transaction.findMany({
        where: { billDate: { gte: reportDate, lt: nextDay } },
        include: { customer: { select: { code: true, name: true } } },
        orderBy: { billNumber: 'asc' },
      }),
      prisma.ecrRecord.findMany({
        where: { ecrDate: { gte: reportDate, lt: nextDay } },
        include: { customer: { select: { code: true, name: true } } },
        orderBy: { ecrNumber: 'asc' },
      }),
    ]);

    res.json({ date: reportDate, issues, returns });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sale Transaction Report
router.get('/sale-transactions', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo, customerId, gasCode } = req.query;
    const where = {};
    if (customerId) where.customerId = parseInt(customerId);
    if (gasCode) where.gasCode = gasCode;
    if (dateFrom || dateTo) {
      where.billDate = {};
      if (dateFrom) where.billDate.gte = new Date(dateFrom);
      if (dateTo) where.billDate.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: { customer: { select: { code: true, name: true } } },
      orderBy: { billDate: 'desc' },
    });

    res.json(transactions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trial Balance
router.get('/trial-balance', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = {};
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const entries = await prisma.ledgerEntry.groupBy({
      by: ['partyCode'],
      where,
      _sum: { debitAmount: true, creditAmount: true },
    });

    const partyCodes = [...new Set(entries.map(e => e.partyCode).filter(Boolean))];
    const customers = partyCodes.length
      ? await prisma.customer.findMany({
          where: { code: { in: partyCodes } },
          select: { code: true, name: true },
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.code, c.name]));

    const result = entries.map((e) => ({
      partyCode: e.partyCode,
      partyName: customerMap.get(e.partyCode) || e.partyCode,
      debit: parseFloat(e._sum.debitAmount || 0),
      credit: parseFloat(e._sum.creditAmount || 0),
      balance: parseFloat(e._sum.debitAmount || 0) - parseFloat(e._sum.creditAmount || 0),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cylinder Rotation Report
router.get('/cylinder-rotation', authenticate, async (req, res) => {
  try {
    const { cylinderNumber, gasCode } = req.query;
    const where = {};
    if (gasCode) where.cylinder = { gasCode };
    
    const holdings = await prisma.cylinderHolding.findMany({
      where,
      include: {
        cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true, status: true } },
        customer: { select: { code: true, name: true } },
        transaction: { select: { billNumber: true } },
      },
      orderBy: { issuedAt: 'desc' },
      take: 500,
    });

    // Filter by cylinder number if provided
    const filtered = cylinderNumber
      ? holdings.filter(h => h.cylinder.cylinderNumber.toLowerCase().includes(cylinderNumber.toLowerCase()))
      : holdings;

    // Group by cylinder
    const grouped = {};
    for (const h of filtered) {
      const key = h.cylinder.cylinderNumber;
      if (!grouped[key]) {
        grouped[key] = { cylinderNumber: key, gasCode: h.cylinder.gasCode, ownerCode: h.cylinder.ownerCode, currentStatus: h.cylinder.status, history: [] };
      }
      grouped[key].history.push({
        customerCode: h.customer.code,
        customerName: h.customer.name,
        billNumber: h.transaction?.billNumber,
        issuedAt: h.issuedAt,
        returnedAt: h.returnedAt,
        holdDays: h.holdDays || (h.returnedAt ? Math.ceil((new Date(h.returnedAt) - new Date(h.issuedAt)) / 86400000) : Math.ceil((new Date() - new Date(h.issuedAt)) / 86400000)),
        status: h.status,
      });
    }

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Party Wise Rental Report
router.get('/party-rental', authenticate, async (req, res) => {
  try {
    const { customerId, dateFrom, dateTo } = req.query;
    const where = {};
    if (customerId) where.customerId = parseInt(customerId);
    if (dateFrom || dateTo) {
      where.ecrDate = {};
      if (dateFrom) where.ecrDate.gte = new Date(dateFrom);
      if (dateTo) where.ecrDate.lte = new Date(dateTo + 'T23:59:59Z');
    }

    const ecrs = await prisma.ecrRecord.findMany({
      where,
      include: { customer: { select: { code: true, name: true } } },
      orderBy: { ecrDate: 'desc' },
    });

    // Group by customer
    const grouped = {};
    for (const e of ecrs) {
      const key = e.customer.code;
      if (!grouped[key]) {
        grouped[key] = { partyCode: key, partyName: e.customer.name, totalRent: 0, totalDays: 0, count: 0, records: [] };
      }
      grouped[key].totalRent += parseFloat(e.rentAmount || 0);
      grouped[key].totalDays += (e.holdDays || 0);
      grouped[key].count++;
      grouped[key].records.push({
        ecrNumber: e.ecrNumber, ecrDate: e.ecrDate, cylinderNumber: e.cylinderNumber,
        gasCode: e.gasCode, holdDays: e.holdDays, rentAmount: parseFloat(e.rentAmount || 0),
      });
    }

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cash Book
router.get('/cash-book', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = { transactionType: { in: ['CASH_RECEIPT', 'CASH_PAYMENT'] } };
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const entries = await prisma.ledgerEntry.findMany({
      where, orderBy: { voucherDate: 'asc' },
      include: { customer: { select: { code: true, name: true } } },
    });
    let bal = 0;
    const withBal = entries.map(e => {
      bal += parseFloat(e.debitAmount || 0) - parseFloat(e.creditAmount || 0);
      return { ...e, runningBalance: bal };
    });
    res.json(withBal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Bank Book
router.get('/bank-book', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = { transactionType: { in: ['BANK_RECEIPT', 'BANK_PAYMENT'] } };
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const entries = await prisma.ledgerEntry.findMany({
      where, orderBy: { voucherDate: 'asc' },
      include: { customer: { select: { code: true, name: true } } },
    });
    let bal = 0;
    const withBal = entries.map(e => {
      bal += parseFloat(e.debitAmount || 0) - parseFloat(e.creditAmount || 0);
      return { ...e, runningBalance: bal };
    });
    res.json(withBal);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Journal Book
router.get('/journal-book', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = { transactionType: { in: ['JOURNAL', 'CONTRA', 'DEBIT_NOTE', 'CREDIT_NOTE'] } };
    if (dateFrom || dateTo) {
      where.voucherDate = {};
      if (dateFrom) where.voucherDate.gte = new Date(dateFrom);
      if (dateTo) where.voucherDate.lte = new Date(dateTo + 'T23:59:59Z');
    }
    const entries = await prisma.ledgerEntry.findMany({
      where, orderBy: { voucherDate: 'asc' },
      include: { customer: { select: { code: true, name: true } } },
    });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Outstanding Payments
router.get('/outstanding', authenticate, async (req, res) => {
  try {
    const entries = await prisma.ledgerEntry.groupBy({
      by: ['partyCode'],
      _sum: { debitAmount: true, creditAmount: true },
    });

    const filteredEntries = entries.filter(e => e.partyCode);
    const partyCodes = [...new Set(filteredEntries.map(e => e.partyCode))];
    const customers = partyCodes.length
      ? await prisma.customer.findMany({
          where: { code: { in: partyCodes } },
          select: { code: true, name: true, phone: true },
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.code, c]));

    const result = filteredEntries.map((e) => {
      const balance = parseFloat(e._sum.debitAmount || 0) - parseFloat(e._sum.creditAmount || 0);
      if (Math.abs(balance) < 0.01) return null;

      const cust = customerMap.get(e.partyCode);
      return {
        partyCode: e.partyCode,
        partyName: cust?.name || e.partyCode,
        phone: cust?.phone,
        debit: parseFloat(e._sum.debitAmount || 0),
        credit: parseFloat(e._sum.creditAmount || 0),
        balance,
        type: balance > 0 ? 'RECEIVABLE' : 'PAYABLE',
      };
    });

    res.json(result.filter(Boolean).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sales Summary
router.get('/sales-summary', authenticate, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const where = {};
    if (dateFrom || dateTo) {
      where.billDate = {};
      if (dateFrom) where.billDate.gte = new Date(dateFrom);
      if (dateTo) where.billDate.lte = new Date(dateTo + 'T23:59:59Z');
    }

    // By gas type
    const byGas = await prisma.transaction.groupBy({
      by: ['gasCode'],
      where,
      _count: true,
      _sum: { quantityCum: true },
    });

    // By customer
    const byCust = await prisma.transaction.groupBy({
      by: ['customerId'],
      where,
      _count: true,
      _sum: { quantityCum: true },
    });

    const custDetails = await Promise.all(byCust.map(async (c) => {
      const cust = await prisma.customer.findUnique({ where: { id: c.customerId }, select: { code: true, name: true } });
      return { ...cust, count: extractCount(c._count), totalCum: parseFloat(c._sum.quantityCum || 0) };
    }));

    res.json({
      byGas: byGas.map(g => ({ gasCode: g.gasCode, count: extractCount(g._count), totalCum: parseFloat(g._sum.quantityCum || 0) })),
      byCustomer: custDetails.sort((a, b) => b.count - a.count),
      totalBills: byGas.reduce((s, g) => s + extractCount(g._count), 0),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Holding All Party - summary counts per gas type for all customers
router.get('/holding-all-party', authenticate, async (req, res) => {
  try {
    const holdings = await prisma.cylinderHolding.findMany({
      where: { status: { in: ['HOLDING', 'BILLED'] } },
      include: {
        customer: { select: { code: true, name: true } },
        cylinder: { select: { gasCode: true } },
      },
    });

    // Group by customer, then by gas type
    const grouped = {};
    for (const h of holdings) {
      const custKey = h.customer.code;
      if (!grouped[custKey]) {
        grouped[custKey] = {
          customerCode: h.customer.code,
          customerName: h.customer.name,
          gasCounts: {},
          totalCylinders: 0,
        };
      }
      const gasCode = h.cylinder.gasCode || 'UNKNOWN';
      grouped[custKey].gasCounts[gasCode] = (grouped[custKey].gasCounts[gasCode] || 0) + 1;
      grouped[custKey].totalCylinders++;
    }

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Holding Party Status - per customer cylinders held, overdue count, days range
router.get('/holding-party-status', authenticate, async (req, res) => {
  try {
    const { customerId } = req.query;
    const thresholdSetting = await prisma.companySetting.findUnique({
      where: { key: 'overdue_threshold_days' },
      select: { value: true },
    });
    const overdueThresholdDays = Number.isFinite(parseInt(thresholdSetting?.value, 10)) ? parseInt(thresholdSetting.value, 10) : 30;

    const where = { status: { in: ['HOLDING', 'BILLED'] } };
    if (customerId) where.customerId = parseInt(customerId);

    const holdings = await prisma.cylinderHolding.findMany({
      where,
      include: {
        customer: { select: { code: true, name: true } },
        cylinder: { select: { cylinderNumber: true, gasCode: true } },
      },
      orderBy: { issuedAt: 'desc' },
    });

    // Group by customer
    const grouped = {};
    for (const h of holdings) {
      const key = h.customer.code;
      if (!grouped[key]) {
        grouped[key] = {
          customerCode: h.customer.code,
          customerName: h.customer.name,
          cylindersHeld: [],
          overdueCount: 0,
          daysRange: { min: Infinity, max: 0 },
        };
      }

      const holdDays = Math.ceil((new Date() - new Date(h.issuedAt)) / (1000 * 60 * 60 * 24));
      const isOverdue = holdDays > overdueThresholdDays;

      grouped[key].cylindersHeld.push({
        cylinderNumber: h.cylinder.cylinderNumber,
        gasCode: h.cylinder.gasCode,
        issuedAt: h.issuedAt,
        holdDays,
        isOverdue,
      });

      if (isOverdue) grouped[key].overdueCount++;
      grouped[key].daysRange.min = Math.min(grouped[key].daysRange.min, holdDays);
      grouped[key].daysRange.max = Math.max(grouped[key].daysRange.max, holdDays);
    }

    // Fix infinite min for customers with no holdings
    Object.values(grouped).forEach(g => {
      if (g.daysRange.min === Infinity) g.daysRange.min = 0;
    });

    res.json(Object.values(grouped));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Issue Without Purchase - transactions where no matching order exists
router.get('/issue-without-purchase', authenticate, async (req, res) => {
  try {
    const result = await getIssueWithoutPurchaseReport(prisma, req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sale Return - ECR records in date range
router.get('/sale-return', authenticate, async (req, res) => {
  try {
    const result = await getSaleReturnReport(prisma, req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sale Return Summary - ECR grouped by customer, totals
router.get('/sale-return-summary', authenticate, async (req, res) => {
  try {
    const result = await getSaleReturnSummaryReport(prisma, req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Age Analysis Ledger - ledger grouped into buckets: 0-30, 31-60, 61-90, 90+ days
router.get('/age-analysis-ledger', authenticate, async (req, res) => {
  try {
    const { asOfDate } = req.query;
    const cutoffDate = asOfDate ? new Date(asOfDate) : new Date();

    // Get all ledger entries with outstanding balances
    const entries = await prisma.ledgerEntry.groupBy({
      by: ['partyCode'],
      _sum: { debitAmount: true, creditAmount: true },
    });

    const filteredEntries = entries.filter(e => e.partyCode);
    const partyCodes = [...new Set(filteredEntries.map(e => e.partyCode))];
    const customers = partyCodes.length
      ? await prisma.customer.findMany({
          where: { code: { in: partyCodes } },
          select: { code: true, name: true },
        })
      : [];
    const customerMap = new Map(customers.map(c => [c.code, c.name]));

    const result = [];

    for (const entry of filteredEntries) {
      const balance = parseFloat(entry._sum.debitAmount || 0) - parseFloat(entry._sum.creditAmount || 0);
      if (Math.abs(balance) < 0.01) continue;

      // Get the most recent transaction date for this party
      const lastEntry = await prisma.ledgerEntry.findFirst({
        where: { partyCode: entry.partyCode },
        orderBy: { voucherDate: 'desc' },
        select: { voucherDate: true },
      });

      if (!lastEntry) continue;

      const daysDiff = Math.floor((cutoffDate - new Date(lastEntry.voucherDate)) / (1000 * 60 * 60 * 24));

      let bucket = '90+';
      if (daysDiff <= 30) bucket = '0-30';
      else if (daysDiff <= 60) bucket = '31-60';
      else if (daysDiff <= 90) bucket = '61-90';

      result.push({
        partyCode: entry.partyCode,
        partyName: customerMap.get(entry.partyCode) || entry.partyCode,
        balance: Math.abs(balance),
        daysOutstanding: daysDiff,
        bucket,
        type: balance > 0 ? 'RECEIVABLE' : 'PAYABLE',
      });
    }

    // Group by bucket
    const buckets = {
      '0-30': [],
      '31-60': [],
      '61-90': [],
      '90+': [],
    };

    result.forEach(item => {
      buckets[item.bucket].push(item);
    });

    res.json({
      buckets,
      summary: {
        '0-30': buckets['0-30'].reduce((sum, item) => sum + item.balance, 0),
        '31-60': buckets['31-60'].reduce((sum, item) => sum + item.balance, 0),
        '61-90': buckets['61-90'].reduce((sum, item) => sum + item.balance, 0),
        '90+': buckets['90+'].reduce((sum, item) => sum + item.balance, 0),
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Age Analysis Outstanding - outstanding balances aged by invoice date
router.get('/age-analysis-outstanding', authenticate, async (req, res) => {
  try {
    const result = await getAgeAnalysisOutstandingReport(prisma, req.query);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reconciliation - Holding Parity Check (replaces CHECKER.PRG)
router.get('/reconciliation', authenticate, async (req, res) => {
  try {
    const { customerId, gasCode, ownerCode } = req.query;
    const result = await runReconciliation(prisma, { customerId, gasCode, ownerCode });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reconciliation: holding rents vs ECR rents
router.get('/reconciliation/holding-rents', authenticate, async (req, res) => {
  try {
    const { customerId } = req.query;
    const result = await validateHoldingRents(prisma, customerId ? parseInt(customerId, 10) : null);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reconciliation: orphaned holdings older than threshold
router.get('/reconciliation/orphaned-holdings', authenticate, async (req, res) => {
  try {
    const days = req.query.days ? parseInt(req.query.days, 10) : null;
    const result = await findOrphanedHoldings(prisma, { daysThreshold: days });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reconciliation: audit a bill's issues vs ECR returns
router.get('/reconciliation/bill/:billId', authenticate, async (req, res) => {
  try {
    const billId = parseInt(req.params.billId, 10);
    if (!Number.isFinite(billId)) return res.status(400).json({ error: 'Invalid bill id' });
    const result = await auditBillToEcrMatching(prisma, billId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
