---
name: family-os-sheets
description: Quickly read, query, and safely update the bound Family OS Google Sheets household workbook. Use for fast daily baby logs, inventory use or purchases, salary and expense entries, household finance, tasks, caregivers, documents, property planning, dashboard questions, and audited record updates.
---

# Family OS Sheets

## Prefer API Mode When Available

If both `FAMILY_OS_API_URL` and `FAMILY_OS_API_KEY` are configured, use the `family-os-api` skill for supported daily reads and append-only writes. Use this Sheets skill as the fallback for unsupported actions, API outages, schema administration, and direct workbook maintenance.

## Bound Workbook

Use the live workbook directly:

- Spreadsheet ID: `1kyKGz6GuScz3GblIVTq12-L6LqzxAQpBmGZB74nifpc`
- Household: `hh_home`
- Expected schema: `family_os_poc_v1`
- Timezone: `Asia/Hong_Kong`

At the first Family OS action in a thread, read only `households!A1:E2` from this spreadsheet ID and confirm `household_id = hh_home` plus `schema_version = family_os_poc_v1`. Reuse that confirmation for later actions in the same thread. Search Drive only when the bound spreadsheet cannot be opened.

Reuse thread-local facts aggressively: the verified binding, resolved item IDs, item units, sheet IDs, headers, and recently observed append positions. Do not re-read spreadsheet metadata, headers, `lookup_values`, or master rows unless the current action needs facts that have not already been established or a narrow verification is required before writing.

## Choose A Route

### Fast Route

Use the fast route by default for:

- a single BB event such as feeding, sleep, diaper, temperature, weight, or note
- an inventory purchase, use, discard, or adjustment for a known item
- a new inventory item when its name, category, and unit are clear and use the pinned inventory vocabulary
- a straightforward income or expense entry using standard categories
- a dashboard KPI or household inventory snapshot question

Read [fast-paths.md](references/fast-paths.md). For a canonical fast action, do not re-read `guide`, full sheet headers, or `lookup_values`. Use the known writable columns and aliases. Prefer one coherent batch write containing the event and its `audit_log` row. Re-read only the narrow written rows or the requested dashboard range.

### Standard Route

Use the standard route for unfamiliar master-data changes, unfamiliar aliases, non-standard dropdown values, record updates, schema questions, or any ambiguity that could change the meaning of a write. A clear new inventory item that uses the pinned vocabulary follows the inventory bootstrap path in `fast-paths.md`.

1. Read the target sheet headers.
2. Read only the relevant lookup values and foreign-key rows. Never read the full `lookup_values` sheet when a bounded range or targeted row search is sufficient.
3. Validate required values, dropdowns, dates, amounts, and foreign keys.
4. Apply the write and matching audit row.
5. Re-read the affected rows.

If the schema differs from `family_os_poc_v1`, read `guide` and stop writes until the schema is reviewed.

## Read References As Needed

- Read [fast-paths.md](references/fast-paths.md) for daily BB, inventory, simple finance, and dashboard requests.
- Read [workbook-schema.md](references/workbook-schema.md) before editing an unfamiliar sheet or checking foreign keys.
- Read [read-write-contract.md](references/read-write-contract.md) before a standard-route write or when a fast route cannot be used exactly.
- Read [dashboard-metrics.md](references/dashboard-metrics.md) when answering dashboard, finance, reminder, or affordability questions.
- Read [query-recipes.md](references/query-recipes.md) for common Cantonese requests.
- Read [migration-map.md](references/migration-map.md) only for schema administration or Supabase planning.

## Shared Write Rules

- Use record IDs, never row numbers, as identity.
- Append transaction-style records. Do not overwrite history.
- Append one `audit_log` row for every LLM write and preserve the original user request. If the user confirms or clarifies a previous request, keep both the original request and the follow-up in `request_text`; do not store only a reply such as `yes` or `係呀`.
- Use `Asia/Hong_Kong` timestamps formatted exactly as `yyyy-mm-dd hh:mm:ss+08:00`; use a space, never `T`.
- Ask before writing when the user's quantity unit conflicts with the item master unit and no explicit conversion is available. Do not silently treat packs, boxes, pieces, kilograms, or millilitres as interchangeable.
- For fast-route writes, compare the read-back row against the canonical template in `fast-paths.md`. Fix a mismatch before reporting success.
- A Codex-created event row may be updated in place only to normalize formatting or fill canonical fields without changing the event meaning. Append an `audit_log` row with `operation = update`, `before_json`, and `after_json`.
- If a date is impossible or meaningfully ambiguous, ask before writing.
- Reply in Cantonese with the changed record ID and a concise result.

## Safety Rules

- Do not write to `dashboard`, `dashboard_helpers`, `checks`, or formula columns.
- Do not store document contents, identity numbers, passwords, or banking credentials.
- Treat property scenarios as planning estimates, not mortgage or financial advice.
- For medical symptoms, record the user's description accurately and recommend professional care where appropriate; do not diagnose.
