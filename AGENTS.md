# Family OS Workspace Instructions

This folder is the working area for the Family OS household management system.

## Read Shared Planning Docs

Before non-trivial architecture, roadmap, schema, or multi-step feature work, also read:

- `docs/familyos-roadmap.md`
- `docs/familyos-engineering-principles.md`

Treat those docs as the shared project status and delivery rules for future Family OS work. Update them when a phase meaningfully changes or a new cross-cutting engineering rule is introduced.

## Use The Family OS Skill First

For any request related to household data or the Family OS Google Sheets workbook, load and follow the `family-os-sheets` skill before taking action.

When `FAMILY_OS_API_URL` and `FAMILY_OS_API_KEY` are configured, also load `family-os-api` and use its compact Apps Script API before reading Google Sheets directly. Fall back to `family-os-sheets` when API mode is unavailable or the requested operation is not supported.

Exception for the narrow Telegram BB + inventory V2 runtime:

- when the local Telegram Codex Bridge is handling the BB + inventory V2 flow, load and follow `family-os-bb-inventory` first
- in that V2 flow, use `family-os-bb-inventory-api` as the only live data execution path
- keep `family-os-sheets` and `family-os-api` as legacy/Desktop references, not the active Telegram runtime path

For Apps Script deployment, secret rotation, API contract changes, or API troubleshooting, use `family-os-api-admin`.

For Telegram Bot setup, allowlist changes, OpenAI API configuration, long-polling operation, or webhook deployment, use `family-os-telegram-bot-admin`.

## Telegram Codex Bridge Project Mode

When the local Telegram Codex Bridge invokes this workspace, treat the message as a normal Codex project turn in this folder. Load and follow this `AGENTS.md`.

For the active BB + inventory V2 Telegram runtime:

- use `family-os-bb-inventory` first
- use `family-os-bb-inventory-api` as the only live execution path
- keep `family-os-sheets` and `family-os-api` as legacy/Desktop references, not the active Telegram path

Keep the Telegram bridge thin so the runtime can maximize LLM reasoning:

- the bridge should stay limited to transport, allowlisting, thread resume, callback transport, minimal clarification / transcript state, runtime-command brokerage, and safety boundaries
- do not move household decision logic, reply-writing rules, inventory/task interpretation rules, or recap formatting rules into the bridge when the skill + LLM can decide them from runtime context
- if a helper execution result contains useful state such as `quantity_on_hand`, pass that result back into the model turn and let the LLM decide how to explain it to the user
- prefer putting reusable behavior in the active skill, runtime references, and runtime knowledge files, not as hardcoded bridge-side rules
- only add bridge logic when it is truly transport-level or safety-critical, not because the model could be prompted better

Telegram private-chat allowlisting is enforced by the local Bot before a Codex turn starts. Telegram may request routine household reads and audited daily records. Do not reveal secrets, local authentication data, document contents, identity numbers, or banking credentials in Telegram replies. Require Codex Desktop for secret rotation, deployment, plugin maintenance, or operations that need interactive approval.

Relevant requests include:

- BB feeding, sleep, diaper, health, or daily logs
- household inventory purchases, usage, stock counts, and restock reminders
- income, expenses, salary, cash flow, budgets, and assets
- household tasks, reminders, documents, caregivers, and property planning
- Dashboard questions or Google Sheets changes
- Family OS schema, audit history, plugin, or workflow changes
- Apps Script API deployment or maintenance
- Telegram Bot setup or maintenance

Prefer the skill's fast route for routine daily records. Use its standard route for ambiguous requests, schema changes, master-data edits, or unfamiliar values.

## Data Rules

- Treat the Family OS Google Sheets workbook as the live source of truth.
- Prefer the compact Apps Script API for supported daily reads and writes when configured.
- Preserve the `audit_log` requirements defined by the skill.
- Do not write directly to formula columns, `dashboard`, `dashboard_helpers`, or `checks`.
- Keep timestamps in `Asia/Hong_Kong` using the exact format required by the skill.
- Ask before writing when the date, quantity, person, or event meaning is ambiguous.

## Scope

Keep Family OS changes focused. Do not build a Web App, connect external APIs, or expand the schema unless the user explicitly requests it.
