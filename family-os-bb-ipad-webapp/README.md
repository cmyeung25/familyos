# Family OS BB iPad Web App

Touch-first iPad PWA for BB milk, diaper, and temperature logging. It keeps Google Sheets as the database by proxying through the existing Family OS Apps Script API.

The home dashboard is fixed to the landscape viewport and does not page-scroll. Temperature adjustment and feeding completion open in popups, and API writes show blocking progress and success states. The top-right `EN / 中` button switches the full interface between Traditional Chinese and English.

Diaper and bottle event times follow the current time until a step button is used. The current-time button and every successful record restore this live-following behavior. The default diaper selection is medium urine and no stool. Medicine is shown with a generated flat capsule icon rotated diagonally in the interface.

## Runtime Shape

```text
iPad PWA -> this Node server -> Apps Script API -> Google Sheets
```

The browser never receives `FAMILY_OS_API_KEY`. The server exposes only these whitelisted API actions:

- `health`
- `get_recent_baby_logs`
- `append_baby_log`
- `update_baby_log`
- `delete_baby_log`

## Start Locally

From this folder:

```powershell
$env:FAMILY_OS_API_URL = "<Apps Script Web App URL>"
$env:FAMILY_OS_API_KEY = "<API key>"
npm start
```

Then open:

```text
http://localhost:8787
```

Use `FAMILY_OS_BB_IPAD_PORT` or `PORT` to change the port.

`npm start` runs Node with `--use-system-ca`, matching the existing Family OS API wrapper behavior on this Windows machine.

## iPad Home Screen Use

For real iPad use, serve this app behind a trusted HTTPS origin, for example a Synology reverse proxy. iOS can add a website to the home screen over HTTP, but service worker caching and stronger PWA behavior require a secure context.

The production NAS service is defined in `../docker-compose.bb-ipad.yml`. From the NAS repo root, run `sh scripts/synology/deploy-bb-ipad.sh`; see `docs/synology-bb-ipad-deployment.md` for the reverse proxy, certificate, and iPad steps.

## Data Mapping

New records go to the existing `baby_log` sheet through `append_baby_log`. Supported recent rows can be corrected through `update_baby_log` or hidden through audited `delete_baby_log` soft deletion.

| UI action | API payload shape |
| --- | --- |
| 換片 | `log_type=diaper`, `log_subtype=pee_poo`, `value_text={"pee":"medium","poo":"none"}` |
| 完成飲奶 | `log_type=feeding`, `log_subtype=formula_milk`, `value_number=<actual ml>`, `unit=ml`, `remarks` includes `medicine_given=true|false` |
| 探熱 | `log_type=temperature`, `log_subtype=body`, `value_number=<temperature>`, `unit=celsius` |

Prepared bottle state is local to the iPad until the feed is completed. When a feed is saved, `remarks` includes `prepared_ml`, `actual_ml`, `prepared_at`, and `expires_at` so the app can calculate actual vs prepared milk without changing the workbook schema.

Tap a recent feeding, diaper, or temperature row to open the bilingual editor popup. Updates use `updated_at` optimistic concurrency. Delete requires a second confirmation, sets `status=deleted`, and preserves the original row plus before/after snapshots in `audit_log`.

The generated flat PNG icons under `public/assets/icons-flat-v2/` are individually cropped and rendered with preserved aspect ratio. They are part of the PWA cache, so increment the service worker cache name when replacing them.

## Validation

```powershell
npm run check
node --check public/app.js
```

Browser checks cover `1194x834` and `1024x768` landscape viewports, Chinese and English layouts, temperature and feeding popups, current-time following, mocked submit progress / success states, and active bottle layout. Mocked write responses must be used for UI state tests so validation does not create household records.
