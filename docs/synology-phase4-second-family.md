# Synology Phase 4: Second Family Instance

This phase adds a second Family OS tenant with a separate Telegram bot, separate Apps Script endpoint, separate runtime state, and separate reminder config while still sharing the same core codebase.

## New files

- `docker-compose.brother.yml`
- `instances/brother/README.md`
- `instances/brother/.env.example`
- `instances/brother/config/*.example`

## Private files prepared locally

The local workspace can also keep these non-committed runtime files:

- `instances/brother/.env`
- `instances/brother/config/persona.yaml`
- `instances/brother/config/reminder-config.json`
- `instances/brother/config/telegram-runtime.json`

## Still required before live rollout

- `TELEGRAM_ALLOWED_USER_IDS`
- `FAMILY_OS_API_KEY`
- recipient `telegram_user_id` and `chat_id`
- optional `instances/brother/.codex-home/auth.json`

## Suggested rollout

1. Fill the private files under `instances/brother/`
2. Copy the same instance onto NAS
3. Start with:

```bash
docker compose -f docker-compose.brother.yml build
docker compose -f docker-compose.brother.yml up -d
```

4. Validate:

- `/whoami`
- `/bridgehealth`
- one read-only query
- one controlled write
