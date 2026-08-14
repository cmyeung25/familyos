# Family OS

Family OS is a household assistant workspace built around a Telegram bot, an LLM bridge, and a Google Apps Script API backed by Google Sheets.

## Current layout

- `family-os-telegram-bot/`: Telegram bot runtime, LLM bridge, reminder worker
- `family-os-apps-script/`: Apps Script Web App backend for audited reads and writes
- `family-os-bb-ipad-webapp/`: iPad add-to-home-screen BB logging PWA and thin API proxy
- `plugins-staging/`: staged skills and runtime references used by the Telegram BB + inventory flow
- `instances/example/`: Phase 1 multi-instance config scaffold

## Phase 1 status

Phase 1 introduces instance-aware paths without changing core bot behavior:

- existing local defaults still work
- runtime state, logs, reminder config, and Codex auth can now be redirected with env vars
- each future household instance can point to its own config, state, logs, and runtime knowledge root

The current code still uses the same shared business logic and the same Google Sheets API contract.

## Phase 2 preview

Single-bot Dockerization is now scaffolded with:

- [Dockerfile](/C:/Users/user/OneDrive/文件/屋企清單/Dockerfile)
- [docker/start-family-os.mjs](/C:/Users/user/OneDrive/文件/屋企清單/docker/start-family-os.mjs)
- [docker/healthcheck.mjs](/C:/Users/user/OneDrive/文件/屋企清單/docker/healthcheck.mjs)
- [docker-compose.single-bot.example.yml](/C:/Users/user/OneDrive/文件/屋企清單/docker-compose.single-bot.example.yml)

The container runtime is Linux-compatible and does not depend on PowerShell or Windows Scheduled Tasks. It expects:

- `TELEGRAM_BOT_TOKEN`
- `FAMILY_OS_API_URL`
- `FAMILY_OS_API_KEY`
- a mounted instance folder under `/data/instance`
- a mounted Codex auth cache under `/data/instance/.codex-home` if you keep using Codex login
- or `FAMILY_OS_LLM_PROVIDER=deepseek` plus `DEEPSEEK_API_KEY` if you switch to DeepSeek API mode
- or another OpenAI-compatible API provider via `FAMILY_OS_LLM_PROVIDER`, `FAMILY_OS_LLM_MODEL`, `FAMILY_OS_LLM_BASE_URL`, and `FAMILY_OS_LLM_API_KEY`
- optional extra CA certs under `/data/instance/secrets/certs/*.crt` when the host network path uses TLS interception or a private trust root

## Phase 3 preview

Single-instance Synology rollout is now scaffolded with:

- [docker-compose.gary.yml](/C:/Users/user/OneDrive/文件/屋企清單/docker-compose.gary.yml)
- [docs/synology-phase3-single-bot.md](/C:/Users/user/OneDrive/文件/屋企清單/docs/synology-phase3-single-bot.md)
- [instances/gary/README.md](/C:/Users/user/OneDrive/文件/屋企清單/instances/gary/README.md)

This phase is ready for a real `gary` tenant once you fill the private files under `instances/gary/`.
The local laptop Docker bring-up for `gary` has already been validated end-to-end, including Codex login and Telegram polling.

## Instance path envs

The bot now supports these path overrides:

- `FAMILY_OS_INSTANCE_ROOT`
- `FAMILY_OS_CONFIG_ROOT`
- `FAMILY_OS_STATE_ROOT`
- `FAMILY_OS_LOGS_ROOT`
- `FAMILY_OS_CODEX_HOME`
- `FAMILY_OS_BOT_CONFIG_PATH`
- `FAMILY_OS_API_CONFIG_PATH`
- `FAMILY_OS_REMINDER_CONFIG_PATH`
- `FAMILY_OS_RUNTIME_CONFIG_PATH`

## LLM provider envs

- `FAMILY_OS_LLM_PROVIDER`
- `FAMILY_OS_LLM_MODEL`
- `FAMILY_OS_LLM_BASE_URL`
- `FAMILY_OS_LLM_API_KEY`
- `DEEPSEEK_API_KEY`

## Uptime monitoring

Synology + Uptime Kuma monitoring is now scaffolded with:

- `docker/health_state.mjs`
- `docker/health_server.mjs`
- `docker-compose.monitoring.example.yml`
- `docs/synology-uptime-monitoring.md`

The BB iPad PWA has its own isolated NAS service and deployment guide:

- `docker-compose.bb-ipad.yml`
- `scripts/synology/deploy-bb-ipad.sh`
- `docs/synology-bb-ipad-deployment.md`

## Shared Planning Docs

For roadmap, project status, and cross-agent delivery rules, read:

- `docs/familyos-roadmap.md`
- `docs/familyos-engineering-principles.md`

See [instances/example/README.md](/C:/Users/user/OneDrive/文件/屋企清單/instances/example/README.md) for a tenant-style scaffold.
