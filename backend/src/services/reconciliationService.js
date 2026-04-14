/**
 * Reconciliation Service — replaces CHECKER.PRG from FoxPro.
 *
 * Compares issue counts vs return counts vs active holdings
 * for each customer + gas + owner combination.
 * Flags mismatches, missing ECR records, and duplicate issues.
 */

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
    if (h.status === 'RETURNED' || h.status === 'BILLED') {
      groupMap[key].returned++;
    } else if (h.status === 'HOLDING') {
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
  const returnedHoldings = holdings.filter((h) => h.status === 'RETURNED' || h.status === 'BILLED');
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
  const activeCylinderHoldings = holdings.filter((h) => h.status === 'HOLDING');
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

module.exports = { runReconciliation };
