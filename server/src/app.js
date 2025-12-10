const express = require('express');
const cors = require('cors');
const compression = require('compression');
const apiRoutes = require('./routes/api');

const app = express();

// Middleware
app.use(compression());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => res.send('OK'));

module.exports = app;
