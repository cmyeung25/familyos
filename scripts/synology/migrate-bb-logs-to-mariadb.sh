#!/bin/sh
set -eu

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
REPO_ROOT="${REPO_ROOT:-/volume1/docker/familyos/repo}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.bb-ipad.yml}"
SOURCE_ENV="${SOURCE_ENV:-instances/gary/secrets/bb-ipad.env}"

run_docker() {
  if [ "$(id -u)" -eq 0 ]; then "$DOCKER_BIN" "$@"; else sudo "$DOCKER_BIN" "$@"; fi
}

cd "$REPO_ROOT"
if [ ! -s "$SOURCE_ENV" ]; then echo "Missing $SOURCE_ENV." >&2; exit 1; fi
for key in FAMILY_OS_API_URL FAMILY_OS_API_KEY; do
  if ! grep -Eq "^${key}=.+" "$SOURCE_ENV"; then echo "$SOURCE_ENV does not contain a configured $key." >&2; exit 1; fi
done

FAMILY_OS_API_URL="$(sed -n 's/^FAMILY_OS_API_URL=//p' "$SOURCE_ENV" | head -n 1)"
FAMILY_OS_API_KEY="$(sed -n 's/^FAMILY_OS_API_KEY=//p' "$SOURCE_ENV" | head -n 1)"
export FAMILY_OS_API_URL FAMILY_OS_API_KEY
echo "Running idempotent Google Sheets BB migration. Google Sheets remains read-only."
run_docker compose -f "$COMPOSE_FILE" run --rm \
  -e FAMILY_OS_API_URL \
  -e FAMILY_OS_API_KEY \
  familyos-bb-data-api node migrate.mjs
