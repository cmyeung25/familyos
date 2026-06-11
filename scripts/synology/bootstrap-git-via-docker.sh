#!/bin/sh
set -eu

DOCKER_BIN="${DOCKER_BIN:-/usr/local/bin/docker}"
GIT_IMAGE="${GIT_IMAGE:-alpine/git:2.47.2}"
ORIGIN_URL="${ORIGIN_URL:-https://github.com/cmyeung25/familyos.git}"
TARGET_BRANCH="${TARGET_BRANCH:-main}"
REPO_ROOT="${REPO_ROOT:-$(pwd)}"

run_docker() {
  if [ "$(id -u)" -eq 0 ]; then
    "$DOCKER_BIN" "$@"
  else
    sudo "$DOCKER_BIN" "$@"
  fi
}

echo "Bootstrapping git metadata in $REPO_ROOT from $ORIGIN_URL ($TARGET_BRANCH)"

run_docker run --rm \
  -e ORIGIN_URL="$ORIGIN_URL" \
  -e TARGET_BRANCH="$TARGET_BRANCH" \
  -v "$REPO_ROOT:/repo" \
  -w /repo \
  "$GIT_IMAGE" \
  sh -lc '
    if [ ! -d .git ]; then
      git init
    fi

    if git remote get-url origin >/dev/null 2>&1; then
      git remote set-url origin "$ORIGIN_URL"
    else
      git remote add origin "$ORIGIN_URL"
    fi

    git fetch origin "$TARGET_BRANCH" --tags
    git branch -M "$TARGET_BRANCH"
    git reset --hard "origin/$TARGET_BRANCH"
    git status --short
  '

echo "Git bootstrap complete."
