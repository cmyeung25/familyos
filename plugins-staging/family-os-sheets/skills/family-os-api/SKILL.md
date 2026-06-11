---
name: family-os-api
description: Use the deployed Family OS Apps Script Web App for token-efficient household queries and audited daily writes. Use for BB logs, inventory, finance, tasks, budgets, asset snapshots, caregivers, properties, documents, dashboard reads, and recent history when FAMILY_OS_API_URL and FAMILY_OS_API_KEY are configured.
---

# Family OS API

Use the Apps Script API before reading Google Sheets directly when both `FAMILY_OS_API_URL` and `FAMILY_OS_API_KEY` are configured.

## Workflow

1. Read [api-contract.md](references/api-contract.md) only for the requested operation.
2. On Windows, run `scripts/invoke_family_os_api.cmd` with the smallest supported action. Do not call `family_os_api_client.mjs` directly.
3. Pass the user's original request as `request_text` for writes.
4. Confirm `ok = true`. Report the returned record ID or compact query result in Cantonese.
5. If the wrapper fails, diagnose the failure first. Do not bypass the wrapper by calling `family_os_api_client.mjs` directly. Do not immediately read broad Google Sheets ranges.
6. Fall back to `family-os-sheets` only for unsupported actions or a confirmed API outage. Keep fallback reads narrow.

## Rules

- Never print, log, or store `FAMILY_OS_API_KEY`.
- Do not call arbitrary sheet ranges through the API. Use only whitelisted actions.
- On Windows, always invoke `scripts/invoke_family_os_api.cmd`. It loads user-level configuration and enables the system CA store.
- If a PowerShell execution policy blocks `.ps1`, use the `.cmd` wrapper. Do not change system execution policy.
- Do not send identity numbers, document contents, passwords, or bank credentials.
- For ambiguous writes, ask before calling the API.
- Treat property and cash-flow output as planning information, not financial advice.

## Client

The client reads credentials from environment variables:

```text
FAMILY_OS_API_URL
FAMILY_OS_API_KEY
```

Example:

```powershell
.\scripts\invoke_family_os_api.cmd get_low_stock_items
```

For writes, put the request in a temporary JSON file and use `--request-file`. Do not place secrets in that file.
