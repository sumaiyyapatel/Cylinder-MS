const prisma = require('../lib/prisma');
const { calculateHoldDays, normalizeOwnerCode, isPocOwner, round2 } = require('../services/businessRules');
const { calculateRent, getEffectiveRate } = require('../services/rentalService');

async function runRentalRecomputeJob(prismaClient = prisma, asOf = new Date()) {
  const holdings = await prismaClient.cylinderHolding.findMany({
    where: { status: { in: ['HOLDING', 'BILLED'] } },
    include: { cylinder: { select: { gasCode: true, ownerCode: true } } },
  });

  let updatedCount = 0;
  for (const holding of holdings) {
    const holdDays = calculateHoldDays(holding.issuedAt, asOf);
    const ownerCode = normalizeOwnerCode(holding.cylinder?.ownerCode);
    let rentAmount = 0;

    if (!isPocOwner(ownerCode)) {
      const rateConfig = await getEffectiveRate(prismaClient, {
        customerId: holding.customerId,
        gasCode: holding.cylinder?.gasCode,
        ownerCode,
      });
      rentAmount = calculateRent(holdDays, rateConfig);
    }

    const nextRent = round2(rentAmount);
    if (holding.holdDays !== holdDays || Number(holding.rentAmount || 0) !== nextRent) {
      await prismaClient.cylinderHolding.update({
        where: { id: holding.id },
        data: { holdDays, rentAmount: nextRent },
      });
      updatedCount += 1;
    }
  }

  return { scannedCount: holdings.length, updatedCount };
}

module.exports = { runRentalRecomputeJob };
