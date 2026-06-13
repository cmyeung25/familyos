# Synology Uptime Monitoring

This adds a small read-only health monitor for Family OS so Uptime Kuma can watch bot health without sending Telegram test messages.

## What it checks

- `bot`: `instances/{tenant}/state/bot-heartbeat.json`
- `reminder`: `instances/{tenant}/state/reminder-state.json`

It uses the same freshness rules as the Docker healthcheck:

- bot heartbeat must be fresh within 3 minutes
- reminder worker state must be fresh within 20 minutes

## 1. Start the monitor container

Use the example file:

```bash
cp docker-compose.monitoring.example.yml docker-compose.monitoring.yml
```

Then adjust:

- `FAMILY_OS_MONITOR_TOKEN`
- `FAMILY_OS_MONITOR_INSTANCES`

Example:

```yaml
FAMILY_OS_MONITOR_INSTANCES: gary=/data/instances/gary,brother=/data/instances/brother
```

Bring it up:

```bash
docker compose -f docker-compose.monitoring.yml build
docker compose -f docker-compose.monitoring.yml up -d
```

## 2. Health URLs

Assuming your NAS LAN IP is `192.168.1.19` and port `8787`:

- overall: `http://192.168.1.19:8787/healthz`
- one household: `http://192.168.1.19:8787/healthz/gary`
- bot only: `http://192.168.1.19:8787/healthz/gary/bot`
- reminder only: `http://192.168.1.19:8787/healthz/gary/reminder`

If `FAMILY_OS_MONITOR_TOKEN` is set, send it as either:

- header: `X-Family-Os-Monitor-Token`
- query: `?token=...`

Header is preferred.

## 3. Uptime Kuma setup

Recommended monitors:

1. `Family OS Gary`
   - type: `HTTP(s)`
   - URL: `http://192.168.1.19:8787/healthz/gary`
   - interval: `30s` or `60s`
   - accepted status codes: `200-299`
   - header: `X-Family-Os-Monitor-Token: <your token>`

2. `Family OS Brother`
   - type: `HTTP(s)`
   - URL: `http://192.168.1.19:8787/healthz/brother`
   - interval: `30s` or `60s`
   - accepted status codes: `200-299`
   - header: `X-Family-Os-Monitor-Token: <your token>`

If you want finer visibility, add separate monitors for `/bot` and `/reminder`.

## 4. Response shape

Healthy example:

```json
{
  "ok": true,
  "instance": "gary",
  "services": {
    "bot": {
      "ok": true,
      "status": "polling"
    },
    "reminder": {
      "ok": true
    }
  }
}
```

If a heartbeat file is stale or missing, the endpoint returns HTTP `503`.

## 5. Why this instead of Telegram probing

- does not spam your family chats
- does not depend on a manual `/bridgehealth`
- reuses the existing local runtime heartbeat files
- works even when Telegram allowlist is correct but the worker loop is stuck

## 6. Scope

This monitor is read-only. It does not restart containers and does not modify Sheets, Telegram, or Codex state.
