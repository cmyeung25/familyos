# Supabase Migration Map

Each business sheet maps to one table. Keep `household_id` as a foreign key on every household-owned table.

## Database Types

| Sheets value | Supabase type |
| --- | --- |
| text primary key | `text` external ID; optionally add UUID primary key later |
| money | `numeric(14,2)` |
| date | `date` |
| datetime | `timestamptz` |
| TRUE / FALSE | `boolean` |
| audit JSON text | `jsonb` |

## Formula Views

Do not migrate workbook formulas into raw tables. Recreate them as views:

- `v_dashboard_monthly_cashflow`
- `v_open_tasks`
- `v_inventory_status`
- `v_latest_asset_values`
- `v_expiring_documents`
- `v_property_affordability`

## Recommended Indexes

- `tasks(household_id, due_at, status)`
- `finance_transactions(household_id, transaction_date, type)`
- `inventory_movements(household_id, item_id, event_at)`
- `baby_log(household_id, event_at, log_type)`
- `documents(household_id, expiry_date)`
- `audit_log(household_id, changed_at)`
