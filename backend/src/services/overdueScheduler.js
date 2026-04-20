const cron = require("node-cron");
const prisma = require("../lib/prisma");
const { markOverdueCylinders } = require('./hydroService');

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

        // First, update overdue status
        await prisma.$transaction([
          prisma.cylinderHolding.updateMany({
            where: {
              status: { in: ["HOLDING", "BILLED"] },
              issuedAt: { lt: cutoffDate },
            },
            data: { isOverdue: true },
          }),
          prisma.cylinderHolding.updateMany({
            where: {
              status: { in: ["HOLDING", "BILLED"] },
              issuedAt: { gte: cutoffDate },
            },
            data: { isOverdue: false },
          }),
        ]);

        // Now create alerts for newly overdue holdings
        const newlyOverdueHoldings = await prisma.cylinderHolding.findMany({
          where: {
            status: { in: ["HOLDING", "BILLED"] },
            isOverdue: true,
            alertSentAt: null, // Only create alerts for holdings that don't have alerts yet
          },
          include: {
            cylinder: { select: { cylinderNumber: true } },
          },
        });

        if (newlyOverdueHoldings.length > 0) {
          const alertData = newlyOverdueHoldings.map(h => {
            const days = Math.ceil((new Date() - new Date(h.issuedAt)) / (1000 * 60 * 60 * 24));
            return {
              type: 'OVERDUE_CYLINDER',
              customerId: h.customerId,
              cylinderId: h.cylinderId,
              message: `Cylinder ${h.cylinder?.cylinderNumber || 'Unknown'} held for ${days} days`,
              sentVia: 'SYSTEM',
            };
          });

          await prisma.alert.createMany({
            data: alertData,
          });

          // Mark that alerts were sent for these holdings
          await prisma.cylinderHolding.updateMany({
            where: {
              id: { in: newlyOverdueHoldings.map(h => h.id) },
            },
            data: {
              alertSentAt: new Date(),
            },
          });

          // Send WhatsApp overdue alerts (best-effort)
          try {
            const whatsappService = require('./whatsappService');
            for (const h of newlyOverdueHoldings) {
              const days = Math.ceil((new Date() - new Date(h.issuedAt)) / (1000 * 60 * 60 * 24));
              try {
                await whatsappService.sendOverdueAlert(h.customerId, h.cylinder?.cylinderNumber, days);
              } catch (err) {
                console.error('WhatsApp overdue send error for holding', h.id, err.message || err);
              }
            }
          } catch (err) {
            console.warn('WhatsApp service not available or failed:', err.message || err);
          }
        }
        // Also check for hydro test due cylinders and create alerts
        try {
          await markOverdueCylinders(prisma);
        } catch (err) {
          console.error('Hydro due check failed:', err.message);
        }
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
