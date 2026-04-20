/**
 * Reconciliation Service — replaces CHECKER.PRG from FoxPro.
 *
 * Compares issue counts vs return counts vs active holdings
 * for each customer + gas + owner combination.
 * Flags mismatches, missing ECR records, and duplicate issues.
 */

const { calculateHoldDays, round2 } = require('./businessRules');


async function runReconciliation(db, options = {}) {
  const { customerId, gasCode, ownerCode } = options;

  // 1. Build holding-based summary from CylinderHolding
  const holdingWhere = {};
  if (customerId) holdingWhere.customerId = parseInt(customerId, 10);

  const holdings = await db.cylinderHolding.findMany({
    where: holdingWhere,
    include: {
      cylinder: { select: { gasCode: true, ownerCode: true, cylinderNumber: true } },
      customer: { select: { id: true, code: true, name: true } },
    },
  });

  // 2. Group: customer + gas + owner → { issued, returned, activeHoldings }
  const groupMap = {};

  for (const h of holdings) {
    const gas = h.cylinder?.gasCode || 'UNKNOWN';
    const owner = h.cylinder?.ownerCode || 'UNKNOWN';
    if (gasCode && gas !== gasCode) continue;
    if (ownerCode && owner !== ownerCode) continue;

    const key = `${h.customerId}|${gas}|${owner}`;
    if (!groupMap[key]) {
      groupMap[key] = {
        customerId: h.customerId,
        customerCode: h.customer?.code || '-',
        customerName: h.customer?.name || '-',
        gasCode: gas,
        ownerCode: owner,
        issued: 0,
        returned: 0,
        activeHoldings: 0,
        cylinders: [],
      };
    }

    groupMap[key].issued++;
    if (h.status === 'RETURNED') {
      groupMap[key].returned++;
    } else if (h.status === 'HOLDING' || h.status === 'BILLED') {
      groupMap[key].activeHoldings++;
      groupMap[key].cylinders.push(h.cylinder?.cylinderNumber || '-');
    }
  }

  // 3. Calculate balance and flag mismatches
  const mismatches = [];
  const reconciled = [];

  for (const [key, group] of Object.entries(groupMap)) {
    const balance = group.issued - group.returned;
    const hasMismatch = balance !== group.activeHoldings;

    const record = {
      ...group,
      balance,
      mismatch: hasMismatch,
      delta: balance - group.activeHoldings,
    };
    delete record.cylinders;

    if (hasMismatch) {
      record.heldCylinders = group.cylinders;
      mismatches.push(record);
    } else {
      reconciled.push(record);
    }
  }

  // 4. Find missing ECR records (holdings RETURNED but no ECR)
  const returnedHoldings = holdings.filter((h) => h.status === 'RETURNED');
  const cylinderNumbers = [...new Set(returnedHoldings.map((h) => h.cylinder?.cylinderNumber).filter(Boolean))];
  const ecrRecords = cylinderNumbers.length
    ? await db.ecrRecord.findMany({
        where: { cylinderNumber: { in: cylinderNumbers } },
        select: { cylinderNumber: true, ecrNumber: true },
      })
    : [];
  const ecrCylinderSet = new Set(ecrRecords.map((e) => e.cylinderNumber));

  const missingEcr = returnedHoldings
    .filter((h) => h.cylinder?.cylinderNumber && !ecrCylinderSet.has(h.cylinder.cylinderNumber))
    .map((h) => ({
      customerId: h.customerId,
      customerCode: h.customer?.code,
      cylinderNumber: h.cylinder?.cylinderNumber,
      issuedAt: h.issuedAt,
      returnedAt: h.returnedAt,
    }));

  // 5. Find duplicate issues (cylinder issued more than once without return)
  const activeCylinderHoldings = holdings.filter((h) => h.status === 'HOLDING' || h.status === 'BILLED');
  const cylinderCountMap = {};
  for (const h of activeCylinderHoldings) {
    const cylNum = h.cylinder?.cylinderNumber;
    if (!cylNum) continue;
    if (!cylinderCountMap[cylNum]) cylinderCountMap[cylNum] = [];
    cylinderCountMap[cylNum].push({
      customerId: h.customerId,
      customerCode: h.customer?.code,
      issuedAt: h.issuedAt,
    });
  }

  const duplicateIssues = Object.entries(cylinderCountMap)
    .filter(([, records]) => records.length > 1)
    .map(([cylinderNumber, records]) => ({
      cylinderNumber,
      count: records.length,
      records,
    }));

  return {
    summary: {
      totalGroups: Object.keys(groupMap).length,
      mismatchCount: mismatches.length,
      reconciledCount: reconciled.length,
      missingEcrCount: missingEcr.length,
      duplicateIssueCount: duplicateIssues.length,
    },
    mismatches,
    reconciled,
    missingEcr,
    duplicateIssues,
  };
}

