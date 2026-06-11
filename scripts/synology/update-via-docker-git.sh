#!/bin/sh
set -eu

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
GIT_IMAGE="${GIT_IMAGE:-alpine/git:2.47.2}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
REPO_ROOT="${REPO_ROOT:-$(pwd)}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.gary.yml}"

run_docker() {
  if [ "$(id -u)" -eq 0 ]; then
    "$DOCKER_BIN" "$@"
  else
    sudo "$DOCKER_BIN" "$@"
  fi
}

echo "Updating repo in $REPO_ROOT from origin/$TARGET_BRANCH"

run_docker run --rm \
  --entrypoint /bin/sh \
  -e TARGET_BRANCH="$TARGET_BRANCH" \
  -v "$REPO_ROOT:/repo" \
  -w /repo \
  "$GIT_IMAGE" \
  -lc '
    set -eu
    git config --global --add safe.directory /repo
    test -d .git
    git fetch origin "$TARGET_BRANCH" --tags
    git checkout "$TARGET_BRANCH"
    git pull --ff-only origin "$TARGET_BRANCH"
    git status --short
  '

echo "Rebuilding and restarting Family OS with $COMPOSE_FILE"
run_docker compose -f "$COMPOSE_FILE" build
run_docker compose -f "$COMPOSE_FILE" up -d
run_docker compose -f "$COMPOSE_FILE" ps

echo "Update complete."
