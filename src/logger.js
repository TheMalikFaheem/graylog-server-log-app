'use strict';

require('dotenv').config();

const os = require('os');
const winston = require('winston');
const WinstonGraylog2 = require('winston-graylog2');

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────
const {
  NODE_ENV = 'development',
  GRAYLOG_HOST = '127.0.0.1',
  GRAYLOG_PORT = '12201',
  APP_NAME = 'graylog-express-app',
  SERVER_NAME = os.hostname(),
} = process.env;

const IS_PRODUCTION = NODE_ENV === 'production';

// ──────────────────────────────────────────────
// Custom log format for console output
// ──────────────────────────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// ──────────────────────────────────────────────
// JSON format for file / GELF transport
// ──────────────────────────────────────────────
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// ──────────────────────────────────────────────
// Transports
// ──────────────────────────────────────────────
const transports = [];

// 1. Console – always on
transports.push(
  new winston.transports.Console({
    level: IS_PRODUCTION ? 'info' : 'debug',
    format: consoleFormat,
  })
);

// 2. File transports (combined + error-only)
transports.push(
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: jsonFormat,
    maxsize: 10 * 1024 * 1024, // 10 MB
    maxFiles: 5,
    tailable: true,
  }),
  new winston.transports.File({
    filename: 'logs/combined.log',
    level: 'debug',
    format: jsonFormat,
    maxsize: 10 * 1024 * 1024, // 10 MB
    maxFiles: 10,
    tailable: true,
  })
);

// 3. Graylog GELF UDP transport
//    Falls back gracefully if GRAYLOG_HOST is not configured.
const graylogPort = parseInt(GRAYLOG_PORT, 10);

if (GRAYLOG_HOST && GRAYLOG_HOST !== 'YOUR_GRAYLOG_SERVER_IP') {
  transports.push(
    new WinstonGraylog2({
      name: 'graylog',
      level: 'debug', // send ALL levels to Graylog; filter in Graylog streams
      silent: false,
      handleExceptions: true,
      graylog: {
        servers: [{ host: GRAYLOG_HOST, port: graylogPort }],
        hostname: SERVER_NAME,
        facility: APP_NAME,
        bufferSize: 1400,
      },
      // Additional static fields appended to every GELF message
      staticMeta: {
        app: APP_NAME,
        environment: NODE_ENV,
        server_name: SERVER_NAME,
        node_version: process.version,
      },
    })
  );
  console.info(`[Logger] Graylog GELF transport enabled → udp://${GRAYLOG_HOST}:${graylogPort}`);
} else {
  console.warn('[Logger] GRAYLOG_HOST not configured – Graylog transport disabled.');
}

// ──────────────────────────────────────────────
// Create the Winston logger instance
// ──────────────────────────────────────────────
const logger = winston.createLogger({
  level: IS_PRODUCTION ? 'info' : 'debug',
  defaultMeta: {
    app: APP_NAME,
    environment: NODE_ENV,
    hostname: SERVER_NAME,
  },
  transports,
  exitOnError: false, // do not crash on handled exceptions
});

// ──────────────────────────────────────────────
// Convenience helper – attach request context
// ──────────────────────────────────────────────
/**
 * Returns a child logger pre-populated with HTTP request fields.
 *
 * @param {import('express').Request} req
 * @returns {winston.Logger}
 */
logger.fromRequest = function fromRequest(req) {
  return logger.child({
    request_id: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    user_agent: req.headers['user-agent'],
  });
};

module.exports = logger;
