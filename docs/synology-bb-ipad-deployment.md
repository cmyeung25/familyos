# Synology BB iPad PWA Deployment

## Production Shape

```text
iPad Safari / Home Screen
  -> trusted HTTPS hostname on Synology Reverse Proxy
  -> http://127.0.0.1:8790
  -> familyos-bb-ipad container
  -> Apps Script API
  -> Google Sheets
```

The browser never receives `FAMILY_OS_API_KEY`. The container exposes only the BB PWA and the three allowlisted Apps Script actions already used by the app.

## NAS Paths And Files

- repo: `/volume1/docker/familyos/repo`
- compose: `docker-compose.bb-ipad.yml`
- dedicated secret env: `instances/gary/secrets/bb-ipad.env`
- LAN port: `8790`

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

Direct LAN smoke-test URL:

```text
http://192.168.1.19:8790/
```

## Synology Reverse Proxy

In DSM, open `Control Panel -> Login Portal -> Advanced -> Reverse Proxy` and create a rule:

| Field | Value |
| --- | --- |
| Source protocol | `HTTPS` |
| Source hostname | a hostname covered by a trusted certificate |
| Source port | `443` or another dedicated HTTPS port |
| Destination protocol | `HTTP` |
| Destination hostname | `127.0.0.1` |
| Destination port | `8790` |

Assign the matching certificate to this reverse-proxy hostname in `Control Panel -> Security -> Certificate -> Settings`.

For home-only use, the hostname should resolve to `192.168.1.19` on the home network. A raw IP URL is useful for the first smoke test, but a trusted HTTPS hostname is required for reliable service-worker caching and Home Screen PWA behavior. Do not accept a permanent certificate warning on the iPad.

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
