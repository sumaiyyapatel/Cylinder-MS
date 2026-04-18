require('dotenv').config();
(async function(){
  const prisma = require('./src/lib/prisma');
  try {
    console.log('Creating cylinder CYL-TEST-001');
    await prisma.cylinder.create({ data: { ownerCode: 'TEST', cylinderNumber: 'CYL-TEST-001', gasCode: 'OXY', capacity: 1 } });
    console.log('Created cylinder');
  } catch (e) {
    console.error('ERROR', e.message);
  } finally {
    await prisma.$disconnect();
  }
})();
