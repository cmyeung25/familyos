# Synology Docker Git Update Flow

This flow avoids installing `git` directly on the Synology host.

It uses a short-lived Docker container to manage the repo working tree, then uses the normal Family OS Compose file to rebuild and restart the services.

## Current NAS paths

- repo root: `/volume1/docker/familyos/repo`
- active instance: `/volume1/docker/familyos/repo/instances/gary`
- Docker binary: `/usr/local/bin/docker`

## One-time bootstrap

Run this from the repo root on NAS:

```bash
cd /volume1/docker/familyos/repo
sh scripts/synology/bootstrap-git-via-docker.sh
```

What it does:

- initializes `.git` if missing
- sets `origin` to `https://github.com/cmyeung25/familyos.git`
- fetches `main`
- resets git metadata to match `origin/main`
- keeps ignored private files such as `.env`, secrets, logs, and `.codex-home`

## Normal update flow

Run this from the repo root on NAS:

```bash
cd /volume1/docker/familyos/repo
sh scripts/synology/update-via-docker-git.sh
```

What it does:

- uses `alpine/git` to `fetch` and `pull --ff-only`
- rebuilds `familyos:gary`
- runs `docker compose -f docker-compose.gary.yml up -d`
- prints final compose status

## Why this is better than archive rollout

- the NAS repo gets real `.git` history
- updates become repeatable
- no DSM host git package is required
- private instance files stay on NAS and do not get committed

## Current limitation

This is still using the `instances/gary` folder inside the repo tree. That is acceptable for now because the live private files are ignored by git.

Longer term, the cleaner production layout is:

```text
/volume1/docker/familyos/repo
/volume1/docker/familyos/instances/gary
```

with Compose mounting the instance path from outside the repo.
