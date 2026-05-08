'use strict';

require('dotenv').config();

const os = require('os');
const dgram = require('dgram');
const winston = require('winston');
const Transport = require('winston-transport');

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
// GELF level map  (Winston level → syslog int)
// ──────────────────────────────────────────────
const GELF_LEVEL = {
  emerg: 0, alert: 1, crit: 2,
  error: 3,
  warn: 4, warning: 4,
  notice: 5,
  info: 6,
  debug: 7,
  verbose: 7, silly: 7,
};

// ──────────────────────────────────────────────
// Custom GELF UDP Winston Transport
// Uses Node's built-in dgram — zero extra deps.
// Fully GELF 1.1 compliant.
// ──────────────────────────────────────────────
class GelfUdpTransport extends Transport {
  constructor(options = {}) {
    super(options);
    this.name = 'gelf-udp';
    this.graylogHost = options.host || '127.0.0.1';
    this.graylogPort = parseInt(options.port, 10) || 12201;
    this.hostname = options.hostname || os.hostname();
    this.facility = options.facility || 'node';
    this.staticMeta = options.staticMeta || {};
  }

  log(info, callback) {
    // Tell Winston we handled the log
    setImmediate(() => this.emit('logged', info));

    try {
      const level = info[Symbol.for('level')] || 'info';
      const gelfLevel = GELF_LEVEL[level] !== undefined ? GELF_LEVEL[level] : 6;

      // Destructure known fields; everything else goes as _field
      const {
        message,
        timestamp,
        stack,
        level: _lvl, // already captured above
        splat: _splat,
        ...meta
      } = info;

      const gelfMsg = {
        version: '1.1',
        host: this.hostname,
        short_message: String(message || '').substring(0, 200),
        full_message: stack || String(message || ''),
        timestamp: timestamp
          ? Date.parse(timestamp) / 1000
          : Date.now() / 1000,
        level: gelfLevel,
        facility: this.facility,
      };

      // Static metadata (prefixed with _)
      for (const [k, v] of Object.entries(this.staticMeta)) {
        gelfMsg[`_${k}`] = v;
      }

      // Dynamic metadata from the log call
      for (const [k, v] of Object.entries(meta)) {
        if (v === undefined || k === 'id') continue;
        const key = k.startsWith('_') ? k : `_${k}`;
        gelfMsg[key] = v !== null && typeof v === 'object'
          ? JSON.stringify(v)
          : v;
      }

      const payload = Buffer.from(JSON.stringify(gelfMsg));

      // UDP is fire-and-forget — create socket, send, close
      const client = dgram.createSocket('udp4');
      client.send(payload, 0, payload.length, this.graylogPort, this.graylogHost, (err) => {
        client.close();
        if (err) {
          // Don't crash the app — just emit a warning
          process.stderr.write(`[GelfUdpTransport] send error: ${err.message}\n`);
        }
      });
    } catch (err) {
      process.stderr.write(`[GelfUdpTransport] unexpected error: ${err.message}\n`);
    }

    callback();
  }
}

// ──────────────────────────────────────────────
// Console format
// ──────────────────────────────────────────────
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? ` | ${JSON.stringify(meta)}`
      : '';
    return `[${timestamp}] ${level}: ${message}${metaStr}`;
  })
);

// ──────────────────────────────────────────────
// JSON format (file + GELF)
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

// 1. Console — always on
transports.push(
  new winston.transports.Console({
    level: IS_PRODUCTION ? 'info' : 'debug',
    format: consoleFormat,
  })
);

// 2. File transports
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
    maxsize: 10 * 1024 * 1024,
    maxFiles: 10,
    tailable: true,
  })
);

// 3. Graylog GELF UDP — custom built-in transport
const graylogPort = parseInt(GRAYLOG_PORT, 10);
const graylogEnabled = GRAYLOG_HOST && GRAYLOG_HOST !== 'YOUR_GRAYLOG_SERVER_IP';

if (graylogEnabled) {
  transports.push(
    new GelfUdpTransport({
      level: 'debug',
      host: GRAYLOG_HOST,
      port: graylogPort,
      hostname: SERVER_NAME,
      facility: APP_NAME,
      staticMeta: {
        app: APP_NAME,
        environment: NODE_ENV,
        server_name: SERVER_NAME,
        node_version: process.version,
      },
    })
  );
  console.info(
    `[Logger] Graylog GELF/UDP transport enabled → udp://${GRAYLOG_HOST}:${graylogPort}`
  );
} else {
  console.warn('[Logger] GRAYLOG_HOST not configured – Graylog transport disabled.');
}

// ──────────────────────────────────────────────
// Winston logger instance
// ──────────────────────────────────────────────
const logger = winston.createLogger({
  level: IS_PRODUCTION ? 'info' : 'debug',
  defaultMeta: {
    app: APP_NAME,
    environment: NODE_ENV,
    hostname: SERVER_NAME,
  },
  transports,
  exitOnError: false,
});

// ──────────────────────────────────────────────
// Helper — child logger pre-populated with HTTP context
// ──────────────────────────────────────────────
logger.fromRequest = function fromRequest(req) {
  return logger.child({
    request_id: req.id,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || (req.connection && req.connection.remoteAddress),
    user_agent: req.headers['user-agent'],
  });
};

module.exports = logger;
