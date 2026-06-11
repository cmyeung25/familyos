# Synology Phase 3: Single Bot Deployment

This phase targets one real household instance on Synology NAS using Docker Compose.

## Assumptions

- NAS path: `/volume1/docker/familyos/repo`
- active instance: `gary`
- DSM already has Container Manager and Docker Compose
- Google Sheets remains the live database through the Apps Script API

## 1. Prepare the repo on NAS

Clone or pull the repo into:

```bash
/volume1/docker/familyos/repo
```

All commands below assume you run them from that repo root.

## 2. Prepare the instance files

Copy the committed templates:

```bash
cp instances/gary/.env.example instances/gary/.env
cp instances/gary/config/telegram-runtime.example.json instances/gary/config/telegram-runtime.json
cp instances/gary/config/reminder-config.example.json instances/gary/config/reminder-config.json
cp instances/gary/config/persona.example.yaml instances/gary/config/persona.yaml
```

Then fill the real values in:

- `instances/gary/.env`
- `instances/gary/config/reminder-config.json`
- `instances/gary/config/persona.yaml`

Do not commit those real files.

## 3. Put private secrets in place

Create these files locally on NAS:

- `instances/gary/secrets/local-bot-config.json`
- `instances/gary/secrets/local-api-config.json`

Or, if you prefer pure env-based runtime, define these directly in `.env`:

- `TELEGRAM_BOT_TOKEN`
- `FAMILY_OS_API_URL`
- `FAMILY_OS_API_KEY`

## 4. Seed Codex auth

If you keep using Codex login instead of API key-based LLM access, place the auth cache at:

```bash
instances/gary/.codex-home/auth.json
```

Optional but recommended:

- also copy `config.toml` into `instances/gary/.codex-home/`
- ensure only NAS admins can read this folder

## 4a. Optional extra CA certificates

If the outbound network path on the host uses HTTPS/TLS interception, private SSL inspection, or a custom enterprise root CA, place PEM `.crt` files at:

```bash
instances/gary/secrets/certs/
```

The Docker runtime now imports `*.crt` from that folder into the container trust store on startup.

Typical examples:

- antivirus web shield certificates
- corporate proxy root CAs
- private TLS inspection gateways

Do not add this folder unless you actually need it.

## 5. Build and start

```bash
docker compose -f docker-compose.gary.yml build
docker compose -f docker-compose.gary.yml up -d
```

## 6. Validate

Check container status:

```bash
docker compose -f docker-compose.gary.yml ps
```

Check logs:

```bash
docker compose -f docker-compose.gary.yml logs --tail=200 familyos-gary-bot
docker compose -f docker-compose.gary.yml logs --tail=200 familyos-gary-reminder
```

Expected runtime artifacts:

- `instances/gary/state/bot-heartbeat.json`
- `instances/gary/state/bot-runtime-state.json`
- `instances/gary/state/.codex-bridge-state.json`
- `instances/gary/logs/*.log`

From Telegram, validate:

- `/whoami`
- `/bridgehealth`
- one read-only routine message
- one controlled BB / inventory write

Then confirm the write in Family OS `audit_log`.

For the laptop reference rollout, this path has already been validated with:

- Docker long polling
- Codex login from mounted `.codex-home`
- Telegram round-trip
- audited inventory write

## 7. Restart and rollback

Restart:

```bash
docker compose -f docker-compose.gary.yml restart
```

Stop:

```bash
docker compose -f docker-compose.gary.yml down
```

Rollback to the previous git baseline:

```bash
git checkout bb00741
docker compose -f docker-compose.gary.yml build
docker compose -f docker-compose.gary.yml up -d
```

Use a tagged image strategy later if you want rollback without rebuilding.

## 8. What this phase does not solve yet

- multi-family deployment
- secret rotation automation
- API-key-based LLM provider abstraction
- backup automation
- externalized instance storage outside the repo tree

Those belong to later phases.
