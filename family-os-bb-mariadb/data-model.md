# BB Data Model

## Event And Detail Ownership

Every BB record has exactly one `baby_events` row and exactly one matching detail row for its `event_type`. The BB Data API owns this rule and writes all related rows in one transaction.

| Event type | Detail table | Typed values |
| --- | --- | --- |
| `feeding` | `baby_feeding_logs` | feeding method, prepared amount, consumed amount, start/end time, bottle expiry, medicine flag |
| `diaper` | `baby_diaper_logs` | pee intensity, poo intensity, optional poo colour and consistency |
| `temperature` | `baby_temperature_logs` | temperature in Celsius, optional measurement method and device |

`baby_feeding_medications` is optional. It records named medicine and dosage only when that detail is known; the simple iPad checkbox writes `medicine_given` without inventing a medicine name.

## Field Mapping From Google Sheets

| Legacy `baby_log` field | MariaDB destination | Rule |
| --- | --- | --- |
| `baby_log_id` | `baby_events.event_id` | Preserve exactly. |
| `household_id`, `baby_person_id` | `baby_events` | Preserve exactly. |
| `event_at` | `baby_events.event_at` | Parse `+08:00`, convert to UTC. |
| `log_type` | `baby_events.event_type` | Only feeding, diaper, and temperature are in this first cutover. |
| feeding `log_subtype` | `baby_feeding_logs.feeding_method` | Normalize `milk` and `formula_milk` to `formula_milk`. |
| feeding `value_number` | `baby_feeding_logs.consumed_amount_ml` | Existing actual intake. |
| feeding `started_at`, `ended_at` | `baby_feeding_logs.feed_started_at`, `feed_ended_at` | Parse and convert to UTC. |
| feeding `remarks.prepared_ml` | `baby_feeding_logs.prepared_amount_ml` | Parse only explicit numeric marker. |
| feeding `remarks.expires_at` | `baby_feeding_logs.bottle_expires_at` | Parse only explicit timestamp marker. |
| feeding `remarks.medicine_given` | `baby_feeding_logs.medicine_given` | Parse only `true` or `false`. |
| diaper `value_text` JSON | `baby_diaper_logs.pee_intensity`, `poo_intensity` | Reject invalid intensity instead of guessing. |
| temperature `value_number` | `baby_temperature_logs.temperature_celsius` | Validate 30.0 to 45.0. |
| status and metadata fields | `baby_events` | Preserve active/deleted state and timestamps. |
| full original source row | `baby_event_imports.source_payload` | Retain as import evidence, not runtime application data. |

## Statistics Examples

The typed tables remove the need to parse text before statistics:

```sql
-- Daily actual milk intake.
SELECT DATE(event.event_at) AS event_day_utc,
       SUM(feeding.consumed_amount_ml) AS total_ml,
       COUNT(*) AS feed_count
FROM baby_events AS event
JOIN baby_feeding_logs AS feeding ON feeding.event_id = event.event_id
WHERE event.status = 'active'
  AND event.baby_person_id = ?
  AND event.event_at >= ?
  AND event.event_at < ?
GROUP BY DATE(event.event_at)
ORDER BY event_day_utc;
```

```sql
-- Daily diaper counts by pee and poo intensity.
SELECT DATE(event.event_at) AS event_day_utc,
       COUNT(*) AS diaper_count,
       SUM(diaper.pee_intensity <> 'none') AS pee_count,
       SUM(diaper.poo_intensity <> 'none') AS poo_count
FROM baby_events AS event
JOIN baby_diaper_logs AS diaper ON diaper.event_id = event.event_id
WHERE event.status = 'active'
  AND event.baby_person_id = ?
  AND event.event_at >= ?
  AND event.event_at < ?
GROUP BY DATE(event.event_at)
ORDER BY event_day_utc;
```

The API converts reporting boundaries to UTC before these queries, so an `Asia/Hong_Kong` day remains correct.

## Rules For Future Event Types

Do not put a new event type's structured values into `notes`, JSON blobs, or a generic `value_number` field.

Instead:

1. Add one migration that extends `baby_events.event_type`.
2. Add a dedicated detail table with its own validation and indexes.
3. Add typed API commands and an audit-aware migration test.
4. Add statistics queries only after the data meaning is explicit.

Examples of later detail tables are `baby_sleep_logs`, `baby_measurement_logs`, and `baby_symptom_logs`.
