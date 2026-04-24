const { runReconciliation } = require('./reconciliationService');

function parsePositiveInt(value) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function buildDateRange(dateFrom, dateTo, fieldName) {
  if (!dateFrom && !dateTo) return {};
  const range = {};
  if (dateFrom) range.gte = new Date(dateFrom);
  if (dateTo) range.lte = new Date(`${dateTo}T23:59:59Z`);
  return { [fieldName]: range };
}

function extractCount(countValue) {
  if (typeof countValue === 'number') return countValue;
  if (countValue && typeof countValue._all === 'number') return countValue._all;
  return 0;
}

async function getHoldingStatementReport(prisma, query = {}) {
  const { customerId, gasCode, asOfDate, filter } = query;
  const thresholdSetting = await prisma.companySetting.findUnique({
    where: { key: 'overdue_threshold_days' },
    select: { value: true },
  });
  const parsedThreshold = parseInt(thresholdSetting?.value, 10);
  const overdueThresholdDays = Number.isFinite(parsedThreshold) && parsedThreshold > 0 ? parsedThreshold : 30;

  const where = { status: { in: ['HOLDING', 'BILLED'] } };
  const customerIdNum = parsePositiveInt(customerId);
  if (customerIdNum) where.customerId = customerIdNum;
  if (asOfDate) where.issuedAt = { lte: new Date(`${asOfDate}T23:59:59Z`) };

  const holdings = await prisma.cylinderHolding.findMany({
    where,
    include: {
      customer: { select: { code: true, name: true } },
      cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true, capacity: true } },
      transaction: { select: { billNumber: true, billDate: true } },
    },
    orderBy: { issuedAt: 'desc' },
  });

  const grouped = {};
  for (const holding of holdings) {
    const holdDays = Math.ceil((Date.now() - new Date(holding.issuedAt).getTime()) / 86400000);
    const cylinderData = {
      cylinderNumber: holding.cylinder.cylinderNumber,
      gasCode: holding.cylinder.gasCode,
      ownerCode: holding.cylinder.ownerCode,
      issuedAt: holding.issuedAt,
      billNumber: holding.transaction?.billNumber,
      holdDays,
      isOverdue: holdDays > overdueThresholdDays,
    };

    if (filter === 'overdue' && !cylinderData.isOverdue) continue;

    const groupKey = holding.customer.code;
    if (!grouped[groupKey]) {
      grouped[groupKey] = {
        customerCode: holding.customer.code,
        customerName: holding.customer.name,
        cylinders: [],
      };
    }
    grouped[groupKey].cylinders.push(cylinderData);
  }

  const groupedValues = Object.values(grouped)
    .map((group) => ({
      ...group,
      cylinders: gasCode ? group.cylinders.filter((item) => item.gasCode === gasCode) : group.cylinders,
    }))
    .filter((group) => group.cylinders.length > 0);

  return groupedValues;
}

async function getCustomerStatementReport(prisma, query = {}) {
  const customerIdNum = parsePositiveInt(query.customerId);
  if (!customerIdNum) throw new Error('Customer ID required');

  const dateFilter = buildDateRange(query.dateFrom, query.dateTo, 'billDate');
  const returnDateFilter = buildDateRange(query.dateFrom, query.dateTo, 'ecrDate');

  const [customer, issues, returns] = await Promise.all([
    prisma.customer.findUnique({ where: { id: customerIdNum } }),
    prisma.transaction.findMany({
      where: { customerId: customerIdNum, ...dateFilter },
      orderBy: { billDate: 'asc' },
    }),
    prisma.ecrRecord.findMany({
      where: { customerId: customerIdNum, ...returnDateFilter },
      orderBy: { ecrDate: 'asc' },
    }),
  ]);

  return { customer, issues, returns };
}

async function getDailyReport(prisma, query = {}) {
  const reportDate = query.date ? new Date(query.date) : new Date();
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

  return { date: reportDate, issues, returns };
}

async function getSaleTransactionsReport(prisma, query = {}) {
  const where = {};
  const customerIdNum = parsePositiveInt(query.customerId);
  if (customerIdNum) where.customerId = customerIdNum;
  if (query.gasCode) where.gasCode = query.gasCode;
  Object.assign(where, buildDateRange(query.dateFrom, query.dateTo, 'billDate'));

  return prisma.transaction.findMany({
    where,
    include: { customer: { select: { code: true, name: true } } },
    orderBy: { billDate: 'desc' },
  });
}

