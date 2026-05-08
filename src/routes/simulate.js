'use strict';

/**
 * /simulate/* routes
 *
 * Each route mimics a real production failure scenario so you can
 * see exactly how those events look inside Graylog.
 *
 * Hit them with:
 *   curl http://157.245.138.153/simulate/<scenario>
 */

const express = require('express');
const logger = require('../logger');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// 1. DATABASE CONNECTION FAILURE
//    What you'd see when MongoDB / PostgreSQL / MySQL goes down.
// ─────────────────────────────────────────────────────────────
router.get('/db-crash', (req, res, next) => {
  const reqLog = logger.fromRequest(req);

  reqLog.info('Attempting database connection', { db_host: 'db.internal', db_port: 5432 });

  // Simulate connection timeout after ~100ms
  setTimeout(() => {
    reqLog.error('Database connection failed', {
      scenario: 'db-crash',
      db_host: 'db.internal',
      db_port: 5432,
      db_name: 'app_production',
      error_code: 'ECONNREFUSED',
      error_message: 'connect ECONNREFUSED 10.0.0.5:5432',
      retry_attempt: 3,
      max_retries: 3,
      alert: 'DATABASE_DOWN',
    });

    const err = new Error('Database connection refused after 3 retries');
    err.status = 503;
    next(err);
  }, 100);
});

// ─────────────────────────────────────────────────────────────
// 2. SERVER CRASH / OUT OF MEMORY
//    What you'd see before Node.js runs out of heap memory.
// ─────────────────────────────────────────────────────────────
router.get('/memory-spike', (req, res) => {
  const reqLog = logger.fromRequest(req);
  const before = process.memoryUsage();

  // Allocate a large temporary buffer (50 MB) to spike memory
  const spike = Buffer.alloc(50 * 1024 * 1024);
  const after = process.memoryUsage();

  reqLog.warn('Memory spike detected', {
    scenario: 'memory-spike',
    alert: 'HIGH_MEMORY_USAGE',
    heap_used_before_mb: Math.round(before.heapUsed / 1024 / 1024),
    heap_used_after_mb: Math.round(after.heapUsed / 1024 / 1024),
    rss_mb: Math.round(after.rss / 1024 / 1024),
    threshold_mb: 400,
    action: 'PM2 will auto-restart at 512MB',
  });

  // Free the buffer
  spike.fill(0);

  reqLog.info('Memory released after spike', {
    heap_used_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
  });

  res.json({
    success: true,
    message: 'Memory spike simulated. Check Graylog for WARN alert.',
    before_mb: Math.round(before.heapUsed / 1024 / 1024),
    after_mb: Math.round(after.heapUsed / 1024 / 1024),
  });
});

// ─────────────────────────────────────────────────────────────
// 3. SLOW EXTERNAL API (e.g. payment gateway, SMS provider)
//    What you'd see when a third-party API is timing out.
// ─────────────────────────────────────────────────────────────
router.get('/slow-api', (req, res) => {
  const reqLog = logger.fromRequest(req);
  const apiStartTime = Date.now();

  reqLog.info('Calling external payment API', {
    scenario: 'slow-api',
    external_service: 'stripe-api',
    endpoint: 'https://api.stripe.com/v1/charges',
    timeout_ms: 5000,
  });

  // Simulate a 3-second slow API response
  setTimeout(() => {
    const duration = Date.now() - apiStartTime;

    reqLog.warn('External API responded slowly', {
      scenario: 'slow-api',
      alert: 'SLOW_THIRD_PARTY_API',
      external_service: 'stripe-api',
      response_time_ms: duration,
      sla_threshold_ms: 500,
      exceeded_by_ms: duration - 500,
      action: 'Consider caching or circuit breaker pattern',
    });

    res.json({
      success: true,
      message: `Simulated slow API call took ${duration}ms. Check Graylog for WARN.`,
      response_time_ms: duration,
    });
  }, 3000);
});

