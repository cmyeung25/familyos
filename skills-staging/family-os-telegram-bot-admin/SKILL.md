---
name: family-os-telegram-bot-admin
description: Configure, run, validate, and maintain the private Family OS Telegram Bot and local project Codex Bridge. Use when creating the BotFather bot, setting Telegram allowlisted user IDs, syncing Family OS project skills, validating Desktop sign-in reuse, running the long-polling POC, troubleshooting Telegram delivery, or preparing a webhook deployment.
---

# Family OS Telegram Bot Admin

Use this skill for Telegram Bot setup and maintenance. Do not load it for routine household records.

## Source

```text
family-os-telegram-bot/
  bot.mjs
  start-bot.cmd
  start-bot.ps1
  configure-local-bridge.ps1
  configure-local-bot.ps1
  codex_bridge.mjs
  sync_skills.mjs
  SETUP.md
```

## Workflow

1. Read `family-os-telegram-bot/SETUP.md`.
2. Confirm Family OS Apps Script API health first.
3. Run `family-os-telegram-bot/configure-local-bridge.ps1`. Leave `TELEGRAM_ALLOWED_USER_IDS` blank during first-run onboarding if the Telegram user ID is unknown.
4. Start `family-os-telegram-bot/start-bot.cmd`, send `/whoami`, then stop the bot and configure the returned user ID in `TELEGRAM_ALLOWED_USER_IDS`.
5. Run `node family-os-telegram-bot/sync_skills.mjs` and `node family-os-telegram-bot/codex_bridge.mjs --self-test`. Prefer Desktop sign-in cache; configure local `CODEX_API_KEY` if independent CLI requests receive `403 Forbidden`.
6. Test `/bridgehealth`, `/health`, `/inventory`, and one controlled natural-language write.
7. Verify the resulting Family OS `audit_log`.

## Security

- Never paste or log Telegram Bot tokens, Codex auth data, OpenAI API keys, or Family OS API keys.
- Keep private-chat allowlisting enabled.
- Use the local Codex SDK with the existing Desktop sign-in cache. Run bridge turns in the Family OS workspace with `AGENTS.md`, project skills, workspace-only writes, web search disabled, and interactive approvals disabled.
- Do not allow Telegram turns to perform escalated system operations or reveal local files and secrets.
- For 24-hour operation, use HTTPS webhook deployment and verify Telegram webhook requests.
