require('dotenv').config();
const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const customerRoutes = require('./routes/customers');
const cylinderRoutes = require('./routes/cylinders');
const gasTypeRoutes = require('./routes/gasTypes');
const areaRoutes = require('./routes/areas');
const rateListRoutes = require('./routes/rateList');
const orderRoutes = require('./routes/orders');
const transactionRoutes = require('./routes/transactions');
const ecrRoutes = require('./routes/ecr');
const challanRoutes = require('./routes/challans');
const ledgerRoutes = require('./routes/ledger');
const dashboardRoutes = require('./routes/dashboard');
const reportsRoutes = require('./routes/reports');
const settingsRoutes = require('./routes/settings');
const usersRoutes = require('./routes/users');

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
app.get('/api/', (req, res) => {
  res.json({ message: 'Gas Cylinder Management System API', status: 'running' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
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
app.use('/api/ledger', ledgerRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', usersRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
