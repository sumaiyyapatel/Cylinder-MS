const { round2 } = require('./businessRules');

function tierWindow(fromVal, toVal, defaultFrom, defaultTo) {
  const from = Math.max(1, Number(fromVal) || defaultFrom);
  const to = Math.max(from, Number(toVal) || defaultTo);
  return to - from + 1;
}

function calculateRent(holdDays, rateConfig) {
  if (!rateConfig) return 0;

  const safeHoldDays = Math.max(0, Number(holdDays) || 0);
  const freeDays = Math.max(0, Number(rateConfig.rentalFreeDays) || 0);
  if (safeHoldDays <= freeDays) return 0;

  let rent = 0;
  let remainingDays = safeHoldDays - freeDays;

  // Tier 1
  if (rateConfig.rentalRate1 && remainingDays > 0) {
    const tier1Days = Math.min(remainingDays, tierWindow(rateConfig.rentalDaysFrom1, rateConfig.rentalDaysTo1, 1, 15));
    rent += tier1Days * parseFloat(rateConfig.rentalRate1);
    remainingDays -= tier1Days;
  }

  // Tier 2
  if (rateConfig.rentalRate2 && remainingDays > 0) {
    const tier2Days = Math.min(remainingDays, tierWindow(rateConfig.rentalDaysFrom2, rateConfig.rentalDaysTo2, 16, 30));
    rent += tier2Days * parseFloat(rateConfig.rentalRate2);
    remainingDays -= tier2Days;
  }

  // Tier 3 (remaining days)
  if (rateConfig.rentalRate3 && remainingDays > 0) {
    rent += remainingDays * parseFloat(rateConfig.rentalRate3);
  }

  return round2(rent);
}

// Determine effective rate configuration in order: customer-specific -> owner -> default (COC)
async function getEffectiveRate(tx, { customerId = null, gasCode = null, ownerCode = null } = {}) {
  // Try customer-specific rate first (customer.code)
  if (customerId) {
    const customer = await tx.customer.findUnique({ where: { id: customerId }, select: { code: true } });
    if (customer?.code) {
      const rate = await tx.rateList.findFirst({
        where: { gasCode: gasCode || undefined, ownerCode: customer.code },
        orderBy: { effectiveFrom: 'desc' },
      });
      if (rate) return rate;
    }
  }

  // Next, owner-specific rate
  if (ownerCode) {
    const rate = await tx.rateList.findFirst({
      where: { gasCode: gasCode || undefined, ownerCode },
      orderBy: { effectiveFrom: 'desc' },
    });
    if (rate) return rate;
  }

  // Finally, default company-owned rate 'COC'
  const defaultRate = await tx.rateList.findFirst({
    where: { gasCode: gasCode || undefined, ownerCode: 'COC' },
    orderBy: { effectiveFrom: 'desc' },
  });
  return defaultRate || null;
}

module.exports = { calculateRent, getEffectiveRate };
