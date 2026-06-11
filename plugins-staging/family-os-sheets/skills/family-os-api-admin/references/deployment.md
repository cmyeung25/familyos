# Deployment

## Local Files

Use:

```text
family-os-apps-script/Code.gs
family-os-apps-script/appsscript.json
family-os-apps-script/DEPLOYMENT.md
```

## Required Steps

1. Open the Family OS spreadsheet.
2. Open `Extensions > Apps Script`.
3. Replace `Code.gs`.
4. Enable the manifest file in project settings and replace `appsscript.json`.
5. Add script property `FAMILY_OS_API_KEY` with a locally generated random secret.
6. Authorize spreadsheet access once.
7. Deploy as a Web App.
8. Configure `FAMILY_OS_API_URL` and `FAMILY_OS_API_KEY` locally.
9. Run:

```powershell
node skills-staging/family-os-api/scripts/family_os_api_client.mjs health
node skills-staging/family-os-api/scripts/family_os_api_client.mjs get_low_stock_items
```

10. Perform one controlled test write and confirm its `audit_log` row.

## Deployment Boundary

The local Codex workspace can generate and validate the source. Creating the Apps Script project, granting Google authorization, and selecting deployment access require the user's authenticated Google session.
