// ecosystem.config.js – PM2 process manager configuration
// Docs: https://pm2.keymetrics.io/docs/usage/application-declaration/

module.exports = {
  apps: [
    {
      // ── Identity ──────────────────────────────
      name: 'graylog-express-app',
      script: './src/app.js',
      cwd: '/var/www/graylog-express-app', // absolute path on the Ubuntu server

      // ── Clustering ───────────────────────────
      // 'max' = one worker per logical CPU core
      instances: 'max',
      exec_mode: 'cluster',

      // ── Environment ──────────────────────────
      // NODE_ENV defaults here; override per-env below
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // The actual secrets (GRAYLOG_HOST etc.) live in .env
        // PM2 reads .env automatically when node dotenv is loaded in app.
      },

      // ── Restart policy ───────────────────────
      watch: false,               // never watch in production
      autorestart: true,
      max_restarts: 10,           // PM2 stops retrying after 10 fast crashes
      min_uptime: '5s',           // must stay up 5 s to count as "started"
      restart_delay: 3000,        // wait 3 s between restarts (ms)
      max_memory_restart: '512M', // auto-restart if RSS exceeds 512 MB

      // ── Logging ──────────────────────────────
      // stdout/stderr go here; Winston also writes to logs/
      out_file: '/var/log/pm2/graylog-express-app-out.log',
      error_file: '/var/log/pm2/graylog-express-app-err.log',
      merge_logs: true,           // merge cluster worker logs into one file
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // ── Log rotation (requires pm2-logrotate module) ──
      // Install once: pm2 install pm2-logrotate
      // These env vars are read by pm2-logrotate:
      // PM2_LOGROTATE_RETAIN=7
      // PM2_LOGROTATE_COMPRESS=true
      // PM2_LOGROTATE_SIZE=10M

      // ── Health & monitoring ───────────────────
      // PM2+ dashboard integration (optional, requires pm2 link)
      // pmx: true,

      // ── Signals ──────────────────────────────
      kill_timeout: 10000,        // ms to wait before SIGKILL after SIGTERM
      listen_timeout: 8000,       // ms to wait for app to be "online"
      shutdown_with_message: true,

      // ── Source maps ──────────────────────────
      source_map_support: false,

      // ── Node.js flags ────────────────────────
      node_args: '--max-old-space-size=512',

      // ── Cron restart (optional) ──────────────
      // Uncomment to restart every day at 03:00 AM (useful for log rotation)
      // cron_restart: '0 3 * * *',
    },
  ],
};
