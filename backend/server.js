require('dotenv').config({ override: true });
const express = require('express');
const cors = require('cors');
const { globalErrorHandler } = require('./src/middleware/errorHandler');
const { startOverdueCylinderScheduler } = require('./src/services/overdueScheduler');
const authRoutes = require('./src/routes/auth');
const customerRoutes = require('./src/routes/customers');
const cylinderRoutes = require('./src/routes/cylinders');
const gasTypeRoutes = require('./src/routes/gasTypes');
const areaRoutes = require('./src/routes/areas');
const rateListRoutes = require('./src/routes/rateList');
const orderRoutes = require('./src/routes/orders');
const transactionRoutes = require('./src/routes/transactions');
const ecrRoutes = require('./src/routes/ecr');
const challanRoutes = require('./src/routes/challans');
const billsRoutes = require('./src/routes/bills');
const ledgerRoutes = require('./src/routes/ledger');
const paymentsRoutes = require('./src/routes/payments');
const dashboardRoutes = require('./src/routes/dashboard');
const reportsRoutes = require('./src/routes/reports');
const settingsRoutes = require('./src/routes/settings');
const usersRoutes = require('./src/routes/users');
const alertsRoutes = require('./src/routes/alerts');
const transfersRoutes = require('./src/routes/transfers');

const app = express();
const PORT = 8001;

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Gas Cylinder Management System API',
    status: 'running',
    docs: '/api/',
  });
});

app.get('/api/', (req, res) => {
  res.json({ message: 'Gas Cylinder Management System API', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Chrome DevTools sometimes probes this path on local servers.
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.status(204).end();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/cylinders', cylinderRoutes);
app.use('/api/gas-types', gasTypeRoutes);
app.use('/api/areas', areaRoutes);
app.use('/api/rate-list', rateListRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/ecr', ecrRoutes);
app.use('/api/challans', challanRoutes);
app.use('/api/bills', billsRoutes);
app.use('/api/ledger', ledgerRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/alerts', alertsRoutes);
app.use('/api/transfers', transfersRoutes);

app.use(globalErrorHandler);

startOverdueCylinderScheduler();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
