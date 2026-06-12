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
- `instances/brother/.codex-home/auth.json` if this instance also uses Codex login
- optional `secrets/local-bot-config.json` / `secrets/local-api-config.json` if you keep the local secret-file path convention

## Reminder recipient IDs

If the Family OS `people` sheet already contains the matching
`person_id -> telegram_user_id` rows, the reminder worker can now hydrate each
recipient `telegram_user_id` and `chat_id` at startup from Sheets.

That means `config/reminder-config.json` can stay focused on:

- `person_scope.primary_person_id`
- `owner_person_ids` / `related_person_ids`
- reminder preferences and quiet hours

For private Telegram chats, `chat_id` defaults to the same value as
`telegram_user_id`.
