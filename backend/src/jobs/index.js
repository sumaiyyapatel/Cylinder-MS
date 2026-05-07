const cron = require('node-cron');
const { runOverdueCylindersJob } = require('./overdueCylindersJob');
const { runRentalRecomputeJob } = require('./rentalRecomputeJob');
const { runStaleHoldingCleanupJob } = require('./staleHoldingCleanupJob');

function scheduleJob(expression, name, fn) {
  return cron.schedule(
    expression,
    async () => {
      try {
        const result = await fn();
        console.log(`[job:${name}]`, result);
      } catch (error) {
        console.error(`[job:${name}] failed:`, error.message || error);
      }
    },
    { timezone: 'Asia/Kolkata' }
  );
}

function startOperationsJobs() {
  return [
    scheduleJob('0 1 * * *', 'overdue-cylinders', runOverdueCylindersJob),
    scheduleJob('30 1 * * *', 'rental-recompute', runRentalRecomputeJob),
    scheduleJob('0 2 * * *', 'stale-holding-cleanup', runStaleHoldingCleanupJob),
  ];
}

module.exports = {
  runOverdueCylindersJob,
  runRentalRecomputeJob,
  runStaleHoldingCleanupJob,
  startOperationsJobs,
};
