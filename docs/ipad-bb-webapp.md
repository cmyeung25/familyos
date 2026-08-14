# iPad BB Web App

## Status

`In progress`: first static PWA implementation is present under `family-os-bb-ipad-webapp/`.

## Product Goal

Provide a home iPad surface for BB daily logging:

- diaper records with Pee / Poo amount
- formula preparation timer with 60-minute freshness countdown
- actual milk intake on completion
- body temperature records
- recent timeline
- Today and rolling 26-hour summary

The design target is iPad Air 11-inch landscape with no keyboard-based daily logging and no page scrolling on the home dashboard.

The current interaction design includes:

- a light-pink baby-care theme with distinct blush, blue-gray, and mint dashboard columns
- a single-baby header for `小桃B`, showing `6 週 3 天（45 日）` without a profile dropdown
- a top-right `EN / 中` control that switches the full interface between Traditional Chinese and English
- generated flat-design bitmap icons for BB events, utility navigation, and all eight diaper amount states
- individual square / original-proportion icon files rendered with `background-size: contain` to avoid iPad Safari sprite distortion
- icon-only urine / stool amount controls with text retained only for accessibility labels
- a diagonal flat capsule icon for medicine, used in bottle preparation, the active timer, and feeding confirmation
- urine defaults to medium and stool defaults to none; these defaults are restored after a successful diaper record
- diaper and bottle timestamps follow the current time continuously until manually adjusted; `Use current time` restores following, and successful records reset to current time
- a temperature popup so temperature controls do not consume home-dashboard height
- a feeding-completion popup for actual milk amount and medicine confirmation, avoiding an over-height inline form
- double-tap zoom prevention on touch controls while keeping normal pinch-to-zoom accessibility available
- blocking submit-in-progress cards and explicit success confirmation cards for audited writes
- compact success toast feedback for local actions such as starting the bottle timer

## Architecture

The app intentionally does not introduce a new database.

```text
iPad add-to-home-screen app
  -> local HTTPS Node web server
  -> Family OS Apps Script API
  -> Google Sheets baby_log sheet
```

The Node server is a thin static-file host plus API proxy. It reads `FAMILY_OS_API_URL` and `FAMILY_OS_API_KEY` from environment variables and keeps the API key out of the browser.

## Current Data Contract

The PWA uses the existing Apps Script actions:

- `health`
- `get_recent_baby_logs`
- `append_baby_log`
- `update_baby_log`
- `delete_baby_log`

It does not add schema columns.

### Diaper

The app writes one `baby_log` row:

- `log_type = diaper`
- `log_subtype = pee_poo`
- `description = BB 換片: 尿尿 <amount>; 便便 <amount>`
- `value_text = {"pee":"none|small|medium|large","poo":"none|small|medium|large"}`

### Feeding

The app stores bottle preparation as local active state until completion. Completion writes one `baby_log` row:

- `log_type = feeding`
- `log_subtype = formula_milk`
- `event_at = prepared_at`
- `started_at = prepared_at`
- `ended_at = finished_at`
- `value_number = actual_ml`
- `unit = ml`
- `remarks` contains `prepared_ml`, `actual_ml`, `prepared_at`, and `expires_at`
- `remarks` contains `medicine_given=true|false` when recording whether medicine was given during the feed

This preserves existing milk summaries as actual intake while still retaining the prepared amount.

### Temperature

The app writes one `baby_log` row:

- `log_type = temperature`
- `log_subtype = body`
- `value_number = body temperature`
- `unit = celsius`

## Known Constraints

- Active bottle state is local to one iPad. It is not shared across Telegram or another browser until the feed is completed.
- The medicine capsule selection is stored in that same local active-bottle state and becomes part of the audited feeding row only when the feed is completed.
- Offline writes are not queued in v1 to avoid duplicate medical or feeding records.
- iOS PWA service worker behavior requires a trusted HTTPS deployment.
- The fixed dashboard has been browser-validated at `1194x834` and `1024x768`; final safe-area behavior still needs confirmation on the physical iPad after HTTPS deployment.
