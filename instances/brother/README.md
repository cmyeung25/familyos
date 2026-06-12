# Brother Instance

This is the second household instance scaffold for multi-family deployment.

Committed here:

- template files
- empty folders for expected runtime layout
- a dedicated Compose file at repo root: `docker-compose.brother.yml`

Not committed here:

- `.env`
- `config/persona.yaml`
- `config/reminder-config.json`
- `config/telegram-runtime.json`
- `secrets/*`
- `.codex-home/*`
- logs, state, memory, private skills, runtime knowledge

## Copy these templates first

- `.env.example` -> `.env`
- `config/persona.example.yaml` -> `config/persona.yaml`
- `config/reminder-config.example.json` -> `config/reminder-config.json`
- `config/telegram-runtime.example.json` -> `config/telegram-runtime.json`

## Minimum private files still needed

- `TELEGRAM_ALLOWED_USER_IDS`
- `FAMILY_OS_API_KEY`
- real recipient `telegram_user_id` / `chat_id`
- `instances/brother/.codex-home/auth.json` if this instance also uses Codex login
- optional `secrets/local-bot-config.json` / `secrets/local-api-config.json` if you keep the local secret-file path convention
