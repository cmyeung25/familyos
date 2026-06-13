# API Contract

The client sends authenticated JSON `POST` requests to the Apps Script Web App. Use the smallest action that answers the user's request.

## Read Actions

| Action | Payload | Purpose |
| --- | --- | --- |
| `health` | `{}` | Verify API binding and schema version. |
| `get_low_stock_items` | `{}` | Return only items requiring restock. |
| `get_inventory_snapshot` | `{}` | Return compact inventory status. |
| `get_overdue_tasks` | `{}` | Return only overdue tasks. |
| `get_upcoming_tasks` | `{"days": 7}` | Return incomplete tasks due soon. |
| `get_monthly_cashflow` | `{"month": "2026-06"}` | Return monthly income, expense, savings, and expense categories. |
| `get_recent_baby_logs` | `{"limit": 20, "log_type": "feeding"}` | Return recent compact BB records. `log_type` is optional. |
| `get_dashboard_snapshot` | `{"month": "2026-06", "days": 7}` | Return compact cash flow, low stock, overdue tasks, and upcoming tasks. |
| `get_telegram_allowlist` | `{}` | Return active `people` rows that have `telegram_user_id`, for Telegram allowlist management. |

## Write Actions

### `append_baby_log`

Example request file:

```json
{
  "action": "append_baby_log",
  "payload": {
    "event_at": "2026-06-01 07:30:00+08:00",
    "log_type": "feeding",
    "log_subtype": "milk",
    "value_number": 90,
    "unit": "ml"
  },
  "request_text": "BB 今日 07:30 飲奶 90 ml"
}
```

The API normalizes milk-volume feeding descriptions and writes `audit_log`.

### `record_inventory_movement`

Example request file:

```json
{
  "action": "record_inventory_movement",
  "payload": {
    "item_id": "itm_formula",
    "movement_type": "consume",
    "quantity_delta": -1
  },
  "request_text": "用咗一罐奶粉"
}
```

Inbound quantities must be positive. Outbound quantities must be negative.

### `record_inventory_purchase_batch`

Use this for shopping trips containing existing or new inventory items. New items are created automatically. Existing items are reused only when category and unit match.

Example request file:

```json
{
  "action": "record_inventory_purchase_batch",
  "payload": {
    "event_at": "2026-06-01 12:00:00+08:00",
    "items": [
      {
        "item_key": "cooking_oil",
        "item_name": "油",
        "category": "groceries",
        "unit": "bottle",
        "quantity": 1
      },
      {
        "item_key": "salt",
        "item_name": "salt",
        "category": "groceries",
        "unit": "pack",
        "quantity": 1
      },
      {
        "item_key": "sugar",
        "item_name": "糖",
        "category": "groceries",
        "unit": "pack",
        "quantity": 2
      },
      {
        "item_key": "instant_noodles",
        "item_name": "公仔麵",
        "category": "groceries",
        "unit": "pack",
        "quantity": 10,
        "expiry_date": "2026-12-31"
      }
    ]
  },
  "request_text": "今日買咗1支油，1包salt，2包糖，仲有10包公仔麵，26年12月到期"
}
```

Rules:

- `item_key` is required for deterministic new item IDs such as `itm_cooking_oil`.
- Allowed categories and units are pinned by the API.
- If an existing item has a different category or unit, the API rejects the batch for clarification.
- `expiry_date` uses `yyyy-mm-dd`.
- Each new item and movement receives its own `audit_log` row.

### `record_inventory_consume_batch`

Use this for one household activity that consumes several existing inventory items.

Example request file:

```json
{
  "action": "record_inventory_consume_batch",
  "payload": {
    "event_at": "2026-06-01 22:28:00+08:00",
    "items": [
      {
        "item_id": "itm_cooking_oil",
        "item_name": "油",
        "unit": "bottle",
        "quantity": 1
      },
      {
        "item_id": "itm_salt",
        "item_name": "salt",
        "unit": "pack",
        "quantity": 1
      },
      {
        "item_id": "itm_sugar",
        "item_name": "糖",
        "unit": "pack",
        "quantity": 2
      }
    ]
  },
  "request_text": "今日用咗1支油，1包salt，2包糖，下午10:28"
}
```

