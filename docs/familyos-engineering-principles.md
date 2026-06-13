# Family OS Engineering Principles

This document is the shared operating model for Family OS development. It is written for humans and agents working in the repo.

## Intent

The goal is to keep Family OS shippable while multiple agents contribute over time. The system handles real household data, so speed matters, but silent drift and accidental breakage matter more.

## Working Interpretation

This repo should follow a harness-style engineering approach:

- define the target behavior before broad implementation
- make small, reversible changes
- keep runtime behavior observable
- prove the change with narrow validation
- preserve shared context so the next agent does not re-discover the same constraints

## Shared Rules

### 1. Roadmap First For Non-Trivial Changes

Before major feature or architecture work:

- read `AGENTS.md`
- read `README.md`
- read [familyos-roadmap.md](/C:/Users/user/OneDrive/文件/屋企清單/docs/familyos-roadmap.md)

If the work changes scope, architecture, or phase status, update the roadmap as part of the same change.

### 2. Mark Facts vs Proposals

When documenting or discussing Family OS:

- clearly separate observed facts from planned design
- do not present assumptions as if they are already implemented
- prefer exact file references when stating current behavior

### 3. Keep The Bridge Thin

The Telegram bridge should stay focused on:

- transport
- allowlisting
- thread / callback plumbing
- minimal runtime brokerage
- safety boundaries

Do not move household business logic into the bridge when the API, skill, or prompt layer can own it more cleanly.

### 4. Shared Core, Isolated Tenants

Use one shared codebase and isolate tenants through instance config.

Per-instance isolation should cover:

- `.env`
- persona
- runtime knowledge
- logs
- state
- auth cache
- secrets

Do not solve tenant separation by copying the whole repo per family.

### 5. Additive Data Changes

Family OS uses Google Sheets as the live database today. Schema changes should be additive by default.

Before changing schema:

- define the user-facing use case
- define the target sheet and columns
- define the API contract impact
- define whether existing data needs migration
- define how audit logging is preserved

### 6. No Secret Leakage

Never commit:

- `.env`
- real API keys
- Telegram bot tokens
- Codex auth state
- private family persona files
- personal household data
- logs with personal content

### 7. Observability Is Part Of The Feature

Each operational feature should have at least one observable signal.

Examples:

- heartbeat state
- health endpoint
- activity log
- startup validation
- self-test

If a runtime path becomes harder to observe after a change, that change is incomplete.

### 8. Human-Reviewed Core

Core runtime, deployment, schema, and safety logic must remain human-reviewable.

AI-generated or self-enhanced output may propose:

- pending skills
- private household rules
- text assets

It should not directly mutate:

- core production runtime
- Docker entrypoints
- shared API contract
- schema-critical code

without explicit review.

### 9. Prefer Narrow Validation

Every change should be validated as close as possible to the affected surface.

Examples:

- `node --check` for syntax-only changes
- self-tests for runtime modules
- one endpoint probe for monitor changes
- one controlled Telegram round-trip for bot behavior

Do not rely only on "it probably works".

### 10. Keep Brother Scope Narrow Until Expanded Intentionally

Brother instance currently has a narrower product scope than Gary.

Until explicitly changed:

- inventory and reminders are in scope
- BB log framing should stay suppressed
- persona and runtime knowledge should reflect that narrower scope

### 11. Design For Forward Compatibility

When adding new family features, prefer a model that can grow without migration pain.

For example, `household_memory` should be able to extend later into:

- `item_location`
- `fact`
- `preference`
- verification metadata
- simple semantic retrieval

without needing a brand-new subsystem for each one.

## Delivery Checklist For Future Agents

For any non-trivial change, the agent should leave behind:

- updated code or docs
- validation evidence
- changed-scope notes if relevant
- roadmap update if phase status changed

## Current Near-Term Priority

The next approved feature direction is:

- `Household Memory MVP`

That work should be done after the shared planning artifacts are in place, not before.
