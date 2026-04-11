const cron = require("node-cron");
const prisma = require("../lib/prisma");

function startOverdueCylinderScheduler() {
  return cron.schedule(
    "0 1 * * *",
    async () => {
      try {
        const thresholdSetting = await prisma.companySetting.findUnique({
          where: { key: "overdue_threshold_days" },
        });

        const thresholdDays = Math.max(1, Number(thresholdSetting?.value) || 30);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - thresholdDays);

        await prisma.$transaction([
          prisma.cylinderHolding.updateMany({
            where: {
              status: "HOLDING",
              issuedAt: { lt: cutoffDate },
            },
            data: { isOverdue: true },
          }),
          prisma.cylinderHolding.updateMany({
            where: {
              status: "HOLDING",
              issuedAt: { gte: cutoffDate },
            },
            data: { isOverdue: false },
          }),
        ]);
      } catch (err) {
        console.error("Overdue scheduler failed:", err.message);
      }
    },
    {
      timezone: "Asia/Kolkata",
    }
  );
}

module.exports = {
  startOverdueCylinderScheduler,
};