async function getTrialBalanceReport(prisma, query = {}) {
  const where = buildDateRange(query.dateFrom, query.dateTo, 'voucherDate');
  const entries = await prisma.ledgerEntry.groupBy({
    by: ['partyCode'],
    where,
    _sum: { debitAmount: true, creditAmount: true },
  });

  const partyCodes = [...new Set(entries.map((entry) => entry.partyCode).filter(Boolean))];
  const customers = partyCodes.length
    ? await prisma.customer.findMany({
        where: { code: { in: partyCodes } },
        select: { code: true, name: true },
      })
    : [];
  const customerMap = new Map(customers.map((customer) => [customer.code, customer.name]));

  return entries.map((entry) => ({
    partyCode: entry.partyCode,
    partyName: customerMap.get(entry.partyCode) || entry.partyCode,
    debit: parseFloat(entry._sum.debitAmount || 0),
    credit: parseFloat(entry._sum.creditAmount || 0),
    balance: parseFloat(entry._sum.debitAmount || 0) - parseFloat(entry._sum.creditAmount || 0),
  }));
}

async function getCylinderRotationReport(prisma, query = {}) {
  const where = {};
  if (query.gasCode) where.cylinder = { gasCode: query.gasCode };

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

  const needle = String(query.cylinderNumber || '').trim().toLowerCase();
  const filtered = needle
    ? holdings.filter((holding) => holding.cylinder.cylinderNumber.toLowerCase().includes(needle))
    : holdings;

  const grouped = {};
  for (const holding of filtered) {
    const key = holding.cylinder.cylinderNumber;
    if (!grouped[key]) {
      grouped[key] = {
        cylinderNumber: key,
        gasCode: holding.cylinder.gasCode,
        ownerCode: holding.cylinder.ownerCode,
        currentStatus: holding.cylinder.status,
        history: [],
      };
    }
    grouped[key].history.push({
      customerCode: holding.customer.code,
      customerName: holding.customer.name,
      billNumber: holding.transaction?.billNumber,
      issuedAt: holding.issuedAt,
      returnedAt: holding.returnedAt,
      holdDays:
        holding.holdDays ||
        (holding.returnedAt
          ? Math.ceil((new Date(holding.returnedAt).getTime() - new Date(holding.issuedAt).getTime()) / 86400000)
          : Math.ceil((Date.now() - new Date(holding.issuedAt).getTime()) / 86400000)),
      status: holding.status,
    });
  }

  return Object.values(grouped);
}

async function getPartyRentalReport(prisma, query = {}) {
  const where = {};
  const customerIdNum = parsePositiveInt(query.customerId);
  if (customerIdNum) where.customerId = customerIdNum;
  Object.assign(where, buildDateRange(query.dateFrom, query.dateTo, 'ecrDate'));

  const ecrs = await prisma.ecrRecord.findMany({
    where,
    include: { customer: { select: { code: true, name: true } } },
    orderBy: { ecrDate: 'desc' },
  });

  const grouped = {};
  for (const ecr of ecrs) {
    const key = ecr.customer.code;
    if (!grouped[key]) {
      grouped[key] = { partyCode: key, partyName: ecr.customer.name, totalRent: 0, totalDays: 0, count: 0, records: [] };
    }
    grouped[key].totalRent += parseFloat(ecr.rentAmount || 0);
    grouped[key].totalDays += ecr.holdDays || 0;
    grouped[key].count += 1;
    grouped[key].records.push({
      ecrNumber: ecr.ecrNumber,
      ecrDate: ecr.ecrDate,
      cylinderNumber: ecr.cylinderNumber,
      gasCode: ecr.gasCode,
      holdDays: ecr.holdDays,
      rentAmount: parseFloat(ecr.rentAmount || 0),
    });
  }

  return Object.values(grouped);
}

async function getBookReport(prisma, query = {}, transactionTypes = []) {
  const where = { transactionType: { in: transactionTypes } };
  Object.assign(where, buildDateRange(query.dateFrom, query.dateTo, 'voucherDate'));

  const entries = await prisma.ledgerEntry.findMany({
    where,
    orderBy: { voucherDate: 'asc' },
    include: { customer: { select: { code: true, name: true } } },
  });

  let runningBalance = 0;
  return entries.map((entry) => {
    runningBalance += parseFloat(entry.debitAmount || 0) - parseFloat(entry.creditAmount || 0);
    return { ...entry, runningBalance };
  });
}