Rules:

- Each item must already exist.
- The requested unit must match the item master unit.
- The API creates negative `consume` movements and one `audit_log` row per movement.

### `append_finance_transaction`

Example request file:

```json
{
  "action": "append_finance_transaction",
  "payload": {
    "transaction_date": "2026-06-01",
    "type": "income",
    "category": "salary",
    "item_name": "monthly salary",
    "amount": 100000,
    "currency": "HKD",
    "fx_rate_to_hkd": 1,
    "payment_method": "bank_transfer"
  },
  "request_text": "記錄 6 月份出糧 HKD 100,000"
}
```

## Client Usage

Read:

```powershell
.\scripts\invoke_family_os_api.cmd get_dashboard_snapshot --payload-json '{"month":"2026-06","days":7}'
```

Write:

```powershell
.\scripts\invoke_family_os_api.cmd --request-file .codex-tmp/family-os-request.json
```

## Extended Daily Actions

Use these narrow actions for the Telegram Codex Bridge. All reads return at most 100 rows. There is no generic range-read or generic table-write action.

### Read Actions

| Action | Supported filters |
| --- | --- |
| `query_tasks` | `limit`, `category`, `status`, `owner_person_id`, `related_person_id`, `related_item_id`, `from`, `to` |
| `get_task_context_hints` | `status`, `applies_to_category`, `applies_to_related_person_id`, `applies_to_owner_person_id`, optional `limit` |
| `query_household_memory` | `limit`, `memory_type`, `category`, `status`, `owner_person_id`, `related_person_id`, `subject`, `location`, `query_text` |
| `query_finance_transactions` | `limit`, `month`, `type`, `category`, `payer_person_id` |
| `get_finance_budgets` | `limit`, `month_start`, `category`, `owner_person_id` |
| `query_asset_accounts` | `limit`, `owner_person_id`, `asset_type`, `liquidity_class`, `include_in_cash_assets`, `status` |
| `get_latest_asset_values` | `limit`, `owner_person_id`, `asset_account_id` |
| `query_caregivers` | `limit`, `caregiver_type`, `person_id`, `from`, `to` |
| `query_caregiver_records` | `limit`, `caregiver_id`, `record_type`, `status`, `from`, `to` |
| `query_properties` | `limit`, `district`, `status`, `from`, `to` |
| `query_property_scenarios` | `limit`, `property_id`, `status` |
| `query_documents` | `limit`, `category`, `owner_person_id`, `status`, `renewal_required`, `from`, `to` |
| `get_expiring_documents` | `limit`, `category`, `owner_person_id` |

### Write Actions

| Action | Payload |
| --- | --- |
| `append_task` | Task fields except IDs and formula columns |
| `append_household_memory` | Household-memory fields except IDs and metadata |
| `update_task` | `task_id`, `patch` |
| `update_inventory_expiry_date` | `item_id` or `item_name`, `next_expiry_date`, optional `remarks` |

`get_task_context_hints` reads reusable task reminder hints from the `task_context_hints` sheet. One-off task-specific hints should stay in `tasks.remarks`, typically with explicit markers like `提醒：...` or `提示：...`.
| `append_finance_budget` | `month_start`, `category`, `budget_amount_hkd`, optional owner and remarks |
| `update_finance_budget` | `budget_id`, `patch` |
| `append_asset_snapshot` | `as_of_date`, `asset_account_id`, `asset_value`, `liability_amount`, optional remarks |
| `append_caregiver_record` | Caregiver-record fields except ID and metadata |
| `update_caregiver_record` | `caregiver_record_id`, `patch` |
| `append_property` | Property input fields except ID, formula columns, and metadata |
| `update_property` | `property_id`, `patch` |
| `append_property_scenario` | Scenario input assumptions except ID, formula columns, and metadata |
| `update_property_scenario` | `scenario_id`, `patch` |
| `append_document` | Document metadata only; never document contents or identity numbers |
| `update_document` | `document_id`, `patch` |

All updates locate records by ID, reject unsupported patch fields, preserve formula columns, and append `audit_log`.
