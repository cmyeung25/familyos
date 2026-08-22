#!/bin/sh
set -eu

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
REPO_ROOT="${REPO_ROOT:-/volume1/docker/familyos/repo}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.bb-ipad.yml}"
API_ENV="${API_ENV:-instances/gary/secrets/bb-data-api.env}"
CLIENT_ENV="${CLIENT_ENV:-instances/gary/secrets/bb-data-api-client.env}"
TARGET="${1:-}"

run_docker() {
  if [ "$(id -u)" -eq 0 ]; then "$DOCKER_BIN" "$@"; else sudo "$DOCKER_BIN" "$@"; fi
}

if [ "$TARGET" != "apps_script" ] && [ "$TARGET" != "mariadb" ]; then
  echo "Usage: $0 apps_script|mariadb" >&2
  exit 64
fi

cd "$REPO_ROOT"
umask 077
mkdir -p "$(dirname "$CLIENT_ENV")"
temp_env="${CLIENT_ENV}.tmp"
if [ "$TARGET" = "apps_script" ]; then
  printf '%s\n' 'FAMILY_OS_BB_DATA_BACKEND=apps_script' > "$temp_env"
else
  if [ ! -s "$API_ENV" ]; then echo "Missing $API_ENV." >&2; exit 1; fi
  api_key="$(sed -n 's/^FAMILY_OS_BB_DATA_API_KEY=//p' "$API_ENV" | head -n 1)"
  if [ -z "$api_key" ]; then echo "$API_ENV does not contain FAMILY_OS_BB_DATA_API_KEY." >&2; exit 1; fi
  printf '%s\n' \
    'FAMILY_OS_BB_DATA_BACKEND=mariadb' \
    'FAMILY_OS_BB_DATA_API_URL=http://familyos-bb-data-api:8788' \
    "FAMILY_OS_BB_DATA_API_KEY=$api_key" > "$temp_env"
fi
mv "$temp_env" "$CLIENT_ENV"

echo "Switching iPad PWA backend to $TARGET."
run_docker compose -f "$COMPOSE_FILE" up -d familyos-bb-ipad
run_docker compose -f "$COMPOSE_FILE" exec -T familyos-bb-ipad \
  node -e "fetch('http://127.0.0.1:8790/api/health').then(r=>r.json()).then(x=>{if(!x.ok)process.exit(1);console.log(JSON.stringify({ok:x.ok,data_path:x.result&&x.result.data_path}))})"
