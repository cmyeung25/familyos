#!/bin/sh
set -eu

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
REPO_ROOT="${REPO_ROOT:-/volume1/docker/familyos/repo}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.bb-ipad.yml}"
DB_ENV="${DB_ENV:-../instances/gary/secrets/bb-mariadb.env}"
API_ENV="${API_ENV:-../instances/gary/secrets/bb-data-api.env}"

run_docker() {
  if [ "$(id -u)" -eq 0 ]; then "$DOCKER_BIN" "$@"; else sudo "$DOCKER_BIN" "$@"; fi
}

cd "$REPO_ROOT"
for file in "$DB_ENV" "$API_ENV"; do
  if [ ! -s "$file" ]; then echo "Missing $file." >&2; exit 1; fi
done
for key in FAMILY_OS_BB_DB_HOST FAMILY_OS_BB_DB_NAME FAMILY_OS_BB_DB_USER FAMILY_OS_BB_DB_PASSWORD; do
  if ! grep -Eq "^${key}=.+" "$DB_ENV"; then echo "$DB_ENV does not contain a configured $key." >&2; exit 1; fi
done
for key in FAMILY_OS_BB_DATA_API_KEY FAMILY_OS_BB_HOUSEHOLD_ID FAMILY_OS_BB_DEFAULT_BABY_PERSON_ID; do
  if ! grep -Eq "^${key}=.+" "$API_ENV"; then echo "$API_ENV does not contain a configured $key." >&2; exit 1; fi
done

echo "Building and starting the NAS-internal BB Data API."
run_docker compose -f "$COMPOSE_FILE" build familyos-bb-data-api
run_docker compose -f "$COMPOSE_FILE" up -d familyos-bb-data-api
run_docker compose -f "$COMPOSE_FILE" ps familyos-bb-data-api

echo "Checking Data API liveness and authenticated MariaDB health."
run_docker compose -f "$COMPOSE_FILE" exec -T familyos-bb-data-api \
  node -e "fetch('http://127.0.0.1:8788/healthz').then(r=>r.json()).then(x=>{if(!x.ok)process.exit(1);console.log(JSON.stringify(x))})"
run_docker compose -f "$COMPOSE_FILE" exec -T familyos-bb-data-api \
  node -e "fetch('http://127.0.0.1:8788/v1/actions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({api_key:process.env.FAMILY_OS_BB_DATA_API_KEY,action:'health',payload:{}})}).then(r=>r.json()).then(x=>{if(!x.ok)process.exit(1);console.log(JSON.stringify({ok:x.ok,data_path:x.result&&x.result.data_path,household_id:x.result&&x.result.household_id}))})"
