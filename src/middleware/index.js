'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

// ──────────────────────────────────────────────
// 1. Request-ID injection
//    Attaches a unique UUID to every request so all
//    log lines for a single request share one ID.
// ──────────────────────────────────────────────
function requestId(req, res, next) {
  req.id = uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
}

// ──────────────────────────────────────────────
// 2. HTTP request logger (replaces morgan)
//    Logs entry + exit of every HTTP request with
//    timing, status code, and structured fields.
// ──────────────────────────────────────────────
function requestLogger(req, res, next) {
  const startAt = process.hrtime.bigint();

  // Log request entry
  logger.fromRequest(req).info('HTTP request received', {
    phase: 'request',
  });

  // Intercept response finish to log the result
  res.on('finish', () => {
    const durationNs = process.hrtime.bigint() - startAt;
    const durationMs = Number(durationNs) / 1e6;

    const level = res.statusCode >= 500 ? 'error'
      : res.statusCode >= 400 ? 'warn'
      : 'info';

    logger.fromRequest(req)[level]('HTTP response sent', {
      phase: 'response',
      status_code: res.statusCode,
      response_time_ms: parseFloat(durationMs.toFixed(3)),
      content_length: res.getHeader('Content-Length') || 0,
    });
  });

  next();
}

// ──────────────────────────────────────────────
// 3. Centralised error handler
//    Must be registered AFTER all routes.
// ──────────────────────────────────────────────
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const statusCode = err.status || err.statusCode || 500;

  logger.fromRequest(req).error('Unhandled application error', {
    error_name: err.name,
    error_message: err.message,
    stack: err.stack,
    status_code: statusCode,
  });

  // Never leak stack traces in production
  const body = {
    success: false,
    error: {
      message: process.env.NODE_ENV === 'production'
        ? 'An internal server error occurred.'
        : err.message,
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
    request_id: req.id,
  };

  res.status(statusCode).json(body);
}

// ──────────────────────────────────────────────
// 4. 404 handler – must come BEFORE errorHandler
// ──────────────────────────────────────────────
function notFoundHandler(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.status = 404;
  next(err);
}

module.exports = {
  requestId,
  requestLogger,
  errorHandler,
  notFoundHandler,
};
