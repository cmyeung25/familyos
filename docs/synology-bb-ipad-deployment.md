# Synology BB iPad PWA Deployment

## Production Shape

```text
iPad Safari / Home Screen
  -> https://hbsz.myds.me:8790
  -> router TCP 8790 to NAS TCP 8792
  -> trusted HTTPS hostname on Synology Reverse Proxy port 8792
  -> http://127.0.0.1:8791
  -> familyos-bb-ipad container
  -> Apps Script API
  -> Google Sheets
```

The browser never receives `FAMILY_OS_API_KEY`. The container exposes only the BB PWA and five allowlisted Apps Script actions: health, recent-log reads, append, audited update, and audited soft-delete.

## NAS Paths And Files

- repo: `/volume1/docker/familyos/repo`
- compose: `docker-compose.bb-ipad.yml`
- dedicated secret env: `instances/gary/secrets/bb-ipad.env`
- Internal loopback port: `8791`

The dedicated env file contains only:

```text
FAMILY_OS_API_URL=...
FAMILY_OS_API_KEY=...
```

Do not reuse the complete Gary `.env` inside the web container because it also contains unrelated Telegram and LLM credentials.

## Deploy Or Update

After the NAS repo has pulled the target Git revision:

```sh
cd /volume1/docker/familyos/repo
sh scripts/synology/deploy-bb-ipad.sh
```

On first run, the script creates `bb-ipad.env` from the two configured API values in `instances/gary/.env`, with a restrictive umask. It then builds the image, starts the service, and runs two read-only checks:

- `GET /healthz` for container liveness
- `GET /api/health` for Apps Script connectivity

NAS-local smoke-test URL:

```text
http://127.0.0.1:8791/
```

Current trusted production URL:

```text
https://hbsz.myds.me:8790/
```

The production endpoint was verified on 2026-08-14: the PWA, manifest, service worker, container health check, and read-only Apps Script health action all responded successfully. The API reported household `hh_home` and schema `family_os_poc_v1`.

## Synology Reverse Proxy

In DSM, open `Control Panel -> Login Portal -> Advanced -> Reverse Proxy` and create a rule:

| Field | Value |
| --- | --- |
| Source protocol | `HTTPS` |
| Source hostname | `hbsz.myds.me` |
| Source port | `8792` |
| Destination protocol | `HTTP` |
| Destination hostname | `127.0.0.1` |
| Destination port | `8791` |

The current certificate is the auto-renewing Synology DDNS certificate for `hbsz.myds.me`. HSTS is enabled on the reverse-proxy rule. The default HTTPS endpoint `https://hbsz.myds.me/` is intentionally not assigned to this app.

In `Control Panel -> External Access -> Router Configuration`, keep the custom TCP forwarding rule:

| Router field | Value |
| --- | --- |
| Local port | `8792` |
| Router port | `8790` |
| Protocol | `TCP` |

This extra hop is intentional: DSM reserves `8790` in its application port registry, so the reverse proxy listens on `8792` while users continue to open public port `8790`.

The router forwarding rule supports the DDNS hostname from the home network through NAT loopback. Keep using the trusted hostname rather than a raw IP URL so service-worker caching and Home Screen PWA behavior remain on a valid HTTPS origin. Do not accept a permanent certificate warning on the iPad.

## iPad Setup

1. Connect the iPad to the same home Wi-Fi.
2. Open the trusted HTTPS URL in Safari.
3. Confirm the dashboard loads and the latest BB records appear.
4. Use Safari Share -> Add to Home Screen.
5. Launch `小桃B` from the Home Screen and confirm it opens without Safari chrome.
6. Make one agreed test record, then confirm the row and `audit_log` entry in Family OS.

## Validation And Rollback

Check status and logs:

```sh
cd /volume1/docker/familyos/repo
/usr/local/bin/docker compose -f docker-compose.bb-ipad.yml ps
/usr/local/bin/docker compose -f docker-compose.bb-ipad.yml logs --tail=100 familyos-bb-ipad
```

Stop only the BB PWA without affecting Telegram or reminders:

```sh
/usr/local/bin/docker compose -f docker-compose.bb-ipad.yml down
```

Rollback by checking out the previous Git revision and rerunning `scripts/synology/deploy-bb-ipad.sh`.
