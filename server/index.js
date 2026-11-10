// server/index.js
const express = require('express');
const path = require('node:path');
const cookieParser = require('cookie-parser');
const cors = require('cors');

const authModule = require('./auth');
const billingRouter = require('./billing');
const flatsRouter = require('./flats');
const settingsRouter = require('./settings');
const backupModule = require('./backup');
const { logAudit } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Parsing Middlewares
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path.startsWith('/api')) {
      console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path} ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.use('/api/auth', authModule.router);
app.use('/api/billing', billingRouter);
app.use('/api/flats', flatsRouter);
app.use('/api/settings', settingsRouter);
app.use('/api/backup', backupModule.router);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    property: 'TazMohal-3',
    version: '2.0.0'
  });
});

// Serve root directory first (preserves original interface)
app.use(express.static(path.join(__dirname, '../')));

// Also serve public directory as fallback
app.use(express.static(path.join(__dirname, '../public')));

// Global 404 Handler for APIs
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Auto-run daily snapshot in background if server stays alive
setInterval(() => {
  try {
    console.log('[Auto-Backup] Executing scheduled database snapshot...');
    backupModule.performBackup();
  } catch (err) {
    console.error('[Auto-Backup] Error:', err.message);
  }
}, 24 * 60 * 60 * 1000); // 24 hours

// Start server
const server = app.listen(PORT, () => {
  console.log('==================================================');
  console.log(` TazMohal-3 Billing System v2.0 is running!`);
  console.log(` Local URL: http://localhost:${PORT}`);
  console.log(` API Endpoint: http://localhost:${PORT}/api/health`);
  console.log('==================================================');
  logAudit('SERVER_START', `Server started on port ${PORT}`, 'system');
});

module.exports = { app, server };

