# Family OS BB MariaDB Draft

This folder is the initial MariaDB design for the Gary BB iPad data path only.

It does not replace Google Sheets for Dobby, tasks, household memory, inventory, or Google Calendar. It does not install MariaDB, migrate live data, or change the current iPad runtime.

## Scope

MariaDB becomes the source of truth only for:

- BB feeding, diaper, and temperature records
- BB log soft deletion and audit history
- BB statistics and time-range queries

Google Sheets and Google Calendar remain the source of truth for Dobby's tasks, reminders, household memory, and schedule management.

## Proposed Runtime

```text
iPad PWA
  -> BB Data API on NAS
  -> MariaDB database: familyos_gary_bb

Dobby / reminder worker
  -> Apps Script API
  -> Google Sheets + Google Calendar
```

There is intentionally no write synchronization between the two paths. Dobby must not read or write current BB logs after the MariaDB cutover; otherwise it could answer from stale Sheet data.

## Structured Data Model

The old Sheet model stores all BB events in `baby_log`, and some feeding fields are encoded in `remarks`. The MariaDB model keeps one common event row and one strongly typed detail row per event type:

```text
baby_events
  ├─ baby_feeding_logs
  │    └─ baby_feeding_medications (zero or more)
  ├─ baby_diaper_logs
  └─ baby_temperature_logs

baby_event_audit
baby_event_imports
```

| Table | Responsibility |
| --- | --- |
| `schema_migrations` | Applied SQL migration history. |
| `baby_profiles` | Minimal BB profile data used for tenancy and age. |
| `baby_events` | Common identity, event time, status, source, actor, version, and free-text notes. |
| `baby_feeding_logs` | Feeding method, prepared/consumed amount, feed timing, expiry, and medicine flag. |
| `baby_feeding_medications` | Optional named medicine and dosage for a feeding. |
| `baby_diaper_logs` | Structured pee and poo intensity values. |
| `baby_temperature_logs` | Celsius value and optional measurement method. |
| `baby_event_audit` | Append, update, delete, and import before/after history. |
| `baby_event_imports` | One-time source row mapping and original imported payload. |

The schema is in [001_initial_schema.sql](migrations/001_initial_schema.sql). Field-level mapping and migration rules are in [data-model.md](data-model.md).

## Schema Principles

- Preserve existing `baby_log_id` values as `event_id` during the historical import.
- Keep structured values in typed columns, never in `notes` or `remarks`.
- Use `notes` only for real narrative context that has no stable field yet.
- Use soft deletion only. A deleted event remains in `baby_events` and receives an audit entry.
- Store all database datetimes as UTC `DATETIME(3)`. The BB Data API converts the existing Hong Kong `+08:00` request/response format at its boundary.
- Use `row_version` for optimistic concurrency. The first API may still accept `expected_updated_at` while the iPad migrates to `expected_row_version`.
- Use nullable `client_request_id` as an idempotency key for future iPad create requests. Existing imported logs do not need one.
- Treat the BB Data API, not direct SQL, as the only writer after cutover. It must write the parent event, typed detail, and audit row in one transaction.

## Target BB Data API

The target API should expose typed commands because the iPad already has separate feeding, diaper, and temperature forms:

- `create_feeding_log`, `update_feeding_log`
- `create_diaper_log`, `update_diaper_log`
- `create_temperature_log`, `update_temperature_log`
- `get_recent_baby_events`, `query_baby_events`
- `delete_baby_event`
- `get_bb_statistics`

For the cutover period only, the API may keep adapters for the current generic actions:

- `get_recent_baby_logs`
- `query_baby_logs`
- `append_baby_log`
- `update_baby_log`
- `delete_baby_log`

Those adapters map current requests into typed writes and return the old flattened response shape. They are compatibility code, not the long-term domain model.

## Migration Sequence

1. Start MariaDB with an empty `familyos_gary_bb` database and apply `001_initial_schema.sql`.
2. Implement a NAS-only BB Data API with typed writes, transaction boundaries, audit writes, and timezone conversion.
3. Export historical `baby_log` rows from Sheets through a controlled one-time import tool.
4. Parse legacy feeding `remarks` into typed feeding columns, diaper JSON from `value_text` into typed diaper columns, and retain the full original source payload in `baby_event_imports`.
5. Verify record counts, IDs, status, event timestamps, and samples for each event type.
6. Point only the iPad proxy to the BB Data API and run CRUD plus statistics UAT.
7. Keep the old Sheets `baby_log` tab read-only as an archive during the rollback window.
8. After a stable period, remove BB log actions from Dobby's available runtime actions and direct BB-log questions to the iPad app.

## Rollback

Before the iPad cutover, rollback is simply retaining the existing Apps Script endpoint.

After the cutover, rollback means restoring the iPad endpoint to Apps Script and stopping new MariaDB writes. Do not merge divergent writes automatically. Any MariaDB records created during the rollback decision must be reviewed and imported deliberately, with audit entries, before Sheets becomes writable again.

## Backup Requirement

Before production cutover, implement and test:

- nightly logical dump of `familyos_gary_bb`
- NAS snapshot or volume protection
- Hyper Backup or another off-NAS copy
- a documented restore test into a separate empty database

RAID and snapshots alone are not a complete backup strategy.

## Deliberately Deferred

- MariaDB deployment and credentials
- historical data import
- iPad API implementation and endpoint cutover
- Dobby access to current BB logs
- cross-device bottle timer state
- Brother BB database
