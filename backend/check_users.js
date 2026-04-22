const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    select: {
      username: true,
      role: true,
      isActive: true,
      failedAttempts: true,
      lockedUntil: true
    }
  });
  console.log('Database Users:');
  console.log(JSON.stringify(users, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
