# Graylog Alert Conditions & Curl Test Commands

> **How this works:**
> 1. Enable a **GELF HTTP Input** in Graylog (one-time setup below)
> 2. Create each **Event Definition** in Graylog UI
> 3. Use the `curl` commands to send fake log messages and verify alerts fire in Slack

---

## One-Time Setup: Enable GELF HTTP Input in Graylog

Your app currently uses **GELF/UDP**. To test with `curl`, you need GELF/HTTP enabled:

1. Graylog UI → **System** → **Inputs**
2. Select input: **GELF HTTP** → **Launch new input**
3. Port: `12201` (or `12202` if UDP is already on 12201)
4. Click **Save**

> If using Docker Compose, expose the port in your `docker-compose.yml`:
> ```yaml
> ports:
>   - "12202:12202"  # GELF HTTP
> ```

Replace `YOUR_GRAYLOG_IP` and `12202` in all curl commands below with your actual host/port.

---

## Alert 1 — Uncaught Exception (App Crash Imminent) 🔴

### Graylog Event Definition

```
Title:         App Crash - Uncaught Exception
Stream:        All messages (or your app stream)
Search Query:  short_message:"Uncaught exception" OR short_message:"Unhandled promise rejection"
Condition:     Count() > 0
Timerange:     Last 1 minute
Grace Period:  1 minute
Notification:  Slack HTTP Notification
```

### Curl to Trigger

```bash
curl -X POST http://YOUR_GRAYLOG_IP:12202/gelf \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "1.1",
    "host": "main-server",
    "short_message": "Uncaught exception",
    "full_message": "TypeError: Cannot read properties of undefined (reading 'id')\n    at /app/src/routes/index.js:42:18",
    "level": 3,
    "facility": "graylog-express-app",
    "_app": "graylog-express-app",
    "_environment": "production",
    "_error": "TypeError: Cannot read properties of undefined",
    "_stack": "at /app/src/routes/index.js:42:18"
  }'
```

---

## Alert 2 — Unhandled Promise Rejection 🔴

### Graylog Event Definition

```
Title:         App Crash - Unhandled Promise Rejection
Search Query:  short_message:"Unhandled promise rejection"
Condition:     Count() > 0
Timerange:     Last 1 minute
Grace Period:  1 minute
Notification:  Slack HTTP Notification
```

### Curl to Trigger

```bash
curl -X POST http://YOUR_GRAYLOG_IP:12202/gelf \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "1.1",
    "host": "main-server",
    "short_message": "Unhandled promise rejection",
    "level": 3,
    "facility": "graylog-express-app",
    "_app": "graylog-express-app",
    "_environment": "production",
    "_reason": "Error: connect ECONNREFUSED 127.0.0.1:5432"
  }'
```

---

## Alert 3 — 500 Internal Server Errors 🔴

### Graylog Event Definition

```
Title:         High 500 Error Rate
Search Query:  short_message:"HTTP response sent" AND _status_code:500
Condition:     Count() > 3
Timerange:     Last 5 minutes
Grace Period:  5 minutes
Notification:  Slack HTTP Notification
```

### Curl to Trigger (run 4 times to exceed threshold)

```bash
for i in 1 2 3 4; do
  curl -X POST http://YOUR_GRAYLOG_IP:12202/gelf \
    -H 'Content-Type: application/json' \
    -d "{
      \"version\": \"1.1\",
      \"host\": \"main-server\",
      \"short_message\": \"HTTP response sent\",
      \"level\": 3,
      \"facility\": \"graylog-express-app\",
      \"_app\": \"graylog-express-app\",
      \"_environment\": \"production\",
      \"_phase\": \"response\",
      \"_status_code\": 500,
      \"_method\": \"POST\",
      \"_url\": \"/api/data\",
      \"_response_time_ms\": 245.3
    }"
  echo "Sent 500 error #$i"
  sleep 1
done
```

---

## Alert 4 — Unhandled Application Error 🔴

### Graylog Event Definition

```
Title:         Unhandled Application Error
Search Query:  short_message:"Unhandled application error"
Condition:     Count() > 0
Timerange:     Last 2 minutes
Grace Period:  2 minutes
Notification:  Slack HTTP Notification
```

### Curl to Trigger

```bash
curl -X POST http://YOUR_GRAYLOG_IP:12202/gelf \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "1.1",
    "host": "main-server",
    "short_message": "Unhandled application error",
    "level": 3,
    "facility": "graylog-express-app",
    "_app": "graylog-express-app",
    "_environment": "production",
    "_error_name": "ReferenceError",
    "_error_message": "db is not defined",
    "_status_code": 500,
    "_stack": "ReferenceError: db is not defined\n    at /app/src/routes/index.js:78"
  }'
```

---

## Alert 5 — Rate Limit Being Hit 🟠

### Graylog Event Definition