async function getOutstandingReport(prisma) {
  const entries = await prisma.ledgerEntry.groupBy({
    by: ['partyCode'],
    _sum: { debitAmount: true, creditAmount: true },
  });

  const filteredEntries = entries.filter((entry) => entry.partyCode);
  const partyCodes = [...new Set(filteredEntries.map((entry) => entry.partyCode))];
  const customers = partyCodes.length
    ? await prisma.customer.findMany({
        where: { code: { in: partyCodes } },
        select: { code: true, name: true, phone: true },
      })
    : [];
  const customerMap = new Map(customers.map((customer) => [customer.code, customer]));

  return filteredEntries
    .map((entry) => {
      const balance = parseFloat(entry._sum.debitAmount || 0) - parseFloat(entry._sum.creditAmount || 0);
      if (Math.abs(balance) < 0.01) return null;
      const customer = customerMap.get(entry.partyCode);
      return {
        partyCode: entry.partyCode,
        partyName: customer?.name || entry.partyCode,
        phone: customer?.phone,
        debit: parseFloat(entry._sum.debitAmount || 0),
        credit: parseFloat(entry._sum.creditAmount || 0),
        balance,
        type: balance > 0 ? 'RECEIVABLE' : 'PAYABLE',
      };
    })
    .filter(Boolean)
    .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance));
}

async function getSalesSummaryReport(prisma, query = {}) {
  const where = buildDateRange(query.dateFrom, query.dateTo, 'billDate');

  const byGas = await prisma.transaction.groupBy({
    by: ['gasCode'],
    where,
    _count: true,
    _sum: { quantityCum: true },
  });

  const byCustomerGroup = await prisma.transaction.groupBy({
    by: ['customerId'],
    where,
    _count: true,
    _sum: { quantityCum: true },
  });

  const byCustomer = await Promise.all(
    byCustomerGroup.map(async (group) => {
      const customer = await prisma.customer.findUnique({
        where: { id: group.customerId },
        select: { code: true, name: true },
      });
      return {
        ...customer,
        count: extractCount(group._count),
        totalCum: parseFloat(group._sum.quantityCum || 0),
      };
    })
  );

  return {
    byGas: byGas.map((group) => ({
      gasCode: group.gasCode,
      count: extractCount(group._count),
      totalCum: parseFloat(group._sum.quantityCum || 0),
    })),
    byCustomer: byCustomer.sort((left, right) => right.count - left.count),
    totalBills: byGas.reduce((sum, group) => sum + extractCount(group._count), 0),
  };
}

async function getIssueWithoutPurchaseReport(prisma, query = {}) {
  const where = buildDateRange(query.dateFrom, query.dateTo, 'billDate');
  const transactions = await prisma.transaction.findMany({
    where,
    include: {
      customer: { select: { code: true, name: true } },
    },
    orderBy: { billDate: 'desc' },
  });

  return transactions.filter((transaction) => !transaction.orderNumber || !transaction.orderNumber.trim());
}

async function getSaleReturnReport(prisma, query = {}) {
  const where = {};
  const customerIdNum = parsePositiveInt(query.customerId);
  if (customerIdNum) where.customerId = customerIdNum;
  Object.assign(where, buildDateRange(query.dateFrom, query.dateTo, 'ecrDate'));

  return prisma.ecrRecord.findMany({
    where,
    include: { customer: { select: { code: true, name: true } } },
    orderBy: { ecrDate: 'desc' },
  });
}

async function getSaleReturnSummaryReport(prisma, query = {}) {
  const ecrs = await getSaleReturnReport(prisma, query);
  const grouped = {};

  for (const ecr of ecrs) {
    const key = ecr.customer.code;
    if (!grouped[key]) {
      grouped[key] = {
        customerCode: ecr.customer.code,
        customerName: ecr.customer.name,
        totalReturns: 0,
        totalRent: 0,
        totalDays: 0,
        records: [],
      };
    }
    grouped[key].totalReturns += 1;
    grouped[key].totalRent += parseFloat(ecr.rentAmount || 0);
    grouped[key].totalDays += ecr.holdDays || 0;
    grouped[key].records.push({
      ecrNumber: ecr.ecrNumber,
      ecrDate: ecr.ecrDate,
      cylinderNumber: ecr.cylinderNumber,
      gasCode: ecr.gasCode,
      holdDays: ecr.holdDays,
      rentAmount: parseFloat(ecr.rentAmount || 0),
    });
  }

  return Object.values(grouped);
}

