# Fast Paths

Use these paths for routine household requests after the thread-level sentinel check in `SKILL.md`.

## Operating Rules

- Do not search Drive. Use spreadsheet ID `1kyKGz6GuScz3GblIVTq12-L6LqzxAQpBmGZB74nifpc`.
- Reuse the verified schema binding for the rest of the thread.
- For known aliases and canonical values below, skip full header and `lookup_values` reads.
- Prefer connector row append. If an explicit row number is required, read only the primary-key column to find the next blank row.
- Write the business record and `audit_log` row in one coherent batch when supported.
- Read back only the new business row and audit row.
- Before replying, compare the read-back business row with the applicable canonical template below. Normalize any mismatch and audit the correction.

## Stable IDs And Aliases

| Meaning | Stable ID | Common aliases |
| --- | --- | --- |
| BB | `per_baby` | `BB`, `bb`, `baby`, `阿B` |
| Formula milk | `itm_formula` | `奶粉`, `初生奶粉`, `formula` |
| Diaper | `itm_diaper` | `尿片`, `片片`, `diaper` |
| Baby wipes | `itm_baby_wipes` | `濕紙巾`, `濕巾`, `baby wipes` |
| Toilet paper | `itm_toilet_paper` | `廁紙`, `toilet paper` |
| Cleaning supplies | `itm_cleaning` | `清潔用品` |
| Medicine | `itm_medicine` | `常用藥物`, `藥物` |
| Cat food | `itm_cat_food` | `貓糧` |
| Cat litter | `itm_cat_litter` | `貓砂` |

If an alias does not clearly map to one row, use the standard route.

## Baby Log Append

Sheet: `baby_log`

Writable columns:

- `A:L`: `baby_log_id`, `household_id`, `event_at`, `baby_person_id`, `log_type`, `log_subtype`, `description`, `value_number`, `value_text`, `unit`, `started_at`, `ended_at`
- `O:V`: `related_task_id`, `recorded_by_person_id`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `remarks`

Never overwrite formula columns `M:N`.

Defaults:

- `household_id = hh_home`
- `baby_person_id = per_baby`
- `status = active`
- `created_by = codex`
- `updated_by = codex`
- format `event_at`, `created_at`, and `updated_at` exactly as `yyyy-mm-dd hh:mm:ss+08:00`; use a space, never `T`
- Use `baby_<yyyymmdd>_<hhmmss>_<nnn>` for IDs.

### Feeding Canonical Template

For a milk-volume feeding record, always write:

- `log_type = feeding`
- `log_subtype = milk` when the user does not specify a more precise subtype
- `description = BB 飲奶 <value_number> ml`
- `value_number = <numeric volume>`
- `value_text = ""`
- `unit = ml`
- `remarks = 由自然語言即時記錄`

Do not shorten `description` to `飲奶`. Do not leave `log_subtype` or `remarks` blank.

Allowed explicit feeding subtypes:

- `milk`: unspecified milk
- `formula_milk`: formula milk explicitly stated by the user
- `expressed_breast_milk`: expressed breast milk explicitly stated by the user
- `breastfeeding`: direct breastfeeding; use `duration_minutes` through `started_at` and `ended_at` where available

Examples:

| Request | Canonical fields |
| --- | --- |
| `BB 今日 07:30 飲奶 90 ml` | `log_type=feeding`, `log_subtype=milk`, `description=BB 飲奶 90 ml`, `value_number=90`, `unit=ml`, `remarks=由自然語言即時記錄` |
| `BB 15:00 換片，有便便` | `log_type=diaper`, `value_text=stool` |
| `BB 23:10 開始瞓` | `log_type=sleep`, `started_at=<time>` |
| `BB 體溫 38.1 度` | `log_type=temperature`, `value_number=38.1`, `unit=celsius` |

### Controlled Normalization

If a Codex-created `baby_log` row differs only in representation, normalize it in place and append an `audit_log` update row. Examples:

- replace timestamp `2026-05-31T16:16:52+08:00` with `2026-05-31 16:16:52+08:00`
- fill blank feeding subtype with `milk`
- replace feeding description `飲奶` with `BB 飲奶 120 ml`
- fill blank remarks with `由自然語言即時記錄`

Do not use normalization to change the event time, amount, unit, or event type unless the user explicitly corrects the underlying fact.

For symptoms or concerning temperatures, record accurately and add a brief recommendation to seek professional care where appropriate.

## Inventory Movement Append

Sheet: `inventory_movements`

Writable columns `A:O`:

`movement_id`, `household_id`, `event_at`, `item_id`, `movement_type`, `quantity_delta`, `expiry_date`, `unit_cost_hkd`, `related_transaction_id`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `remarks`.

Defaults:

- `household_id = hh_home`
- `status = posted`
- `created_by = codex`
- `updated_by = codex`
- format `event_at`, `created_at`, and `updated_at` exactly as `yyyy-mm-dd hh:mm:ss+08:00`; use a space, never `T`
- Use `mov_<yyyymmdd>_<nnn>` for IDs.

Sign rules:

- purchase, adjustment in, or return: positive `quantity_delta`
- consume, discard, or adjustment out: negative `quantity_delta`

Examples:

| Request | Canonical fields |
| --- | --- |
| `用咗一罐奶粉` | `item_id=itm_formula`, `movement_type=consume`, `quantity_delta=-1` |
| `買咗 3 罐初生奶粉` | `item_id=itm_formula`, `movement_type=purchase`, `quantity_delta=3` |
| `用咗 10 片尿片` | `item_id=itm_diaper`, `movement_type=consume`, `quantity_delta=-10` |

## Finance Transaction Append

Sheet: `finance_transactions`

Known columns:

`A:V`: `transaction_id`, `household_id`, `transaction_date`, `month_start`, `type`, `category`, `sub_category`, `item_name`, `amount`, `currency`, `fx_rate_to_hkd`, `amount_hkd`, `payer_person_id`, `is_recurring`, `payment_method`, `related_property_id`, `status`, `created_at`, `updated_at`, `created_by`, `updated_by`, `remarks`.

Never overwrite formula columns `D` and `L`. For finance writes, read the live header row once per thread before using this fast path because formula columns sit between writable columns. Then write only the confirmed non-formula columns.

Defaults:

- positive amount
- `currency = HKD`
- `fx_rate_to_hkd = 1`
- `status = posted`
- `created_by = codex`
- `updated_by = codex`
- format datetime values exactly as `yyyy-mm-dd hh:mm:ss+08:00`; use a space, never `T`
- Use `txn_<yyyymmdd>_<nnn>` for IDs.

## Audit Append

Sheet: `audit_log`

Writable columns `A:O`:

`audit_id`, `household_id`, `changed_at`, `actor_type`, `actor_id`, `source`, `sheet_name`, `record_id`, `operation`, `changed_fields_json`, `before_json`, `after_json`, `request_text`, `result_status`, `created_at`.

Defaults:

- `household_id = hh_home`
- `actor_type = codex`
- `actor_id = codex`
- `source = natural_language`
- `operation = append`
- `result_status = success`
- Use `aud_<yyyymmdd>_<hhmmss>_<nnn>` for IDs.

## Fast Reads

| User request | Read range |
| --- | --- |
| 屋企而家有幾多庫存？ | `dashboard!A39:H55` |
| 今個月收入、支出、儲蓄幾多？ | `dashboard!A1:K10` |
| 有冇逾期事項或低庫存？ | `dashboard!A9:W10` |

Use wider source-sheet queries only when the user asks for details not present in these dashboard ranges.
