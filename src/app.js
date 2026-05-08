'use strict';

// ─── Load environment variables first ────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const logger = require('./logger');
const routes = require('./routes');
const {
  requestId,
  requestLogger,
  errorHandler,
  notFoundHandler,
} = require('./middleware');

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '3000', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);

// ──────────────────────────────────────────────
// Express App
// ──────────────────────────────────────────────
const app = express();

// ── Security headers ──────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
}));

// Hide X-Powered-By header
app.disable('x-powered-by');

// ── CORS ──────────────────────────────────────
app.use(cors({
  origin: CORS_ORIGIN === '*' ? '*' : CORS_ORIGIN.split(',').map(o => o.trim()),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
}));

// ── Compression ───────────────────────────────
app.use(compression());

// ── Body parsers ──────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Rate limiting ─────────────────────────────
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many requests. Please try again later.' },
  },
  handler(req, res, next, options) {
    logger.fromRequest(req).warn('Rate limit exceeded', {
      limit: RATE_LIMIT_MAX,
      window_ms: RATE_LIMIT_WINDOW_MS,
    });
    res.status(options.statusCode).json(options.message);
  },
});
app.use(limiter);

// ── Trust proxy (required when behind Nginx) ──
app.set('trust proxy', 1);

// ── Request lifecycle middleware ───────────────
app.use(requestId);
app.use(requestLogger);

// ── Application routes ────────────────────────
app.use('/', routes);

// ── 404 catch-all ─────────────────────────────
app.use(notFoundHandler);

// ── Centralised error handler ─────────────────
app.use(errorHandler);

// ──────────────────────────────────────────────
// Start server
// ──────────────────────────────────────────────
const server = app.listen(PORT, '0.0.0.0', () => {
  logger.info('Express server started', {
    port: PORT,
    environment: process.env.NODE_ENV,
    pid: process.pid,
    node_version: process.version,
  });
});

// ──────────────────────────────────────────────
// Graceful shutdown handlers
// ──────────────────────────────────────────────
function gracefulShutdown(signal) {
  logger.warn(`Received ${signal} – initiating graceful shutdown`);

  server.close((err) => {
    if (err) {
      logger.error('Error during server shutdown', { error: err.message });
      process.exit(1);
    }
    logger.info('Server closed cleanly. Exiting.');
    process.exit(0);
  });

  // Force-kill after 10 s if still not closed
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled promise rejection', { reason: String(reason) });
  process.exit(1);
});

module.exports = app; // exported for testing
