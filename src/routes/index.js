'use strict';

const express = require('express');
const logger = require('../logger');

const router = express.Router();

// ──────────────────────────────────────────────
// GET /
// ──────────────────────────────────────────────
router.get('/', (req, res) => {
  logger.fromRequest(req).info('Home route accessed', {
    route: 'home',
  });

  res.json({
    success: true,
    message: 'Graylog Express App is running 🚀',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
    request_id: req.id,
  });
});

// ──────────────────────────────────────────────
// GET /health
// ──────────────────────────────────────────────
router.get('/health', (req, res) => {
  const healthPayload = {
    status: 'healthy',
    uptime_seconds: Math.round(process.uptime()),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    node_version: process.version,
    environment: process.env.NODE_ENV,
  };

  logger.fromRequest(req).debug('Health check performed', healthPayload);

  res.json({ success: true, ...healthPayload });
});

// ──────────────────────────────────────────────
// GET /error  – intentionally throws to test
//               the error handler + Graylog flow
// ──────────────────────────────────────────────
router.get('/error', (req, res, next) => {
  logger.fromRequest(req).warn('Test error route triggered intentionally', {
    route: 'error-test',
  });

  const err = new Error('This is a test error to verify Graylog logging.');
  err.status = 500;
  next(err); // hand off to centralised error handler
});

// ──────────────────────────────────────────────
// GET /warn – generates a warning log
// ──────────────────────────────────────────────
router.get('/warn', (req, res) => {
  logger.fromRequest(req).warn('Test warning log generated', {
    route: 'warn-test',
    note: 'This is a deliberate warning for Graylog stream testing.',
  });

  res.json({
    success: true,
    message: 'Warning log generated. Check Graylog.',
    request_id: req.id,
  });
});

module.exports = router;