async function getAgeAnalysisLedgerReport(prisma, query = {}) {
  const cutoffDate = query.asOfDate ? new Date(query.asOfDate) : new Date();
  const entries = await prisma.ledgerEntry.groupBy({
    by: ['partyCode'],
    _sum: { debitAmount: true, creditAmount: true },
  });

  const filteredEntries = entries.filter((entry) => entry.partyCode);
  const partyCodes = [...new Set(filteredEntries.map((entry) => entry.partyCode))];
  const customers = partyCodes.length
    ? await prisma.customer.findMany({
        where: { code: { in: partyCodes } },
        select: { code: true, name: true },
      })
    : [];
  const customerMap = new Map(customers.map((customer) => [customer.code, customer.name]));

  const items = [];
  for (const entry of filteredEntries) {
    const balance = parseFloat(entry._sum.debitAmount || 0) - parseFloat(entry._sum.creditAmount || 0);
    if (Math.abs(balance) < 0.01) continue;

    const lastEntry = await prisma.ledgerEntry.findFirst({
      where: { partyCode: entry.partyCode },
      orderBy: { voucherDate: 'desc' },
      select: { voucherDate: true },
    });
    if (!lastEntry) continue;

    const daysOutstanding = Math.floor((cutoffDate.getTime() - new Date(lastEntry.voucherDate).getTime()) / 86400000);
    let bucket = '90+';
    if (daysOutstanding <= 30) bucket = '0-30';
    else if (daysOutstanding <= 60) bucket = '31-60';
    else if (daysOutstanding <= 90) bucket = '61-90';

    items.push({
      partyCode: entry.partyCode,
      partyName: customerMap.get(entry.partyCode) || entry.partyCode,
      balance: Math.abs(balance),
      daysOutstanding,
      bucket,
      type: balance > 0 ? 'RECEIVABLE' : 'PAYABLE',
    });
  }

  const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
  items.forEach((item) => buckets[item.bucket].push(item));

  return {
    buckets,
    summary: {
      '0-30': buckets['0-30'].reduce((sum, item) => sum + item.balance, 0),
      '31-60': buckets['31-60'].reduce((sum, item) => sum + item.balance, 0),
      '61-90': buckets['61-90'].reduce((sum, item) => sum + item.balance, 0),
      '90+': buckets['90+'].reduce((sum, item) => sum + item.balance, 0),
    },
  };
}

async function getAgeAnalysisOutstandingReport(prisma, query = {}) {
  const cutoffDate = query.asOfDate ? new Date(query.asOfDate) : new Date();

  const bills = await prisma.bill.findMany({
    include: {
      customer: { select: { code: true, name: true } },
    },
    orderBy: { billDate: 'asc' },
  });

  const payments = await prisma.payment.groupBy({
    by: ['billId'],
    where: { billId: { not: null } },
    _sum: { amount: true },
  });

  const paidMap = new Map(
    payments.map((payment) => [payment.billId, parseFloat(payment._sum.amount || 0)])
  );

  const items = bills
    .map((bill) => {
      const totalAmount = parseFloat(bill.totalAmount || 0);
      const paid = paidMap.get(bill.id) || 0;
      const balance = totalAmount - paid;
      if (balance <= 0.01) return null;

      const daysOutstanding = Math.floor((cutoffDate.getTime() - new Date(bill.billDate).getTime()) / 86400000);
      let bucket = '90+';
      if (daysOutstanding <= 30) bucket = '0-30';
      else if (daysOutstanding <= 60) bucket = '31-60';
      else if (daysOutstanding <= 90) bucket = '61-90';

      return {
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        partyCode: bill.customer.code,
        partyName: bill.customer.name,
        balance,
        daysOutstanding,
        bucket,
        gasCode: bill.gasCode,
      };
    })
    .filter(Boolean);

  const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
  items.forEach((item) => buckets[item.bucket].push(item));

  return {
    buckets,
    summary: {
      '0-30': buckets['0-30'].reduce((sum, item) => sum + item.balance, 0),
      '31-60': buckets['31-60'].reduce((sum, item) => sum + item.balance, 0),
      '61-90': buckets['61-90'].reduce((sum, item) => sum + item.balance, 0),
      '90+': buckets['90+'].reduce((sum, item) => sum + item.balance, 0),
    },
  };
}

async function getReconciliationReport(prisma, query = {}) {
  return runReconciliation(prisma, {
    customerId: query.customerId,
    gasCode: query.gasCode,
    ownerCode: query.ownerCode,
  });
}

module.exports = {
  extractCount,
  getAgeAnalysisLedgerReport,
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
};
