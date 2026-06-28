# Family OS Telegram Bot POC

## Architecture

```text
Telegram private chat
  -> local long-polling bot
  -> local LLM bridge
       -> Codex SDK thread mode or DeepSeek API mode
       -> allowlist + callback transport
       -> generic runtime-command brokerage for plugin-owned helpers
       -> BB + inventory + task V2 skills inside the workspace
       -> local BB + inventory + task API wrapper / runtime-learning helper
  -> Family OS Apps Script API
```

Telegram is a local Family OS entrypoint. The bridge stays thin in domain terms: it
handles Telegram ingress, allowlisting, per-chat thread resume, callback
transport, and execution of plugin-configured helper commands, while the BB +
inventory reasoning stays inside the active LLM turn and skill runtime.

Keep this boundary strict:

- the bridge should not own household reply rules, recap wording, or inventory / task interpretation rules
- the bridge should pass helper execution results back into the Codex turn and let the LLM decide the final Cantonese reply
- if a helper returns useful live state such as `quantity_on_hand`, keep that in the execution result instead of hardcoding bridge-side sentence assembly
- add bridge logic only for transport, callback UX, state resume, allowlisting, and safety-critical boundaries

The active Telegram runtime now uses:

- `family-os-bb-inventory`
- `family-os-bb-inventory-api`

Legacy broad `family-os-sheets` behavior remains a Desktop/manual path only.

## Create The Bot

1. Open Telegram and message `@BotFather`.
2. Send `/newbot`.
3. Choose a bot name and username.
4. Keep the BotFather token private.
5. Optionally use `/setjoingroups` and disable group joins.

## Get Your Telegram User ID

Before allowlisting, start the bot and send `/whoami`. The bot replies with your numeric Telegram user ID.

You now have two allowlist sources:

- local fallback: `TELEGRAM_ALLOWED_USER_IDS`
- Family OS Sheets: `people.telegram_user_id`

For initial setup, leave `TELEGRAM_ALLOWED_USER_IDS` blank if you want. Only `/whoami` is available while both sources are empty. After receiving your ID, you can either:

- enter it into the local setup again, or
- fill it into the matching `people` row in Sheets under `telegram_user_id`

The bot loads both sources and refreshes the Sheets-based allowlist periodically.

## Configure Locally

Run the combined local setup:

```powershell
powershell -ExecutionPolicy Bypass -File .\family-os-telegram-bot\configure-local-bridge.ps1
```

The script checks the standalone Family OS API configuration, stores local
secrets in Windows DPAPI-encrypted files, and validates Bot startup. Do not paste
secrets into chat, Git, or Google Sheets. Natural-language understanding uses the
local Codex login by default. Alternatively, set `FAMILY_OS_LLM_PROVIDER=deepseek`
and provide `DEEPSEEK_API_KEY`. You can also point to another OpenAI-compatible
provider with `FAMILY_OS_LLM_PROVIDER`, `FAMILY_OS_LLM_MODEL`,
`FAMILY_OS_LLM_BASE_URL`, and `FAMILY_OS_LLM_API_KEY`. `OPENAI_API_KEY` is not used.

If you stay on Codex mode and `codex login status` says `Not logged in`, run
`codex login --device-auth` in the same Windows user session and sign in with
ChatGPT before starting the bot.

For Telegram-token-only retries, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\family-os-telegram-bot\configure-local-bot-window.ps1
```

When VPN split tunnelling is enabled, include the independent Codex CLI binary
under `node_modules/@openai/codex-win32-x64/.../bin/codex.exe`.

## Install And Validate The Local Bridge

Run once:

```powershell
cd .\family-os-telegram-bot
cmd /c "set NODE_OPTIONS=--use-system-ca&& npm.cmd install"
node .\sync_skills.mjs
node .\codex_bridge.mjs --self-test
cd ..
```

## Start

```powershell
.\family-os-telegram-bot\start-bot.cmd
```

The POC uses `getUpdates` long polling and removes any existing webhook at startup.

Background launch now uses a hidden PowerShell supervisor instead of launching
`node bot.mjs` directly. Runtime files are:

```text
family-os-telegram-bot/bot-heartbeat.json
family-os-telegram-bot/bot-supervisor-state.json
family-os-telegram-bot/bot-supervisor.log
family-os-telegram-bot/bot-runtime.out.log
family-os-telegram-bot/bot-runtime.err.log
```

After startup, send `/bridgehealth`. Use `/reset` when you want to clear the current Telegram chat state.

Send BB or inventory questions as normal Cantonese messages, for example:

```text
而家有幾多庫存？
有咩用品要補貨？
BB 今日 07:30 飲奶 90 ml
```

## Proactive Reminders

The first reminder worker is separate from the long-polling bot. It checks
Family OS every 15 minutes and can send proactive Telegram messages for:

- low-stock shopping reminders
- tasks due within 24 hours
- tasks due within 2 hours
- one daily digest per recipient

Per-recipient preferences live in:

```text
family-os-telegram-bot/reminder-config.json
```

At worker startup, recipient transport IDs can now be hydrated from Family OS
Sheets `people.telegram_user_id` through the existing Apps Script allowlist
route. If a reminder recipient has `person_scope.primary_person_id` or matching
`owner_person_ids`, the worker can fill `telegram_user_id` and `chat_id`
automatically. This keeps the per-instance reminder config focused on:

- person scope
- reminder preferences
- quiet hours

For Telegram private chats, `chat_id` defaults to the same numeric value as
`telegram_user_id`.

Run a dry run locally:

```powershell
powershell -ExecutionPolicy Bypass -File .\family-os-telegram-bot\start-reminder-worker.ps1 --dry-run
```

Install the scheduled worker:

```powershell
powershell -ExecutionPolicy Bypass -File .\family-os-telegram-bot\register-reminder-worker-task.ps1 -StartNow
```

The worker writes activity to:

```text
family-os-telegram-bot/reminder-worker-activity.log
family-os-telegram-bot/reminder-worker-fatal.log
```

## Production Follow-up

For 24-hour operation, move the same bridge to a small HTTPS service and use Telegram webhooks. Keep the user-ID allowlist and the direct Family OS tool boundary narrow.
