# Troubleshooting Guide

> Use this guide when logs are not appearing in Graylog, the app won't start, or Nginx returns errors.

---

## Table of Contents

1. [Logs not appearing in Graylog](#1-logs-not-appearing-in-graylog)
2. [App won't start / PM2 errors](#2-app-wont-start--pm2-errors)
3. [Nginx errors](#3-nginx-errors)
4. [SSL certificate issues](#4-ssl-certificate-issues)
5. [Rate limiting too aggressive](#5-rate-limiting-too-aggressive)
6. [High memory / CPU usage](#6-high-memory--cpu-usage)
7. [Useful diagnostic commands](#7-useful-diagnostic-commands)

---

## 1. Logs not appearing in Graylog

Work through each checkpoint in order.

---

### ✅ Checkpoint 1 – Is the GELF input running on Graylog?

On the **Graylog server**:

1. Open `http://<GRAYLOG_IP>:9000`
2. Navigate to **System → Inputs**
3. Look for your **GELF UDP** input
4. Status must show **RUNNING** (green)

If it shows **STOPPED**:
- Click **Start** next to the input
- Wait 5 seconds and refresh the page

---

### ✅ Checkpoint 2 – Is UDP port 12201 open on the Graylog server?

On the **Graylog server**:

```bash
# Check if Graylog is listening on 12201 UDP
sudo ss -ulnp | grep 12201
# Expected output contains: 0.0.0.0:12201

# Check the firewall
sudo ufw status | grep 12201
```

If port is not open:

```bash
sudo ufw allow 12201/udp comment 'Graylog GELF UDP'
sudo ufw reload
```

---

### ✅ Checkpoint 3 – Can the app server reach Graylog?

On the **app server** (Ubuntu where Node.js runs):

```bash
# Test UDP reachability (install netcat if missing)
sudo apt install -y netcat

echo '{"version":"1.1","host":"test","short_message":"connectivity test","level":1}' | \
  nc -u -w2 <GRAYLOG_IP> 12201

echo "Exit code: $?"
# Exit code 0 = packet sent (UDP has no delivery guarantee)
```

Check Graylog Search: `short_message:connectivity test`

If not visible after 30 seconds:
- Verify `GRAYLOG_HOST` in `.env` is correct
- Check if a cloud firewall / security group is blocking UDP 12201
- Ping the Graylog server: `ping <GRAYLOG_IP>`

---

### ✅ Checkpoint 4 – Is the app reading the correct .env file?

```bash
# Print the effective GRAYLOG_HOST seen by the app
cd /var/www/graylog-express-app
sudo -u nodeapp node -e "require('dotenv').config(); console.log(process.env.GRAYLOG_HOST)"
```

If it prints `YOUR_GRAYLOG_SERVER_IP` or `undefined`, the `.env` file is not set up correctly.

---

### ✅ Checkpoint 5 – Check the app console log for transport errors

```bash
sudo -u nodeapp pm2 logs graylog-express-app --lines 100 --nostream
```

Look for lines like:

```
[Logger] Graylog GELF transport enabled → udp://192.168.1.50:12201
```

If you see:
```
[Logger] GRAYLOG_HOST not configured – Graylog transport disabled.
```
→ Your `.env` file is missing or `GRAYLOG_HOST` is still the placeholder.

---

### ✅ Checkpoint 6 – Generate logs and watch Graylog in real time

```bash
# Fire requests to generate logs
curl https://your-domain.com/
curl https://your-domain.com/warn
curl https://your-domain.com/error
```

In Graylog:
- Go to **Search**
- Set time range to **Last 1 minute**
- Query: `*` (all messages)
- Press **Search**

If still empty, try the UDP test from Checkpoint 3 again.

---

### ✅ Checkpoint 7 – Graylog time-zone / clock skew

GELF messages with timestamps far in the past/future are silently dropped.

On the **app server**:

```bash
timedatectl
# "System clock synchronized: yes"
# If not:
sudo timedatectl set-ntp true
sudo systemctl restart systemd-timesyncd
```

---

## 2. App won't start / PM2 errors

### Check PM2 logs

```bash
sudo -u nodeapp pm2 logs graylog-express-app --lines 200 --nostream
sudo -u nodeapp pm2 describe graylog-express-app
```

### Common errors

| Error | Fix |
|---|---|
| `Error: listen EADDRINUSE :::3000` | Another process is on port 3000. Run `sudo lsof -i :3000` and kill it. |
| `Cannot find module 'winston-graylog2'` | Run `sudo -u nodeapp npm install --omit=dev` |
| `Error: ENOENT: no such file or directory, open '.env'` | Create `.env`: `sudo -u nodeapp cp .env.example .env` |
| `Error: EACCES: permission denied, open 'logs/combined.log'` | Fix perms: `sudo chown -R nodeapp:nodeapp /var/www/graylog-express-app/logs` |
| App keeps restarting (`errored` status) | Check logs above; also try `sudo -u nodeapp node src/app.js` directly |

### Run directly for verbose errors

```bash
cd /var/www/graylog-express-app
sudo -u nodeapp node src/app.js
# All startup errors print directly to your terminal
```

---

## 3. Nginx errors

### Test Nginx config

```bash
sudo nginx -t
```

Always fix ALL errors before reloading.

### Common errors

| Error | Fix |
|---|---|
| `502 Bad Gateway` | App is not running. Check `pm2 status`. |
| `504 Gateway Timeout` | App is slow / hung. Check PM2 logs. |
| `403 Forbidden` | Wrong permissions on app directory. |
| `ssl_certificate not found` | Run Certbot first (Step 14 in deployment.md). |
| `bind() to 0.0.0.0:443 failed` | Certbot not installed or certs missing. |

### Check Nginx error log

```bash
sudo tail -f /var/log/nginx/graylog-app-error.log
```

### Check if app is actually listening on 3000

```bash
sudo ss -tlnp | grep 3000
# Expected: 0.0.0.0:3000 (LISTEN)

# Or test directly bypassing Nginx
curl -s http://127.0.0.1:3000/health
```

---

## 4. SSL certificate issues

### Certificate expired

```bash
# Check expiry date
sudo certbot certificates

# Renew manually
sudo certbot renew

# Force renewal
sudo certbot renew --force-renewal
```

### Certbot auto-renewal timer not running

```bash
sudo systemctl status certbot.timer
sudo systemctl enable --now certbot.timer
```

### "No names were found in your configuration files" error

This means `server_name` in your Nginx config doesn't match the domain you're requesting a cert for. Double-check all `your-domain.com` references are replaced.

---

## 5. Rate limiting too aggressive

If legitimate users are hitting 429 responses, increase limits in `.env`:

```ini
RATE_LIMIT_MAX=500          # was 100
RATE_LIMIT_WINDOW_MS=60000  # 1 minute instead of 15
```

Then reload PM2:

```bash
sudo -u nodeapp pm2 reload graylog-express-app
```

---

## 6. High memory / CPU usage

### Check current usage

```bash
sudo -u nodeapp pm2 monit
# Or:
sudo -u nodeapp pm2 describe graylog-express-app | grep -i memory
```

### Trigger a PM2 memory-limit restart manually

```bash
sudo -u nodeapp pm2 reload graylog-express-app
```

### Lower the memory limit in ecosystem.config.js

```js
max_memory_restart: '256M',  // was 512M
```

Then redeploy:

```bash
sudo -u nodeapp pm2 delete graylog-express-app
sudo -u nodeapp pm2 start ecosystem.config.js --env production
sudo -u nodeapp pm2 save
```

---

## 7. Useful Diagnostic Commands

### System health

```bash
# CPU / memory / disk
htop
df -h
free -h

# Open connections
sudo ss -s

# Processes on port 3000
sudo lsof -i :3000

# All listening ports
sudo ss -tlnp
```

### Service status

```bash
sudo systemctl status nginx
sudo systemctl status pm2-nodeapp
sudo systemctl status ufw
```

### Network

```bash
# Test DNS resolution
dig your-domain.com

# Trace route to Graylog
traceroute <GRAYLOG_IP>

# Check firewall rules
sudo ufw status numbered

# Capture UDP packets arriving on 12201 (on Graylog server)
sudo tcpdump -i any udp port 12201 -nn -c 20
```

### Log tailing

```bash
# PM2 logs (app)
sudo -u nodeapp pm2 logs graylog-express-app --lines 100

# Application error log
sudo tail -f /var/www/graylog-express-app/logs/error.log

# Nginx access log
sudo tail -f /var/log/nginx/graylog-app-access.log

# Nginx error log
sudo tail -f /var/log/nginx/graylog-app-error.log

# System journal
sudo journalctl -u pm2-nodeapp -f
sudo journalctl -u nginx -f
```

### Graylog search queries

| Goal | Query |
|---|---|
| All app messages | `_app:graylog-express-app` |
| Only errors | `level:3` |
| Only warnings | `level:4` |
| Specific request ID | `_request_id:<UUID>` |
| Slow requests (>200ms) | `_response_time_ms:>200` |
| 5xx responses | `_status_code:[500 TO 599]` |
| All from a specific IP | `_ip:192.168.1.100` |
