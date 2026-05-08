# Deployment Guide – Ubuntu 22.04

> **Audience**: beginners who have never deployed a Node.js app before.  
> Every command is copy-paste ready. Replace placeholders in `< >` with your real values.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Step 1 – Connect to your server](#step-1--connect-to-your-server)
3. [Step 2 – System update](#step-2--system-update)
4. [Step 3 – Install Node.js 20 LTS](#step-3--install-nodejs-20-lts)
5. [Step 4 – Install PM2 globally](#step-4--install-pm2-globally)
6. [Step 5 – Install Nginx](#step-5--install-nginx)
7. [Step 6 – Configure UFW firewall](#step-6--configure-ufw-firewall)
8. [Step 7 – Create a non-root app user](#step-7--create-a-non-root-app-user)
9. [Step 8 – Deploy application files](#step-8--deploy-application-files)
10. [Step 9 – Configure environment variables](#step-9--configure-environment-variables)
11. [Step 10 – Install dependencies & create log dir](#step-10--install-dependencies--create-log-dir)
12. [Step 11 – Start app with PM2](#step-11--start-app-with-pm2)
13. [Step 12 – Configure PM2 systemd startup](#step-12--configure-pm2-systemd-startup)
14. [Step 13 – Configure Nginx reverse proxy](#step-13--configure-nginx-reverse-proxy)
15. [Step 14 – Enable SSL with Certbot](#step-14--enable-ssl-with-certbot)
16. [Step 15 – Install PM2 log rotation](#step-15--install-pm2-log-rotation)
17. [Step 16 – Open Graylog GELF UDP input](#step-16--open-graylog-gelf-udp-input)
18. [Step 17 – Test everything](#step-17--test-everything)

---

## 1. Prerequisites

### Your two DigitalOcean Droplets

| Droplet | IP Address | Region | Role |
|---|---|---|---|
| `app-server` | **157.245.138.153** | NYC1 | Hosts the Node.js Express app |
| `main-server` | **168.144.35.138** | SGP1 | Hosts Graylog (already running) |

### Requirements

| Item | Value |
|---|-----------|
| Ubuntu | 24.04 LTS (both droplets) |
| RAM | 4 GB (both droplets) |
| Domain | `your-domain.com` pointing to `157.245.138.153` (app-server) |
| Graylog | Already running on `main-server` at `168.144.35.138` |

> **Important**: All steps in **Sections 1–15** run on the **app-server** (`157.245.138.153`).
> Section 16 runs on the **main-server** (`168.144.35.138`).

---

## Step 1 – Connect to your server

Connect to the **app-server** (where the Node.js app lives):

```bash
# Connect to app-server
ssh root@157.245.138.153
# or with a key:
ssh -i ~/.ssh/my-key.pem root@157.245.138.153
```

---

## Step 2 – System update

Always run this first on a fresh server.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git unzip ufw htop
```

---

## Step 3 – Install Node.js 20 LTS

We use the official NodeSource repository (not the outdated Ubuntu default).

```bash
# Download and run the NodeSource setup script
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js (includes npm)
sudo apt install -y nodejs

# Verify versions
node --version   # should show v20.x.x
npm --version    # should show 10.x.x
```

---

## Step 4 – Install PM2 globally

PM2 is the production process manager for Node.js.

```bash
sudo npm install -g pm2

# Verify
pm2 --version
```

---

## Step 5 – Install Nginx

```bash
sudo apt install -y nginx

# Start and enable on boot
sudo systemctl enable nginx
sudo systemctl start nginx

# Verify it's running
sudo systemctl status nginx
```

Open your browser → `http://<YOUR_SERVER_IP>` – you should see the Nginx welcome page.

---

## Step 6 – Configure UFW firewall

```bash
# Set default rules
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (ALWAYS do this first or you'll lock yourself out!)
sudo ufw allow 22/tcp comment 'SSH'

# Allow web traffic
sudo ufw allow 80/tcp comment 'HTTP'
sudo ufw allow 443/tcp comment 'HTTPS'

# Enable the firewall
sudo ufw enable
# Type 'y' and press Enter when prompted

# Verify
sudo ufw status verbose
```

Expected output:
```
Status: active
To                         Action      From
--                         ------      ----
22/tcp                     ALLOW IN    Anywhere
80/tcp                     ALLOW IN    Anywhere
443/tcp                    ALLOW IN    Anywhere
```

> ⚠️ **Do NOT** open port 3000. The app should only be reachable through Nginx.

---

## Step 7 – Create a non-root app user

**Never run your app as root.** Create a dedicated user.

```bash
# Create user (no login shell, no home dir password)
sudo adduser --system --group --no-create-home nodeapp

# Create the app directory and give ownership
sudo mkdir -p /var/www/graylog-express-app
sudo chown nodeapp:nodeapp /var/www/graylog-express-app

# Create PM2 log directory
sudo mkdir -p /var/log/pm2
sudo chown nodeapp:nodeapp /var/log/pm2
```

---

## Step 8 – Deploy application files

### Option A – Git clone (recommended)

```bash
# Switch to the app directory
cd /var/www/graylog-express-app

# If your repo is public:
sudo -u nodeapp git clone https://github.com/<YOUR_USERNAME>/<YOUR_REPO>.git .

# If private (use a deploy key or personal access token):
sudo -u nodeapp git clone https://<TOKEN>@github.com/<YOUR_USERNAME>/<YOUR_REPO>.git .
```

### Option B – SCP from your local machine

Run this on your **local** machine, not the server:

```bash
# Upload the project (exclude node_modules and logs)
rsync -avz --exclude='node_modules' --exclude='logs' --exclude='.env' \
  ./graylog-server-setup/ \
  ubuntu@<YOUR_SERVER_IP>:/var/www/graylog-express-app/
```

---

## Step 9 – Configure environment variables

```bash
# Navigate to app directory
cd /var/www/graylog-express-app

# Create .env from the example
sudo -u nodeapp cp .env.example .env

# Edit the file
sudo nano .env
```

Set these values in `.env` — **all IPs are pre-filled for your setup**:

```ini
NODE_ENV=production
PORT=3000
APP_NAME=graylog-express-app
SERVER_NAME=app-server            # this droplet's label in Graylog

# main-server is where Graylog runs
GRAYLOG_HOST=168.144.35.138
GRAYLOG_PORT=12201

RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
CORS_ORIGIN=https://your-domain.com
```

Save: `Ctrl+O`, `Enter`, `Ctrl+X`

Secure the file:

```bash
sudo chmod 600 /var/www/graylog-express-app/.env
sudo chown nodeapp:nodeapp /var/www/graylog-express-app/.env
```

---

## Step 10 – Install dependencies & create log dir

```bash
cd /var/www/graylog-express-app

# Install production dependencies only
sudo -u nodeapp npm install --omit=dev

# Create the logs directory Winston writes to
sudo -u nodeapp mkdir -p logs
```

---

## Step 11 – Start app with PM2

```bash
cd /var/www/graylog-express-app

# Update ecosystem.config.js cwd if needed:
# cwd: '/var/www/graylog-express-app'

# Start using the ecosystem file in production mode
sudo -u nodeapp pm2 start ecosystem.config.js --env production

# Check it's running
sudo -u nodeapp pm2 status

# Watch live logs
sudo -u nodeapp pm2 logs graylog-express-app --lines 50
```

Expected output:
```
┌────┬────────────────────────────┬─────────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name                       │ namespace   │ ver  │ mode      │ pid      │ status   │
├────┼────────────────────────────┼─────────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ graylog-express-app        │ default     │ 1.0  │ cluster   │ 12345    │ online   │
└────┴────────────────────────────┴─────────────┴──────┴───────────┴──────────┴──────────┘
```

---

## Step 12 – Configure PM2 systemd startup

This makes PM2 (and your app) survive reboots automatically.

```bash
# Generate the startup command (run as root, NOT nodeapp)
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u nodeapp --hp /home/nodeapp

# The command above will print something like:
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u nodeapp --hp /home/nodeapp
# Copy-paste and run THAT exact command.

# Save the current PM2 process list
sudo -u nodeapp pm2 save

# Verify
sudo systemctl status pm2-nodeapp
```

---

## Step 13 – Configure Nginx reverse proxy

```bash
# Copy the Nginx config
sudo cp /var/www/graylog-express-app/nginx/graylog-express-app.conf \
        /etc/nginx/sites-available/graylog-express-app

# Edit to replace 'your-domain.com' with your actual domain
sudo nano /etc/nginx/sites-available/graylog-express-app
```

Replace every occurrence of `your-domain.com` with your real domain.

```bash
# Enable the site (creates a symlink)
sudo ln -s /etc/nginx/sites-available/graylog-express-app \
           /etc/nginx/sites-enabled/

# Remove the default site to avoid conflicts
sudo rm -f /etc/nginx/sites-enabled/default

# Test the config syntax
sudo nginx -t
# Expected: "syntax is ok" and "test is successful"

# Reload Nginx
sudo systemctl reload nginx
```

Test HTTP (before SSL):

```bash
curl http://your-domain.com/health
```

---

## Step 14 – Enable SSL with Certbot

```bash
# Install Certbot and the Nginx plugin
sudo apt install -y certbot python3-certbot-nginx

# Obtain and install certificates automatically
sudo certbot --nginx -d your-domain.com -d www.your-domain.com \
  --non-interactive --agree-tos -m admin@your-domain.com

# Certbot will edit your Nginx config automatically.
# Verify auto-renewal works:
sudo certbot renew --dry-run

# Check the renewal timer
sudo systemctl status certbot.timer
```

Test HTTPS:

```bash
curl https://your-domain.com/health
```

---

## Step 15 – Install PM2 log rotation

Without this, PM2 log files will grow forever.

```bash
sudo -u nodeapp pm2 install pm2-logrotate

# Configure rotation
sudo -u nodeapp pm2 set pm2-logrotate:max_size 10M
sudo -u nodeapp pm2 set pm2-logrotate:retain 7
sudo -u nodeapp pm2 set pm2-logrotate:compress true
sudo -u nodeapp pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss
sudo -u nodeapp pm2 set pm2-logrotate:workerInterval 30
sudo -u nodeapp pm2 set pm2-logrotate:rotateInterval '0 0 * * *'
```

---

## Step 16 – Open Graylog GELF UDP input

> 🖥️ **Switch to main-server** for this section.
>
> ```bash
> ssh root@168.144.35.138
> ```

### 16.1 – Create a GELF UDP input

1. Open Graylog UI → `http://168.144.35.138:9000`
2. Go to **System** → **Inputs**
3. Click **Select input** → choose **GELF UDP**
4. Click **Launch new input**
5. Fill in:
   - **Title**: `Node.js App GELF`
   - **Bind address**: `0.0.0.0`
   - **Port**: `12201`
6. Click **Save**
7. Status should show **RUNNING** ✅

### 16.2 – Open the firewall on main-server for app-server

On **main-server** (`168.144.35.138`):

```bash
# Allow UDP 12201 only from the app-server IP (most secure)
sudo ufw allow from 157.245.138.153 to any port 12201 proto udp comment 'GELF from app-server'

sudo ufw reload
sudo ufw status
```

Expected output should include:
```
12201/udp                  ALLOW IN    157.245.138.153
```

### 16.3 – Test UDP connectivity from app-server to main-server

> 🖥️ **Back on app-server** (`157.245.138.153`):

```bash
# Install netcat
sudo apt install -y netcat

# Send a test GELF packet to main-server
echo '{"version":"1.1","host":"app-server","short_message":"UDP connectivity test","level":1}' | \
  nc -u -w1 168.144.35.138 12201
```

Check Graylog UI on `http://168.144.35.138:9000` → **Search** → `short_message:UDP connectivity test`
You should see the message appear within 10–15 seconds.

---

## Step 17 – Test everything

### 17.1 – curl endpoint tests

```bash
# Replace https://your-domain.com with your actual domain or IP

# Home endpoint
curl -s https://your-domain.com/ | python3 -m json.tool

# Health check
curl -s https://your-domain.com/health | python3 -m json.tool

# Generate a warning log
curl -s https://your-domain.com/warn | python3 -m json.tool

# Generate a 500 error (tests error pipeline)
curl -s https://your-domain.com/error | python3 -m json.tool

# Non-existent route (tests 404 handler)
curl -s https://your-domain.com/does-not-exist | python3 -m json.tool

# Test rate limiting (fire 110 requests quickly)
for i in $(seq 1 110); do
  curl -s -o /dev/null -w "%{http_code}\n" https://your-domain.com/
done
# First 100 → 200, last 10 → 429
```

### 17.2 – Verify logs in Graylog

1. Open Graylog UI → **Search**
2. Query: `application:graylog-express-app` (or `_app:graylog-express-app`)
3. Set time range: **Last 5 minutes**
4. You should see structured log entries with all custom fields

### 17.3 – Monitor PM2

```bash
# Real-time dashboard
sudo -u nodeapp pm2 monit

# Process list
sudo -u nodeapp pm2 status

# Restart gracefully
sudo -u nodeapp pm2 reload graylog-express-app

# Stop
sudo -u nodeapp pm2 stop graylog-express-app

# Check memory/CPU
sudo -u nodeapp pm2 describe graylog-express-app
```

---

## Quick Reference – Common Commands

```bash
# Reload app after code changes
cd /var/www/graylog-express-app
sudo -u nodeapp git pull
sudo -u nodeapp npm install --omit=dev
sudo -u nodeapp pm2 reload ecosystem.config.js --env production

# View live app logs
sudo -u nodeapp pm2 logs graylog-express-app

# Test Nginx config
sudo nginx -t && sudo systemctl reload nginx

# Renew SSL certificates manually
sudo certbot renew

# Check all services
sudo systemctl status nginx pm2-nodeapp
```
