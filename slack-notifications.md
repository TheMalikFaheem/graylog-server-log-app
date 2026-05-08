# Graylog → Slack Notifications Setup

> **Goal:** Receive real-time error and downtime alerts from Graylog directly in a Slack channel.

---

## Table of Contents

1. [Create a Slack Incoming Webhook](#step-1-create-a-slack-incoming-webhook)
2. [Install the Slack Plugin in Graylog](#step-2-install-the-slack-plugin-in-graylog)
3. [Create a Notification in Graylog](#step-3-create-a-notification-in-graylog)
4. [Create an Alert Condition (Event Definition)](#step-4-create-an-alert-condition-event-definition)
5. [Using HTTP Notification (No Plugin Required)](#step-5-using-http-notification-no-plugin-required)
6. [Test the Notification](#step-6-test-it)
7. [Recommended Alert Conditions](#recommended-alert-conditions)

---

## Step 1: Create a Slack Incoming Webhook

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App**
2. Choose **"From scratch"** → name it (e.g., `Graylog Alerts`) → select your workspace
3. In the left sidebar → **Incoming Webhooks** → toggle **Activate Incoming Webhooks: ON**
4. Click **"Add New Webhook to Workspace"** → choose your `#alerts` channel
5. **Copy the Webhook URL** — it looks like:

```
https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXX
```

> ⚠️ **Keep this URL secret.** Anyone with it can post to your Slack channel.

---

## Step 2: Install the Slack Plugin in Graylog

Graylog needs a notification plugin to natively support Slack. You have two options:

### Option A — Graylog Slack Plugin (Recommended)

```bash
# On your Graylog server
wget https://github.com/graylog-labs/graylog-plugin-slack/releases/download/3.1.0/graylog-plugin-slack-3.1.0.jar \
  -O /usr/share/graylog-server/plugin/graylog-plugin-slack.jar

# Restart Graylog
sudo systemctl restart graylog-server
```

> If using **Docker Compose**, mount the plugin into the container:
> ```yaml
> volumes:
>   - ./plugins/graylog-plugin-slack.jar:/usr/share/graylog-server/plugin/graylog-plugin-slack.jar
> ```

### Option B — Built-in HTTP Notification

No plugin required. Works directly with Slack webhooks. See [Step 5](#step-5-using-http-notification-no-plugin-required).

---

## Step 3: Create a Notification in Graylog

1. In Graylog UI → **Alerts** → **Notifications** → **Create Notification**
2. Fill in the fields:

| Field             | Value                                      |
|-------------------|--------------------------------------------|
| Title             | `Slack Error Alert`                        |
| Notification Type | `Slack Notification` or `HTTP Notification`|
| Webhook URL       | Your Slack Webhook URL from Step 1         |
| Channel           | `#alerts`                                  |
| Icon Emoji        | `:rotating_light:`                         |
| Bot Name          | `Graylog`                                  |

3. Click **Save**.

---

## Step 4: Create an Alert Condition (Event Definition)

Go to **Alerts** → **Event Definitions** → **Create Event Definition**

### For Error Notifications

```
Title: High Error Rate Alert
Filter:
  Search Query: level:3 OR level:2 OR level:1
    (level 3 = Error, 2 = Critical, 1 = Alert)
  Stream: <Your App Stream>
  Timerange: Last 1 minute
Aggregation:
  Condition: Count > 0
Notification: Slack Error Alert (created in Step 3)
```

### For Downtime / No-Data Notifications

```
Title: App Downtime Alert
Filter:
  Search Query: *
  Stream: <Your App Stream>
  Timerange: Last 5 minutes
Aggregation:
  Condition: Count < 1  (message count drops to zero = app is down)
Notification: Slack Error Alert (created in Step 3)
```

> **Tip:** Set a **Grace Period** (e.g., 5 minutes) to avoid alert spam during brief blips.

---

## Step 5: Using HTTP Notification (No Plugin Required)

If you prefer not to install a plugin, use the built-in **HTTP Notification** type:

1. Notification Type → **HTTP Notification**
2. URL → paste your Slack Webhook URL
3. Method → `POST`

Graylog will POST a JSON payload automatically. You can also use a custom Slack-formatted body:

```json
{
  "text": "*🚨 Graylog Alert Triggered*",
  "attachments": [
    {
      "color": "danger",
      "title": "${event_definition_title}",
      "text": "${event.message}",
      "fields": [
        { "title": "Stream",    "value": "${stream.title}",    "short": true },
        { "title": "Triggered", "value": "${event.timestamp}", "short": true }
      ],
      "footer": "Graylog Alerting",
      "footer_icon": "https://www.graylog.org/favicon.ico"
    }
  ]
}
```

---

## Step 6: Test It

In Graylog → open your Notification → click **"Send Test Notification"**

Check your Slack channel for the test message. If it doesn't appear:
- Verify the Webhook URL is correct
- Confirm the Slack app is still installed in your workspace
- Check Graylog logs: `sudo journalctl -u graylog-server -f`

---

## Recommended Alert Conditions

| Alert Name             | Search Query / Condition              | Timerange | Severity       |
|------------------------|---------------------------------------|-----------|----------------|
| High Error Rate        | `level:3 count > 10`                  | 1 min     | 🔴 Critical    |
| Any Fatal/Critical Log | `level:2 OR level:1 count > 0`        | 1 min     | 🔴 Critical    |
| App Goes Silent        | `message count < 1`                   | 5 min     | 🟠 Warning     |
| Slow Response Times    | `response_time:>5000 count > 5`       | 2 min     | 🟡 Warning     |
| Login Failures         | `message:"authentication failed" count > 3` | 5 min | 🟡 Warning |

---

## Flow Summary

```
Slack App
  └── Incoming Webhook URL
           ↓
Graylog Notification
  └── (paste Webhook URL)
           ↓
Graylog Event Definition
  └── (define trigger: error level, count, timerange)
           ↓
Alert fires → POST to Slack Webhook → Message in #alerts
```

---

## Related Docs

- [`deployment.md`](./deployment.md) — Full server deployment guide
- [`troubleshooting.md`](./troubleshooting.md) — Common issues and fixes
- [Graylog Alerting Docs](https://docs.graylog.org/docs/alerts)
- [Slack Incoming Webhooks Docs](https://api.slack.com/messaging/webhooks)
