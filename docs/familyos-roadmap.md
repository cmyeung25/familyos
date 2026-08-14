# Family OS Roadmap

This document is the shared planning artifact for Family OS. It is meant to help different agents understand what already exists, what is intentionally deferred, and what the next delivery phases should be.

## How To Read This

- `Fact`: observed from the current repo, committed docs, or already-validated rollout state.
- `Planned`: agreed direction, but not yet implemented.
- `Deferred`: intentionally not in the current delivery scope.

## Product Intent

Family OS is a household assistant built around:

- Telegram as the daily chat surface
- an iPad add-to-home-screen BB logging surface for fast home records
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
- A first iPad BB PWA implementation exists under `family-os-bb-ipad-webapp/`, using a thin Node proxy to the Apps Script API while keeping Google Sheets as the source of truth.
- Telegram bot persona can now be loaded per instance from `config/persona.yaml`.
- Brother instance is intentionally narrower than Gary:
  - inventory
  - reminders / tasks
  - no proactive BB log framing

### Planned

- a structured `household_memory` capability for long-lived household facts
- stronger skill governance and promotion flow
- live provider cutover and operational playbook around LLM access
- Synology HTTPS deployment and real iPad home-screen validation for the BB iPad PWA

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
- `In progress`: BB Google Calendar integration through narrow Apps Script actions with linked task rows
- `Deferred`: non-Sheets primary database

### Lane C: Conversation UX

- `Completed`: Telegram bot polling, allowlist, bridge health, callback flow
- `Completed`: per-instance persona loading
- `In progress`: BB appointment flows for vaccination, clinic follow-up, doctor visit, and checkup using the configured Google Calendar
- `Completed`: Dobby Intelligence Layer v1 context packet and deterministic fast paths for clear memory, safety-stock, batch-restock, consume, and shopping-task completion requests
- `Planned`: household memory phrasing such as "記住 X 喺 Y"
- `Planned`: semantic retrieval for memory lookups

### Lane C2: iPad BB Home Surface

- `In progress`: iPad landscape PWA for no-keyboard BB milk, diaper, and temperature logging
- `Completed`: first static PWA shell, local active-bottle timer, recent timeline, Today and rolling 26-hour summaries
- `Completed`: thin Node proxy that keeps `FAMILY_OS_API_KEY` server-side and uses existing Apps Script API actions
- `Completed`: fixed-height bilingual iPad dashboard with flat non-distorted icons, temperature / feeding-completion popups, live-following event times, and per-feed diagonal-capsule medicine metadata stored in feeding remarks
- `Completed`: Synology container is bound to NAS loopback port `8791`; the router forwards public port `8790` to the Synology HTTPS reverse proxy on `8792`, serving `https://hbsz.myds.me:8790/` with the trusted auto-renewing Synology DDNS certificate; the hostname's default HTTPS port is not assigned to the BB app
- `Pending`: physical iPad Add to Home Screen validation and one agreed end-to-end write / `audit_log` check
- `Deferred`: shared cross-device active bottle state until a schema/API extension is explicitly approved

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
- Current implementation note:
  - Dobby Intelligence Layer v1 can deterministically save and query clear item-location memory requests through the existing `append_household_memory` and `query_household_memory` API actions.
  - Broader fact / preference extraction still uses the runtime skill and is not yet a semantic retrieval system.

### Phase 7: Skill Governance Hardening

- `Planned`
- Goal:
  - make skill enhancement safer and reviewable

### Phase 8: BB Google Calendar MVP

- `In progress`
- Goal:
  - let Dobby manage BB future appointments such as vaccinations and clinic follow-ups through the configured household Google Calendar
- Initial scope:
  - create future BB calendar events
  - query upcoming BB calendar events
  - link created events back to Family OS `tasks` rows so existing reminders still work
- Current implementation note:
  - Apps Script requires `FAMILY_OS_BB_CALENDAR_ID` as a Script Property and Calendar OAuth authorization before live use.

### Phase 9: iPad BB PWA MVP

- `In progress`
- Goal:
  - provide a fixed home iPad surface for fast BB daily logging without keyboard input
- Current implementation note:
  - `family-os-bb-ipad-webapp/` serves a static PWA and proxies the Apps Script API actions `health`, `get_recent_baby_logs`, `append_baby_log`, `update_baby_log`, and `delete_baby_log`
  - recent feeding, diaper, and temperature records support optimistic-concurrency updates and audited soft deletion from a fixed-height popup
  - the workbook schema is unchanged; active bottle preparation state remains local until the feed is completed

## Immediate Next Milestones

The active implementation milestones are:

- `Household Memory MVP`, now building on `Dobby Intelligence Layer v1`
- `BB Google Calendar MVP`, starting with future BB appointments and linked reminders
- `BB iPad PWA`, documented in `docs/ipad-bb-webapp.md`, now ready for local smoke testing and Synology HTTPS deployment planning

### Household Memory MVP Goal

Allow Telegram flows like:

- `幫我記住成長椅嘅工具放咗喺工具箱`
- `成長椅工具放咗去邊？`
- `備用門匙而家搬咗去鞋櫃第二格`

### Household Memory MVP Scope

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