// ─────────────────────────────────────────────────────────────
// 4. UNAUTHORIZED ACCESS ATTEMPT
//    What you'd see when someone tries to access a protected
//    route without a valid token (brute force, scraping, etc.)
// ─────────────────────────────────────────────────────────────
router.get('/auth-fail', (req, res) => {
  const reqLog = logger.fromRequest(req);
  const authHeader = req.headers.authorization;

  reqLog.warn('Unauthorized access attempt detected', {
    scenario: 'auth-fail',
    alert: 'UNAUTHORIZED_ACCESS',
    provided_token: authHeader ? authHeader.substring(0, 20) + '...' : 'NONE',
    required: 'Bearer <valid-jwt>',
    ip: req.ip,
    user_agent: req.headers['user-agent'],
    action: 'Block IP after 5 attempts',
  });

  res.status(401).json({
    success: false,
    error: { message: 'Unauthorized. Valid Bearer token required.' },
    request_id: req.id,
  });
});

// ─────────────────────────────────────────────────────────────
// 5. DISK FULL / LOG WRITE FAILURE
//    What you'd see when the server runs out of disk space.
// ─────────────────────────────────────────────────────────────
router.get('/disk-full', (req, res) => {
  const reqLog = logger.fromRequest(req);

  reqLog.error('Disk write failed — disk full', {
    scenario: 'disk-full',
    alert: 'DISK_FULL',
    disk_path: '/var/log',
    disk_used_percent: 98,
    disk_free_mb: 12,
    error_code: 'ENOSPC',
    error_message: 'ENOSPC: no space left on device',
    action: 'IMMEDIATE: Clear old logs or expand disk volume',
  });

  reqLog.warn('Falling back to in-memory log buffer', {
    scenario: 'disk-full',
    buffer_size_limit: 1000,
    current_buffer_size: 847,
  });

  res.json({
    success: true,
    message: 'Disk full scenario logged. Check Graylog for ERROR + WARN.',
  });
});

// ─────────────────────────────────────────────────────────────
// 6. DOWNTIME RECOVERY / SERVER RESTART
//    What you'd see when PM2 restarts your app after a crash.
// ─────────────────────────────────────────────────────────────
router.get('/server-restart', (req, res) => {
  const reqLog = logger.fromRequest(req);

  reqLog.warn('Application restarted by PM2', {
    scenario: 'server-restart',
    alert: 'APP_RESTART',
    restart_reason: 'max_memory_exceeded',
    memory_at_crash_mb: 514,
    memory_limit_mb: 512,
    uptime_before_crash_seconds: 3600,
    restart_count: 2,
    pm2_restart_policy: 'always',
    action: 'Investigate memory leak in /api/reports route',
  });

  reqLog.info('Application recovered successfully', {
    scenario: 'server-restart',
    status: 'RECOVERED',
    new_pid: process.pid,
    recovery_time_seconds: 4,
  });

  res.json({
    success: true,
    message: 'Server restart scenario logged. Check Graylog for WARN + INFO.',
  });
});

// ─────────────────────────────────────────────────────────────
// 7. FAILED USER LOGIN (security audit trail)
//    What you'd log for failed login attempts — vital for
//    detecting brute force / credential stuffing attacks.
// ─────────────────────────────────────────────────────────────
router.get('/login-fail', (req, res) => {
  const reqLog = logger.fromRequest(req);

  reqLog.warn('Failed login attempt', {
    scenario: 'login-fail',
    alert: 'FAILED_LOGIN',
    email: 'user@example.com',
    ip: req.ip,
    attempt_number: 4,
    max_attempts: 5,
    lockout_after: '1 more failure',
    user_agent: req.headers['user-agent'],
    geo_location: 'Unknown / Suspicious IP',
    action: 'Send security alert email to user',
  });

  res.status(401).json({
    success: false,
    error: { message: 'Invalid email or password. 1 attempt remaining.' },
    request_id: req.id,
  });
});

