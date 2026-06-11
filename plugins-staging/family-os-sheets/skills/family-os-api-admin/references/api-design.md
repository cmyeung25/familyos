# API Design

## Design Goal

Reduce LLM token usage by returning compact, pre-filtered JSON instead of full spreadsheet ranges.

## Allowed Reads

- health
- low-stock items
- inventory snapshot
- overdue tasks
- upcoming tasks
- monthly cash flow
- recent BB logs
- dashboard snapshot

## Allowed Writes

- append BB event
- append inventory movement
- append finance transaction

Each write:

1. validates schema version
2. validates required values
3. uses a script lock
4. appends the business record
5. appends `audit_log`
6. returns a compact result

## Authentication

The client sends the API key inside the HTTPS POST JSON body. The server compares it with the `FAMILY_OS_API_KEY` Script Property. Apps Script Web App events do not provide a reliable generic custom-header interface, so the POC does not use an `Authorization` header.

This is appropriate for a personal POC only. A future production API should use a stronger identity model.
