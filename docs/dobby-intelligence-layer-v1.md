# Dobby Intelligence Layer v1

This document defines the first narrow intelligence layer for the Family OS Telegram runtime.

## Goal

Make Dobby more reliable without turning the Telegram bridge into a large business-logic engine.

The v1 layer focuses on:

- clearer context sent to the LLM
- deterministic handling for high-confidence household operations
- safer clarification and recovery behavior
- test coverage for common failure-prone paths

## Implemented Scope

### Context Packet

The bridge now adds a private `Dobby Intelligence Layer v1 context packet` to each model prompt.

The packet summarizes:

- likely household domain
- likely turn type
- operation risk
- deterministic candidate, if any
- sender person identity, if known
- recent successful state anchor

This packet is model guidance only. It must not be revealed to the Telegram user.

### Deterministic Fast Paths

The bridge can now handle these clear requests before calling the LLM:

- household memory save, such as `幫我記住成長椅嘅工具放咗喺工具箱`
- household memory location query, such as `成長椅嘅工具喺邊`
- future BB appointment calendar writes, such as `BB 2026-09-25 11:15 屯門醫院覆診`
- inventory safety-stock updates, such as `幫我設定返白胡椒粉嘅安全存量係一樽`
- explicit inventory consume fallback, including clear multi-item consume such as `食咗一個公仔麵，同一隻雞蛋`
- ambiguous multi-item consume clarification, such as `食咗一個公仔麵，同一隻蛋`, where choosing `雞蛋` resumes the whole batch consume without relying on another LLM turn
- explicit single-item restock fallback, such as `買左一包糖`, `糖買左一包`, and `啱啱買返一支牛奶啦`
- explicit batch restock fallback
- explicit shopping task completion fallback

Ambiguous cases still fall back to the LLM and existing clarification flow.

## Non-Goals

v1 does not implement:

- semantic embeddings
- autonomous shopping
- broad schema changes
- direct AI modification of core runtime code
- a separate long-term planner service

## Safety Rules

- Deterministic writes require a clear intent and a clear target.
- Ambiguous inventory writes ask first.
- Batch inventory writes must not partial-write a subset when one item is ambiguous.
- Safety-stock-only requests must update an existing inventory item; they must not create a new item.
- Household memory v1 appends records; it does not overwrite older records.

## Validation

The bridge self-test covers:

- Dobby Intelligence prompt packet presence
- BB Calendar deterministic appointment path
- household memory save path
- household memory query path
- safety-stock deterministic update path
- existing clarification, task, inventory, and command-safety paths

The dedicated no-live-write regression harness is:

```powershell
Set-Location .\family-os-telegram-bot
npm run self-test:dobby
```

This harness stubs all bridge commands, so it does not call Apps Script and does not write to Google Sheets.

The full local runtime validation remains:

```powershell
Set-Location .\family-os-telegram-bot
npm run self-test
```