async function validateHoldingRents(db, customerId = null) {
  const where = { status: 'RETURNED' };
  if (customerId) where.customerId = parseInt(customerId, 10);

  const holdings = await db.cylinderHolding.findMany({
    where,
    include: { cylinder: { select: { cylinderNumber: true } }, customer: { select: { id: true, code: true } } },
  });

  const cylinderNumbers = [...new Set(holdings.map(h => h.cylinder?.cylinderNumber).filter(Boolean))];
  const ecrWhere = {};
  if (customerId) ecrWhere.customerId = parseInt(customerId, 10);
  if (cylinderNumbers.length) ecrWhere.cylinderNumber = { in: cylinderNumbers };
  const ecrs = cylinderNumbers.length ? await db.ecrRecord.findMany({ where: ecrWhere }) : [];

  const ecrMap = new Map();
  for (const e of ecrs) {
    if (!e.cr) {}
    const list = ecrMap.get(e.cylinderNumber) || [];
    list.push(e);
    ecrMap.set(e.cylinderNumber, list);
  }

  let holdingsTotal = 0;
  let ecrTotal = 0;
  const mismatches = [];
  const missingEcr = [];

  for (const h of holdings) {
    const holdingRent = parseFloat(h.rentAmount || 0);
    holdingsTotal += holdingRent;
    const cyl = h.cylinder?.cylinderNumber;
    const candidates = ecrMap.get(cyl) || [];

    // prefer same-day match on ecrDate vs returnedAt
    const sameDayMatch = candidates.find(e => new Date(e.ecrDate).toISOString().slice(0,10) === new Date(h.returnedAt || '').toISOString().slice(0,10) && e.customerId === h.customerId);
    const matched = sameDayMatch || candidates.find(e => e.customerId === h.customerId) || null;

    if (!matched) {
      missingEcr.push({ holdingId: h.id, cylinderNumber: cyl, customerId: h.customerId, issuedAt: h.issuedAt, returnedAt: h.returnedAt, holdingRent });
    } else {
      const ecrRent = parseFloat(matched.rentAmount || 0);
      ecrTotal += ecrRent;
      if (Math.abs(holdingRent - ecrRent) > 0.009) {
        mismatches.push({ holdingId: h.id, cylinderNumber: cyl, holdingRent, ecrId: matched.id, ecrRent });
      }
    }
  }

  // include any ecrs for this customer that didn't match holdings in totals
  if (!customerId) {
    // if no specific customer, sum all ecrs we loaded
    ecrTotal = ecrs.reduce((s, e) => s + parseFloat(e.rentAmount || 0), 0);
  } else {
    // ensure we include any ecrs that were not matched (and thus not added above)
    const matchedEcrIds = new Set((mismatches.map(m => m.ecrId).filter(Boolean)).concat(ecrs.filter(e => e.customerId === parseInt(customerId,10)).map(e => e.id)));
    ecrTotal = ecrs.filter(e => e.customerId === parseInt(customerId,10)).reduce((s, e) => s + parseFloat(e.rentAmount || 0), 0);
  }

  return {
    summary: { holdingsTotal: round2(holdingsTotal), ecrTotal: round2(ecrTotal), difference: round2(holdingsTotal - ecrTotal) },
    mismatches,
    missingEcr,
  };
}

async function findOrphanedHoldings(db, options = {}) {
  const { daysThreshold = null } = options;
  let threshold = daysThreshold;
  if (threshold == null) {
    const setting = await db.companySetting.findUnique({ where: { key: 'overdue_threshold_days' }, select: { value: true } });
    const parsed = parseInt(setting?.value, 10);
    threshold = Number.isFinite(parsed) && parsed > 0 ? parsed : 30;
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - threshold);

  const holdings = await db.cylinderHolding.findMany({
    where: { status: { in: ['HOLDING', 'BILLED'] }, issuedAt: { lt: cutoff } },
    include: { cylinder: { select: { cylinderNumber: true, gasCode: true, ownerCode: true } }, customer: { select: { id: true, code: true, name: true } } },
    orderBy: { issuedAt: 'asc' },
  });

  return holdings.map(h => ({
    id: h.id,
    customerId: h.customerId,
    customerCode: h.customer?.code,
    cylinderNumber: h.cylinder?.cylinderNumber,
    gasCode: h.cylinder?.gasCode,
    ownerCode: h.cylinder?.ownerCode,
    issuedAt: h.issuedAt,
    holdDays: calculateHoldDays(h.issuedAt, new Date()),
  }));
}

async function auditBillToEcrMatching(db, billId) {
  const bill = await db.bill.findUnique({ where: { id: parseInt(billId, 10) }, include: { items: { select: { cylinderNumber: true, quantityCum: true } } } });
  if (!bill) throw new Error('Bill not found');

  const billNumber = bill.billNumber;
  const items = bill.items || [];
  const billCylinders = items.map(i => i.cylinderNumber).filter(Boolean);
  const billQty = round2(items.reduce((s, i) => s + (parseFloat(i.quantityCum || 0)), 0));

  const ecrs = await db.ecrRecord.findMany({ where: { issueNumber: billNumber } });
  const ecrCylinders = ecrs.map(e => e.cylinderNumber).filter(Boolean);
  const ecrQty = round2(ecrs.reduce((s, e) => s + (parseFloat(e.quantityCum || 0) || 0), 0));

  const missingReturns = billCylinders.filter(c => !ecrCylinders.includes(c));
  const extraReturns = ecrCylinders.filter(c => !billCylinders.includes(c));

  return {
    billId: bill.id,
    billNumber,
    billQty,
    ecrQty,
    missingReturns,
    extraReturns,
    ecrCount: ecrs.length,
    itemCount: items.length,
  };
}

module.exports = { runReconciliation, validateHoldingRents, findOrphanedHoldings, auditBillToEcrMatching };