// ─────────────────────────────────────────────────────────────
// 8. PAYMENT FAILURE
//    What you'd log when a payment is declined.
// ─────────────────────────────────────────────────────────────
router.get('/payment-fail', (req, res) => {
  const reqLog = logger.fromRequest(req);

  reqLog.error('Payment processing failed', {
    scenario: 'payment-fail',
    alert: 'PAYMENT_FAILED',
    order_id: 'ORD-98234',
    amount_usd: 149.99,
    currency: 'USD',
    payment_gateway: 'stripe',
    decline_code: 'insufficient_funds',
    card_last4: '4242',
    customer_id: 'cus_ABC123',
    retry_eligible: true,
    action: 'Notify customer via email. Queue retry in 24h.',
  });

  res.status(402).json({
    success: false,
    error: { message: 'Payment declined. Please check your card details.' },
    request_id: req.id,
  });
});

// ─────────────────────────────────────────────────────────────
// 9. HIGH CPU / INFINITE LOOP WARNING
//    What you'd see when a bug causes a CPU spike.
// ─────────────────────────────────────────────────────────────
router.get('/cpu-spike', (req, res) => {
  const reqLog = logger.fromRequest(req);

  reqLog.warn('High CPU usage detected', {
    scenario: 'cpu-spike',
    alert: 'HIGH_CPU',
    cpu_percent: 94,
    threshold_percent: 80,
    suspected_cause: 'Unoptimized DB query in /api/reports',
    process_pid: process.pid,
    action: 'PM2 will restart if CPU stays above 90% for 30s',
  });

  // Actually spike CPU for ~500ms so you see the timing effect
  const end = Date.now() + 500;
  while (Date.now() < end) { /* intentional busy wait */ }

  reqLog.info('CPU spike resolved', {
    scenario: 'cpu-spike',
    duration_ms: 500,
    cpu_after_percent: 12,
  });

  res.json({
    success: true,
    message: 'CPU spike simulated for 500ms. Check Graylog for WARN.',
  });
});

// ─────────────────────────────────────────────────────────────
// 10. RUN ALL SCENARIOS AT ONCE
// ─────────────────────────────────────────────────────────────
router.get('/all', (req, res) => {
  const reqLog = logger.fromRequest(req);

  const scenarios = [
    { name: 'disk-full',      level: 'error', alert: 'DISK_FULL',           message: 'Disk write failed — disk full' },
    { name: 'payment-fail',   level: 'error', alert: 'PAYMENT_FAILED',      message: 'Payment processing failed' },
    { name: 'db-timeout',     level: 'error', alert: 'DATABASE_TIMEOUT',    message: 'Database query timed out after 30s' },
    { name: 'memory-spike',   level: 'warn',  alert: 'HIGH_MEMORY_USAGE',   message: 'Memory usage at 89% of limit' },
    { name: 'slow-api',       level: 'warn',  alert: 'SLOW_THIRD_PARTY_API',message: 'Stripe API responded in 4200ms' },
    { name: 'auth-fail',      level: 'warn',  alert: 'UNAUTHORIZED_ACCESS', message: 'Unauthorized access attempt' },
    { name: 'login-fail',     level: 'warn',  alert: 'FAILED_LOGIN',        message: 'Failed login — 4 attempts' },
    { name: 'server-restart', level: 'warn',  alert: 'APP_RESTART',         message: 'App restarted by PM2' },
    { name: 'user-signup',    level: 'info',  alert: null,                  message: 'New user registered successfully' },
    { name: 'cache-hit',      level: 'debug', alert: null,                  message: 'Cache hit for /api/products' },
  ];

  scenarios.forEach(({ name, level, alert, message }) => {
    const meta = { scenario: name };
    if (alert) meta.alert = alert;
    reqLog[level](message, meta);
  });

  reqLog.info('All simulation scenarios fired', {
    scenario: 'all',
    total_logs_generated: scenarios.length,
  });

  res.json({
    success: true,
    message: `${scenarios.length} real-life scenarios logged. Check Graylog now!`,
    scenarios: scenarios.map(s => s.name),
  });
});

module.exports = router;
