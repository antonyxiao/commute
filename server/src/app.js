const express = require('express');
const cors = require('cors');
const compression = require('compression');
const apiRoutes = require('./routes/api');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(compression());
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'no-referrer');
  next();
});

// Live transit data should never be cached by browsers or proxies.
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
}, apiRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// JSON 404 for unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(`[${req.method} ${req.originalUrl}]`, err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
