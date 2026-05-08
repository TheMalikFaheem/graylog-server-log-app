# Graylog Express App

> Production-ready **Node.js + Express** application with structured logging via **Winston** and **Graylog GELF UDP** transport, managed by **PM2**, and served through **Nginx** with full TLS.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Quick Start (Local Development)](#quick-start-local-development)
4. [Environment Variables](#environment-variables)
5. [API Endpoints](#api-endpoints)
6. [Logging Design](#logging-design)
7. [Security Features](#security-features)
8. [Deployment](#deployment)
9. [References](#references)

---

## Architecture Overview

```
Internet
   │
   ▼
[Nginx :443]  ── TLS termination, security headers, gzip
   │
   ▼ reverse proxy (127.0.0.1:3000)
[PM2 Cluster]  ── N workers (one per CPU core), auto-restart
   │
   ▼
[Express App]  ── Helmet, rate-limit, CORS, compression
   │
   ├── Winston Console  ──► stdout / PM2 logs
   ├── Winston File     ──► logs/combined.log  +  logs/error.log
   └── Winston GELF     ──► UDP → Graylog :12201
```

---

## Project Structure

```
graylog-server-setup/
├── src/
│   ├── app.js              # Express entry point
│   ├── logger.js           # Winston + Graylog transport
│   ├── routes/
│   │   └── index.js        # GET / | /health | /error | /warn
│   └── middleware/
│       └── index.js        # requestId, requestLogger, errorHandler, notFoundHandler
├── nginx/
│   └── graylog-express-app.conf   # Full Nginx server block
├── logs/                   # Created at runtime (gitignored)
├── ecosystem.config.js     # PM2 cluster config
├── package.json
├── .env.example
├── README.md
├── deployment.md
└── troubleshooting.md
```

---

## Quick Start (Local Development)

```bash
# 1. Clone / navigate to the project
cd graylog-server-setup

# 2. Install dependencies
npm install

# 3. Copy environment file and edit values
cp .env.example .env
nano .env          # set GRAYLOG_HOST, etc.

# 4. Create log directory
mkdir -p logs

# 5. Start in development mode (auto-reload)
npm run dev

# 6. Test
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/warn
curl http://localhost:3000/error
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `production` \| `development` |
| `PORT` | `3000` | Port Express listens on |
| `APP_NAME` | `graylog-express-app` | Appears in every GELF message |
| `SERVER_NAME` | `os.hostname()` | Appears in every GELF message |
| `GRAYLOG_HOST` | *(required)* | IP / hostname of Graylog server |
| `GRAYLOG_PORT` | `12201` | Graylog GELF UDP input port |
| `CORS_ORIGIN` | `*` | Comma-separated allowed origins |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |

---

## API Endpoints

| Method | Path | Description | Expected log level |
|---|---|---|---|
| `GET` | `/` | Home – returns app info | `info` |
| `GET` | `/health` | Health check with uptime/memory | `debug` |
| `GET` | `/warn` | Generates a test warning log | `warn` |
| `GET` | `/error` | Throws a 500 – tests error pipeline | `error` |

---

## Logging Design

Every log message sent to Graylog carries these fields:

| GELF field | Source |
|---|---|
| `short_message` | Log message string |
| `level` | Winston level (mapped to syslog severity) |
| `timestamp` | ISO 8601 |
| `host` | `SERVER_NAME` env var |
| `_app` | `APP_NAME` |
| `_environment` | `NODE_ENV` |
| `_request_id` | UUID per request |
| `_method` | HTTP method |
| `_url` | Request path |
| `_ip` | Client IP |
| `_status_code` | HTTP status |
| `_response_time_ms` | Milliseconds |
| `_user_agent` | UA string |

---

## Security Features

- **Helmet** – sets 15+ security headers
- **HSTS** – 1-year max-age with preload
- **Rate limiting** – 100 req / 15 min per IP
- **CORS** – configurable via env
- **`x-powered-by` removed** – hides Express fingerprint
- **Nginx TLS 1.2/1.3** – PFS ciphers only
- **OCSP stapling** – reduces TLS handshake latency
- **UFW firewall** – only 22/80/443 open externally
- **Non-root PM2 user** – app never runs as root

---

## Deployment

See **[deployment.md](./deployment.md)** for the full step-by-step Ubuntu 22.04 guide.

---

## References

- [Winston docs](https://github.com/winstonjs/winston)
- [winston-graylog2](https://github.com/Wizcorp/winston-graylog2)
- [PM2 docs](https://pm2.keymetrics.io/docs/)
- [Nginx docs](https://nginx.org/en/docs/)
- [Graylog GELF](https://go2docs.graylog.org/5-0/getting_in_log_data/gelf.html)
- [Certbot](https://certbot.eff.org/)
