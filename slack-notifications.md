# Graylog → Slack: Instant Error Notifications

> **Goal:** Every time a single `error` log hits Graylog, you get an instant Slack message.  
> **Method:** Graylog's built-in HTTP Notification — no plugins, no extra installs.

---

## How It Works

```
Your App (Node.js)
  └── sends error log via GELF/UDP
        ↓
Graylog receives the log
  └── Event Definition checks: level = error?
        ↓ yes
Graylog fires HTTP Notification
  └── POSTs to your Slack Webhook URL
        ↓
You get a message in #alerts instantly
```

---

## Step 1 — Create a Slack Webhook URL

1. Go to → **https://api.slack.com/apps**
2. Click **"Create New App"** → choose **"From scratch"**
3. Name it `Graylog Alerts` → pick your workspace → click **Create App**
4. In the left sidebar → click **"Incoming Webhooks"**
5. Toggle **"Activate Incoming Webhooks"** → **ON**
6. Scroll down → click **"Add New Webhook to Workspace"**
7. Select your `#alerts` channel (or whichever channel you want) → click **Allow**
8. **Copy the Webhook URL** — it looks like this:

```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXX
```

> ⚠️ Keep this URL private. Anyone with it can post to your Slack.

---

## Step 2 — Create a Notification in Graylog

1. Open Graylog UI → **http://168.144.35.138:9000**
2. Top menu → **Alerts** → **Notifications**
3. Click **"Create Notification"**
4. Fill in exactly:

| Field | Value |
|---|---|
| **Title** | `Slack Error Alert` |
| **Notification Type** | `HTTP Notification` |
| **URL** | *(paste your Webhook URL from Step 1)* |

5. Click **"Save"**

---

## Step 3 — Create the Event Definition (the trigger)

This is what watches for error logs and fires the notification.

1. Top menu → **Alerts** → **Event Definitions**
2. Click **"Create Event Definition"**

### Fill in each tab:

**Tab 1 — Details**

| Field | Value |
|---|---|
| **Title** | `Single Error Log Alert` |
| **Description** | `Fires instantly on any error log` |
| **Priority** | High |

**Tab 2 — Condition**

| Field | Value |
|---|---|
| **Condition Type** | `Filter & Aggregation` |
| **Search Query** | `level:3` |
| **Streams** | Select your app stream (or `All Messages`) |
| **Search Within** | `1 Minute` |
| **Execute Every** | `1 Minute` |

> `level:3` is the GELF syslog integer for **ERROR**.  
> Your app sends this automatically via the custom GELF transport in `logger.js`.

**Tab 3 — Fields** — skip, nothing needed here

**Tab 4 — Notifications**

- Click **"Add Notification"**
- Select **`Slack Error Alert`** (the one you created in Step 2)
- **Grace Period** → set to `0` (so every error fires, no suppression)

**Tab 5 — Summary** → click **"Done"**

---

## Step 4 — Test It

### Trigger a real error from your app:
```bash
curl http://localhost:3000/error
```

This hits the `/error` route in your app which intentionally throws and logs an error via Winston → GELF → Graylog.

### What you should see in Slack within ~1 minute:
```
[Graylog Alert] Single Error Log Alert
A condition was triggered: level:3
Stream: All Messages
```

### If nothing appears in Slack:
```bash
# 1. Confirm the log reached Graylog
# Go to: http://168.144.35.138:9000 → Search → type: level:3 → hit Enter
# You should see the error log appear

# 2. Check the notification fired
# Alerts → Event Definitions → click your definition → "Trigger Now" button

# 3. Manually test the webhook URL
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"✅ Webhook test from terminal"}' \
  https://hooks.slack.com/services/YOUR/WEBHOOK/URL
# Replace with your actual URL — you should see the message in Slack instantly
```

---

## GELF Level Reference

Your app sends these numeric levels to Graylog:

| Level Name | Number | Search Query |
|---|---|---|
| Emergency | 0 | `level:0` |
| Alert | 1 | `level:1` |
| Critical | 2 | `level:2` |
| **Error** | **3** | **`level:3`** ← you want this |
| Warning | 4 | `level:4` |
| Info | 6 | `level:6` |
| Debug | 7 | `level:7` |

---

## Related Docs

- [`deployment.md`](./deployment.md) — Full server setup guide  
- [`troubleshooting.md`](./troubleshooting.md) — Common issues and fixes  
- [Graylog Alerting Docs](https://docs.graylog.org/docs/alerts)  
- [Slack Incoming Webhooks Docs](https://api.slack.com/messaging/webhooks)