```
Title:         Rate Limit Abuse Detected
Search Query:  short_message:"Rate limit exceeded"
Condition:     Count() > 10
Timerange:     Last 5 minutes
Grace Period:  10 minutes
Notification:  Slack HTTP Notification
```

### Curl to Trigger (run 11 times)

```bash
for i in $(seq 1 11); do
  curl -X POST http://YOUR_GRAYLOG_IP:12202/gelf \
    -H 'Content-Type: application/json' \
    -d "{
      \"version\": \"1.1\",
      \"host\": \"main-server\",
      \"short_message\": \"Rate limit exceeded\",
      \"level\": 4,
      \"facility\": \"graylog-express-app\",
      \"_app\": \"graylog-express-app\",
      \"_environment\": \"production\",
      \"_ip\": \"203.0.113.$i\",
      \"_method\": \"POST\",
      \"_url\": \"/api/login\",
      \"_limit\": 100,
      \"_window_ms\": 900000
    }"
  echo "Sent rate limit hit #$i"
done
```

---

## Alert 6 — Slow Response Times 🟡

### Graylog Event Definition

```
Title:         Slow API Responses (>3s)
Search Query:  short_message:"HTTP response sent" AND _response_time_ms:>3000
Condition:     Count() > 5
Timerange:     Last 5 minutes
Grace Period:  5 minutes
Notification:  Slack HTTP Notification
```

### Curl to Trigger (run 6 times)

```bash
for i in 1 2 3 4 5 6; do
  curl -X POST http://YOUR_GRAYLOG_IP:12202/gelf \
    -H 'Content-Type: application/json' \
    -d "{
      \"version\": \"1.1\",
      \"host\": \"main-server\",
      \"short_message\": \"HTTP response sent\",
      \"level\": 6,
      \"facility\": \"graylog-express-app\",
      \"_app\": \"graylog-express-app\",
      \"_environment\": \"production\",
      \"_phase\": \"response\",
      \"_status_code\": 200,
      \"_method\": \"GET\",
      \"_url\": \"/api/report\",
      \"_response_time_ms\": $((3500 + i * 100))
    }"
  echo "Sent slow response #$i"
  sleep 1
done
```

---

## Alert 7 — Server Shutdown Detected 🟠

### Graylog Event Definition

```
Title:         Server Shutdown Initiated
Search Query:  short_message:"initiating graceful shutdown"
Condition:     Count() > 0
Timerange:     Last 1 minute
Grace Period:  1 minute
Notification:  Slack HTTP Notification
```

### Curl to Trigger

```bash
curl -X POST http://YOUR_GRAYLOG_IP:12202/gelf \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "1.1",
    "host": "main-server",
    "short_message": "Received SIGTERM – initiating graceful shutdown",
    "level": 4,
    "facility": "graylog-express-app",
    "_app": "graylog-express-app",
    "_environment": "production"
  }'
```

---

## Alert 8 — Forced Shutdown (Hung Process) 🔴

### Graylog Event Definition

```
Title:         Forced Shutdown - Process Hung
Search Query:  short_message:"Forced shutdown after timeout"
Condition:     Count() > 0
Timerange:     Last 1 minute
Grace Period:  1 minute
Notification:  Slack HTTP Notification
```

### Curl to Trigger

```bash
curl -X POST http://YOUR_GRAYLOG_IP:12202/gelf \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "1.1",
    "host": "main-server",
    "short_message": "Forced shutdown after timeout",
    "level": 3,
    "facility": "graylog-express-app",
    "_app": "graylog-express-app",
    "_environment": "production"
  }'
```

---

## Quick Reference Summary

| # | Alert Name | Search Query | Threshold | Severity |
|---|-----------|-------------|-----------|----------|
| 1 | App Crash - Uncaught Exception | `short_message:"Uncaught exception"` | Count > 0 / 1min | 🔴 Critical |
| 2 | Unhandled Promise Rejection | `short_message:"Unhandled promise rejection"` | Count > 0 / 1min | 🔴 Critical |
| 3 | High 500 Error Rate | `short_message:"HTTP response sent" AND _status_code:500` | Count > 3 / 5min | 🔴 Critical |
| 4 | Unhandled Application Error | `short_message:"Unhandled application error"` | Count > 0 / 2min | 🔴 Critical |
| 5 | Rate Limit Abuse | `short_message:"Rate limit exceeded"` | Count > 10 / 5min | 🟠 Warning |
| 6 | Slow Responses > 3s | `short_message:"HTTP response sent" AND _response_time_ms:>3000` | Count > 5 / 5min | 🟡 Warning |
| 7 | Server Shutdown | `short_message:"initiating graceful shutdown"` | Count > 0 / 1min | 🟠 Warning |
| 8 | Forced Shutdown (Hung) | `short_message:"Forced shutdown after timeout"` | Count > 0 / 1min | 🔴 Critical |

---

## Related Docs

- [`slack-notifications.md`](./slack-notifications.md) — How to set up the Slack HTTP notification
- [`troubleshooting.md`](./troubleshooting.md) — Common issues and fixes
