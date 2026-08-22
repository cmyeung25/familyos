#!/bin/sh
set -eu

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
REPO_ROOT="${REPO_ROOT:-/volume1/docker/familyos/repo}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.bb-ipad.yml}"
SOURCE_ENV="${SOURCE_ENV:-instances/gary/.env}"
WEBAPP_ENV="${WEBAPP_ENV:-instances/gary/secrets/bb-ipad.env}"
CLIENT_ENV="${CLIENT_ENV:-../instances/gary/secrets/bb-data-api-client.env}"

run_docker() {
  if [ "$(id -u)" -eq 0 ]; then
    "$DOCKER_BIN" "$@"
  else
    sudo "$DOCKER_BIN" "$@"
  fi
}

cd "$REPO_ROOT"

if [ ! -s "$WEBAPP_ENV" ]; then
  if [ ! -f "$SOURCE_ENV" ]; then
    echo "Missing $SOURCE_ENV; create $WEBAPP_ENV from .env.nas.example." >&2
    exit 1
  fi

  echo "Creating restricted $WEBAPP_ENV from the existing Gary instance environment."
  umask 077
  mkdir -p "$(dirname "$WEBAPP_ENV")"
  temp_env="${WEBAPP_ENV}.tmp"
  grep -E '^(FAMILY_OS_API_URL|FAMILY_OS_API_KEY)=' "$SOURCE_ENV" > "$temp_env"
  mv "$temp_env" "$WEBAPP_ENV"
fi

for key in FAMILY_OS_API_URL FAMILY_OS_API_KEY; do
  if ! grep -Eq "^${key}=.+" "$WEBAPP_ENV"; then
    echo "$WEBAPP_ENV does not contain a configured $key." >&2
    exit 1
  fi
done

if [ ! -s "$CLIENT_ENV" ]; then
  echo "Creating default Apps Script backend selector at $CLIENT_ENV."
  umask 077
  mkdir -p "$(dirname "$CLIENT_ENV")"
  printf '%s\n' 'FAMILY_OS_BB_DATA_BACKEND=apps_script' > "$CLIENT_ENV"
fi

backend="$(sed -n 's/^FAMILY_OS_BB_DATA_BACKEND=//p' "$CLIENT_ENV" | head -n 1)"
if [ "$backend" != "apps_script" ] && [ "$backend" != "mariadb" ]; then
  echo "$CLIENT_ENV must select FAMILY_OS_BB_DATA_BACKEND=apps_script or mariadb." >&2
  exit 1
fi
if [ "$backend" = "mariadb" ]; then
  for key in FAMILY_OS_BB_DATA_API_URL FAMILY_OS_BB_DATA_API_KEY; do
    if ! grep -Eq "^${key}=.+" "$CLIENT_ENV"; then
      echo "$CLIENT_ENV does not contain a configured $key for MariaDB mode." >&2
      exit 1
    fi
  done
fi

echo "Building and starting the Family OS BB iPad service ($backend backend)."
run_docker compose -f "$COMPOSE_FILE" build familyos-bb-ipad
run_docker compose -f "$COMPOSE_FILE" up -d familyos-bb-ipad
run_docker compose -f "$COMPOSE_FILE" ps familyos-bb-ipad

echo "Checking container liveness and the selected read-only data health endpoint."
run_docker compose -f "$COMPOSE_FILE" exec -T familyos-bb-ipad \
  node -e "fetch('http://127.0.0.1:8790/healthz').then(r=>r.json()).then(x=>{if(!x.ok)process.exit(1);console.log(JSON.stringify(x))})"
run_docker compose -f "$COMPOSE_FILE" exec -T familyos-bb-ipad \
  node -e "fetch('http://127.0.0.1:8790/api/health').then(r=>r.json()).then(x=>{if(!x.ok)process.exit(1);console.log(JSON.stringify({ok:x.ok,household_id:x.result&&x.result.household_id,schema_version:x.result&&x.result.schema_version,data_path:x.result&&x.result.data_path}))})"

echo "BB iPad service is available internally at http://127.0.0.1:8791/."
