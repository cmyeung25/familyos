# Family OS Roadmap

This document is the shared planning artifact for Family OS. It is meant to help different agents understand what already exists, what is intentionally deferred, and what the next delivery phases should be.

## How To Read This

- `Fact`: observed from the current repo, committed docs, or already-validated rollout state.
- `Planned`: agreed direction, but not yet implemented.
- `Deferred`: intentionally not in the current delivery scope.

## Product Intent

Family OS is a household assistant built around:

- Telegram as the daily chat surface
- an LLM bridge for reasoning
- Google Apps Script + Google Sheets as the current operational database
- multi-instance deployment on Synology NAS

The system is currently aimed at:

- BB daily logs
- household inventory
- reminders and small family tasks
- household documents and planning metadata
- future household memory such as item locations, family preferences, and reusable facts

## Current Baseline

### Facts

- Git is in use and the repo is hosted at `https://github.com/cmyeung25/familyos.git`.
- The runtime is Node-based and Linux-compatible through Docker.
- Synology deployment is active.
- There are already two tenant-style instances:
  - `gary`
  - `brother`
- Multi-instance Docker deployment exists through:
  - `docker-compose.gary.yml`
  - `docker-compose.brother.yml`
- Monitoring exists through:
  - `docker/healthcheck.mjs`
  - `docker/health_server.mjs`
  - `docker-compose.monitoring.example.yml`
- Google Sheets remains the live source of truth.
- Apps Script is the current audited API layer.
- Telegram bot persona can now be loaded per instance from `config/persona.yaml`.
- Brother instance is intentionally narrower than Gary:
  - inventory
  - reminders / tasks
  - no proactive BB log framing

### Planned

- a structured `household_memory` capability for long-lived household facts
- stronger skill governance and promotion flow
- live provider cutover and operational playbook around LLM access

### Deferred

- PostgreSQL / Supabase migration
- autonomous shopping / order placement
- unrestricted AI self-modification of core code
- public multi-user SaaS style tenancy

## Architecture Sketch

```text
Telegram Bot (Gary) ----\
                         \--> Family OS bot container ----\
Telegram Bot (Brother) --/                                 \
                                                          LLM bridge
Instance config + persona + runtime knowledge ------------/
                                                          \
                                                           --> Apps Script API --> Google Sheets

Shared codebase
Shared Docker image pattern
Shared core runtime
Per-instance secrets, persona, logs, state, auth cache, runtime knowledge
```

## Delivery Lanes

### Lane A: Runtime And Deployment

- `Completed`: instance-aware paths
- `Completed`: Dockerized single bot runtime
- `Completed`: Synology single-instance rollout
- `Completed`: second-family instance rollout
- `Completed`: NAS health monitoring
- `Planned`: cleaner update / rollback playbook for monitoring compose and per-service operations
- `Completed`: provider abstraction groundwork for Codex vs DeepSeek selection

### Lane B: Data And API

- `Completed`: Apps Script API for BB, inventory, tasks, documents, reminders, and allowlist reads
- `Completed`: audited write pattern with `audit_log`
- `Planned`: `household_memory` sheet and API actions
- `Planned`: additive schema governance for future memory extensions
- `Deferred`: non-Sheets primary database

### Lane C: Conversation UX

- `Completed`: Telegram bot polling, allowlist, bridge health, callback flow
- `Completed`: per-instance persona loading
- `Planned`: household memory phrasing such as "記住 X 喺 Y"
- `Planned`: semantic retrieval for memory lookups

### Lane D: Knowledge And Skills

- `Completed`: staged runtime skills and per-instance runtime knowledge roots
- `Completed`: Brother private runtime knowledge that suppresses BB framing
- `Planned`: clearer split between core, common, and private skills
- `Planned`: pending / approved skill promotion flow

### Lane E: Governance And Safety

- `Completed`: secrets excluded from Git
- `Completed`: private instance config pattern
- `Completed`: thin-bridge direction documented in `AGENTS.md`
- `Planned`: shared engineering operating principles for all agents
- `Deferred`: any AI path that can directly rewrite core production code without review

## Phase Status

### Phase 0: Repo And Runtime Baseline

- `Completed`
- Outcome:
  - repo structure inspected
  - startup and dependency model understood
  - Codex-login-based runtime constraints identified

### Phase 1: Instance Separation

- `Completed`
- Outcome:
  - per-instance config, logs, state, runtime knowledge, and auth cache paths

### Phase 2: Single-Bot Dockerization

- `Completed`
- Outcome:
  - Linux-compatible runtime entrypoint
  - Dockerfile and compose scaffold

### Phase 3: Synology Single Bot

- `Completed`
- Outcome:
  - Gary instance deployed on NAS

### Phase 4: Second Family Instance

- `Completed`
- Outcome:
  - Brother instance scaffolded and rolled out
  - narrower scope preserved for Brother

### Phase 5: Monitoring

- `Completed`
- Outcome:
  - monitor container
  - HTTP health endpoints for Uptime Kuma

### Phase 6: Household Memory MVP

- `In progress`
- Goal:
  - support long-lived household memory that is not a reminder and not an inventory item
- Initial scope:
  - item locations
  - simple household facts
  - explicit user-recorded preferences only if schema is ready

### Phase 7: Skill Governance Hardening

- `Planned`
- Goal:
  - make skill enhancement safer and reviewable

## Immediate Next Milestone

The next implementation milestone is `Household Memory MVP`.

### MVP Goal

Allow Telegram flows like:

- `幫我記住成長椅嘅工具放咗喺工具箱`
- `成長椅工具放咗去邊？`
- `備用門匙而家搬咗去鞋櫃第二格`

### MVP Scope

- new Google Sheet: `household_memory`
- new API actions:
  - `append_household_memory`
  - `query_household_memory`
- Telegram routing for:
  - save memory
  - query memory
- no delete workflow in v1
- no embeddings in v1
- no fully general preference engine in v1

### Proposed V1 Record Model

- `memory_id`
- `household_id`
- `memory_type`
- `subject`
- `value_text`
- `location`
- `category`
- `status`
- `owner_person_id`
- `related_person_id`
- `tags`
- `aliases`
- `last_verified_at`
- `confidence`
- `remarks`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

### Planned Extension Path

The MVP should be designed so later phases can add:

- `preference`
- `fact`
- `last_verified_at`
- `confidence`
- alias / tag-based semantic matching

## Decision Rules For Future Agents

- Keep Family OS changes additive unless there is a strong reason to break compatibility.
- Do not widen brother runtime back into BB-first behavior unless explicitly requested.
- Prefer shared code plus per-instance config over forked codebases.
- Treat Google Sheets as the live source of truth until a migration phase is explicitly approved.
- Any schema change should come with:
  - the target use case
  - affected sheets / API actions
  - rollback thought
  - audit-log impact
- Update this roadmap when a phase meaningfully changes status.
