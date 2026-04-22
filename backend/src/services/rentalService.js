const { round2 } = require('./businessRules');

function tierWindow(fromVal, toVal, defaultFrom, defaultTo) {
  const from = Math.max(1, Number(fromVal) || defaultFrom);
  const to = Math.max(from, Number(toVal) || defaultTo);
  return to - from + 1;
}

function normalizeTierBoundary(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : fallback;
}

function hasRate(value) {
  return Number(value) > 0;
}

function getRentalTierDefinitions(rateConfig = {}) {
  const tiers = [];

  if (hasRate(rateConfig.rentalRate1)) {
    const from = normalizeTierBoundary(rateConfig.rentalDaysFrom1, 1);
    const to = normalizeTierBoundary(rateConfig.rentalDaysTo1, 15);
    tiers.push({ name: 'Tier 1', rate: Number(rateConfig.rentalRate1), from, to });
  }

  if (hasRate(rateConfig.rentalRate2)) {
    const from = normalizeTierBoundary(rateConfig.rentalDaysFrom2, 16);
    const to = normalizeTierBoundary(rateConfig.rentalDaysTo2, 30);
    tiers.push({ name: 'Tier 2', rate: Number(rateConfig.rentalRate2), from, to });
  }

  if (hasRate(rateConfig.rentalRate3)) {
    const from = normalizeTierBoundary(rateConfig.rentalDaysFrom3, 31);
    const rawTo = rateConfig.rentalDaysTo3;
    const to = rawTo === undefined || rawTo === null || rawTo === ''
      ? Number.POSITIVE_INFINITY
      : normalizeTierBoundary(rawTo, from);
    tiers.push({ name: 'Tier 3', rate: Number(rateConfig.rentalRate3), from, to });
  }

  return tiers;
}

function validateRentalTierConfig(rateConfig = {}) {
  const tiers = getRentalTierDefinitions(rateConfig);

  for (const tier of tiers) {
    if (!Number.isFinite(tier.rate) || tier.rate < 0) {
      throw new Error(`${tier.name} rate is invalid`);
    }
    if (!Number.isFinite(tier.from) || tier.from < 1) {
      throw new Error(`${tier.name} start day is invalid`);
    }
    if (tier.to !== Number.POSITIVE_INFINITY && (!Number.isFinite(tier.to) || tier.to < tier.from)) {
      throw new Error(`${tier.name} end day must be >= start day`);
    }
  }

  for (let index = 0; index < tiers.length; index += 1) {
    const current = tiers[index];
    const previous = tiers[index - 1];

    if (!previous) {
      if (current.from !== 1) {
        throw new Error(`${current.name} must start at day 1`);
      }
      continue;
    }

    if (previous.to === Number.POSITIVE_INFINITY) {
      throw new Error(`${previous.name} cannot be open-ended when later tiers exist`);
    }

    const expectedFrom = previous.to + 1;
    if (current.from !== expectedFrom) {
      throw new Error(`${current.name} must start at day ${expectedFrom}`);
    }
  }

  return tiers;
}

function calculateRent(holdDays, rateConfig) {
  if (!rateConfig) return 0;

  const safeHoldDays = Math.max(0, Number(holdDays) || 0);
  const freeDays = Math.max(0, Number(rateConfig.rentalFreeDays) || 0);
  if (safeHoldDays <= freeDays) return 0;

  let rent = 0;
  let remainingDays = safeHoldDays - freeDays;
  const tiers = validateRentalTierConfig(rateConfig);

  for (const tier of tiers) {
    if (remainingDays <= 0) break;

    const windowDays = tier.to === Number.POSITIVE_INFINITY
      ? remainingDays
      : tierWindow(tier.from, tier.to, tier.from, tier.to);

    const chargedDays = Math.min(remainingDays, windowDays);
    rent += chargedDays * tier.rate;
    remainingDays -= chargedDays;
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

module.exports = { calculateRent, getEffectiveRate, validateRentalTierConfig };
