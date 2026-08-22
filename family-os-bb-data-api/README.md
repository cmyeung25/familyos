# Family OS BB Data API

This is the NAS-internal MariaDB API for Gary's iPad BB logging surface. It is not a Telegram or Dobby API.

```text
iPad PWA -> same-origin PWA proxy -> familyos-bb-data-api -> MariaDB
```

The container publishes no NAS host port. Only the PWA container on the Docker network calls `POST /v1/actions`; every request needs `FAMILY_OS_BB_DATA_API_KEY`.

## Supported Actions

- `health`
- `get_recent_baby_logs`
- `query_baby_logs`
- `append_baby_log`
- `update_baby_log`
- `delete_baby_log`

The action payload and result shape intentionally follow the current iPad-compatible Apps Script contract. The service writes typed feeding, diaper, and temperature rows in one MariaDB transaction, increments `row_version` for updates/deletes, and appends a `baby_event_audit` row.

## Secrets

Keep these NAS-only files outside Git:

```text
instances/gary/secrets/bb-mariadb.env
instances/gary/secrets/bb-data-api.env
instances/gary/secrets/bb-data-api-client.env
```

`bb-data-api.env` needs:

```text
FAMILY_OS_BB_DATA_API_KEY=<random secret>
FAMILY_OS_BB_HOUSEHOLD_ID=hh_home
FAMILY_OS_BB_DEFAULT_BABY_PERSON_ID=per_baby
FAMILY_OS_BB_MIGRATION_FROM=2026-06-07 00:00:00+08:00
```

The database connection fields stay only in `bb-mariadb.env`. The PWA client file selects either `apps_script` or `mariadb`; it is the only place that receives the internal API key apart from this API container.

## Migration

Run `scripts/synology/migrate-bb-logs-to-mariadb.sh` after the Data API is healthy. It reads the existing Apps Script `query_baby_logs` action in 30-day windows and writes only the supported iPad types. Every imported source ID is stored in `baby_event_imports`, so reruns skip records already imported.

Source types outside feeding, diaper, and temperature remain unchanged in Google Sheets and appear under `unsupported` in the JSON report. A migration error exits non-zero and prevents an automatic cutover.

## Switch And Rollback

```sh
sh scripts/synology/switch-bb-ipad-backend.sh mariadb
sh scripts/synology/switch-bb-ipad-backend.sh apps_script
```

The rollback does not delete MariaDB data. It only directs the PWA back to its existing Apps Script path.
