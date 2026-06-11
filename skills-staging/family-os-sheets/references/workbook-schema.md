# Workbook Schema

Expected workbook schema: `family_os_poc_v1`.

## Core Rules

- Use `household_id = hh_home`.
- Each business sheet has a text primary key, `created_at`, `updated_at`, `created_by`, `updated_by`, and optional `remarks`.
- Formula fields are read-only.
- Foreign keys must match existing IDs before writing.

## Sheets

| Sheet | Primary key | Purpose | Formula fields |
| --- | --- | --- | --- |
| `households` | `household_id` | household settings and schema version | none |
| `people` | `person_id` | husband, wife, baby, helper, confinement nanny | none |
| `tasks` | `task_id` | household Jira | `is_overdue` |
| `finance_transactions` | `transaction_id` | income, expense, transfer ledger | `month_start`, `amount_hkd` |
| `finance_budgets` | `budget_id` | monthly category budgets | none |
| `asset_accounts` | `asset_account_id` | asset and liability account master | none |
| `asset_snapshots` | `asset_snapshot_id` | point-in-time account values | `net_value`, `is_latest`, `cash_asset_value_hkd` |
| `inventory_items` | `item_id` | household item master | `quantity_on_hand`, `last_movement_at`, `is_low_stock`, `is_expiring_soon`, `needs_restock` |
| `inventory_movements` | `movement_id` | purchases, consumption, adjustments | none |
| `baby_log` | `baby_log_id` | baby event log | `duration_minutes`, `baby_age_days` |
| `caregivers` | `caregiver_id` | helper and confinement nanny master | `days_to_contract_end` |
| `caregiver_records` | `caregiver_record_id` | schedules, leave, rules, handover | none |
| `properties` | `property_id` | researched and visited properties | `price_per_sqft` |
| `property_scenarios` | `scenario_id` | lightweight affordability scenarios | calculated amount and ratio fields |
| `documents` | `document_id` | metadata only | `days_to_expiry`, `is_expiring_soon` |
| `audit_log` | `audit_id` | immutable write history | none |

## Important Dropdowns

- Task category: `baby`, `finance`, `home`, `helper`, `medical`, `property`, `pet`, `document`
- Task status: `open`, `in_progress`, `waiting`, `done`, `cancelled`
- Finance type: `income`, `expense`, `transfer`
- Ledger status: `posted`, `void`
- Inventory movement: `purchase`, `consume`, `adjustment_in`, `adjustment_out`, `discard`, `return`
- Baby log type: `vaccination`, `clinic_visit`, `doctor_visit`, `weight`, `height`, `feeding`, `sleep`, `diaper`, `temperature`, `symptom`, `medicine`, `supplies`, `note`

Read `lookup_values` for the complete live dropdown vocabulary before writing.
