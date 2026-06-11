# Family OS Apps Script Deployment

## Purpose

Deploy `Code.gs` as an Apps Script Web App. The Web App returns compact JSON results and writes audited household events without sending full Google Sheets tables to the LLM.

The Apps Script API should stay narrow and data-oriented:

- return compact state and write results
- do not embed Telegram reply wording or household recap formatting into the API
- let the Telegram runtime skill + LLM decide how to explain API results to the user

## Required Script Property

Create a random secret locally. Do not paste it into `Code.gs`.

In Apps Script project settings, add:

| Property | Value |
| --- | --- |
| `FAMILY_OS_API_KEY` | a long random secret |

Optional override:

| Property | Value |
| --- | --- |
| `FAMILY_OS_SPREADSHEET_ID` | `1kyKGz6GuScz3GblIVTq12-L6LqzxAQpBmGZB74nifpc` |

## Deploy

1. Create an Apps Script project bound to the Family OS spreadsheet or as a standalone project.
2. Replace `Code.gs` with the local `Code.gs` content.
3. Enable the manifest file in project settings and replace `appsscript.json`.
4. In the Family OS workbook, add `telegram_user_id` to the `people` sheet header and fill it for any Telegram users that should be allowlisted.
5. Add the script property.
6. Run a function once from the editor and authorize spreadsheet access.
7. Select `Deploy > New deployment > Web app`.
8. Execute the app as the owner.
9. Choose the narrowest access option that still allows the local Codex client to call the endpoint.
10. Copy the `/exec` URL.

## Local Client Configuration

Set these environment variables only in the local Codex environment:

```text
FAMILY_OS_API_URL=https://script.google.com/macros/s/.../exec
FAMILY_OS_API_KEY=<same random secret>
```

Do not commit or store the secret in the workbook, skills, audit log, or chat.

For this workstation, run:

```powershell
.\family-os-apps-script\configure-local-api.ps1
```

The script prompts for the API key locally, stores the URL and API key as user-level environment variables, and runs an authenticated `health` check. Restart Codex afterwards so new threads inherit the environment variables.

After deployment, validate the new Telegram allowlist route:

```powershell
.\.agents\skills\family-os-api\scripts\invoke_family_os_api.cmd get_telegram_allowlist
```
