---
name: family-os-api-admin
description: Deploy, configure, validate, and maintain the Family OS Apps Script Web App and its local client integration. Use when setting up API mode, changing the API contract, rotating the API secret, troubleshooting deployment, or updating the Family OS Apps Script source.
---

# Family OS API Admin

Use this skill for API setup and maintenance. Do not load it for routine household logging.

## Source

The Apps Script scaffold lives in:

```text
family-os-apps-script/
  Code.gs
  appsscript.json
  DEPLOYMENT.md
  requests.example.json
```

## Workflow

1. Read [deployment.md](references/deployment.md).
2. Validate the local scaffold before deployment.
3. Deploy or update the Apps Script Web App using the user's authenticated Google session.
4. Store the endpoint and secret only as local environment configuration.
5. Run `health`, a compact read, and a controlled test write.
6. Confirm the write generated an `audit_log` row.

## Security Rules

- Never hardcode the API secret in code, Sheets, skills, audit records, or chat.
- Keep the Web App action whitelist narrow.
- Do not add arbitrary range reads or generic table-write endpoints.
- Use `PropertiesService.getScriptProperties()` for the secret.
- Prefer the narrowest deployment access option that still permits the local client to call the Web App.

## References

- Read [deployment.md](references/deployment.md) for setup and validation.
- Read [api-design.md](references/api-design.md) before changing actions or authentication.
