# Read-Write Contract

## Write Policy

Append only:

- `finance_transactions`
- `asset_snapshots`
- `inventory_movements`
- `baby_log`
- `audit_log`

Append or update by primary key:

- `tasks`
- `finance_budgets`
- `inventory_items`
- `caregiver_records`
- `properties`
- `property_scenarios`
- `documents`

Administrator changes only:

- `households`
- `people`
- `lookup_values`
- `system_settings`

Never write:

- `dashboard`
- `dashboard_helpers`
- `checks`
- any formula column listed in `workbook-schema.md`

## Validation

For canonical daily actions listed in `fast-paths.md`, use the fast route: rely on its pinned aliases, stable dropdowns, and writable columns. Do not re-read full headers or `lookup_values`.

For all other writes:

1. Read sheet headers and only the relevant `lookup_values`.
2. Confirm IDs referenced by foreign keys exist.
3. Finance inputs use a positive `amount`; use `type` to distinguish income, expense, and transfer.
4. Inventory purchases and inbound adjustments use positive `quantity_delta`. Consumption, disposal, and outbound adjustments use negative `quantity_delta`.
5. Use `Asia/Hong_Kong` timestamps formatted exactly as `yyyy-mm-dd hh:mm:ss+08:00`; use a space, never `T`.
6. Set `created_by` or `updated_by` to `codex`.

## Audit Log

For every LLM append or update, append one `audit_log` record:

`audit_id`, `household_id`, `changed_at`, `actor_type`, `actor_id`, `source`, `sheet_name`, `record_id`, `operation`, `changed_fields_json`, `before_json`, `after_json`, `request_text`, `result_status`, `created_at`.

Use `actor_type = codex`, `source = natural_language`, and preserve the user's original request in `request_text`.

## Confirmation

After writing, read only the changed row and matching audit row. For a fast-route write, compare the row against the canonical template in `fast-paths.md` and normalize any representational mismatch before replying. Reply in Cantonese with the record ID and a concise summary.
