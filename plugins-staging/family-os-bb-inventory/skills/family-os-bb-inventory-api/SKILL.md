---
name: family-os-bb-inventory-api
description: Use the narrow Family OS local API wrapper for BB logs, inventory, lightweight tasks, and household memory. This skill is the only live data execution path for the Telegram V2 runtime.
---

# Family OS BB + Inventory + Task + Household Memory API

Use this skill only with `$family-os-bb-inventory`.

## Allowed Actions

- `health`
- `get_inventory_snapshot`
- `get_low_stock_items`
- `record_inventory_purchase_batch`
- `record_inventory_consume_batch`
- `upsert_inventory_item`
- `set_inventory_stock_level`
- `update_inventory_expiry_date`
- `get_recent_baby_logs`
- `append_baby_log`
- `query_bb_calendar_events`
- `append_bb_calendar_event`
- `append_task`
- `update_task`
- `query_tasks`
- `get_upcoming_tasks`
- `get_overdue_tasks`
- `append_household_memory`
- `query_household_memory`

Do not use any other Family OS API action from this Telegram runtime.

## Wrapper

On Windows, call:

```powershell
.\plugins-staging\family-os-bb-inventory\skills\family-os-bb-inventory-api\scripts\invoke_family_os_bb_inventory_api.cmd <action> --payload-json "<json>" --request-text "<original user request>"
```

Use the smallest action that safely answers the current Telegram request.

## Payload Shapes

Use these payload shapes when you return `status=execute` from the primary skill.

### Inventory consume batch

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "record_inventory_consume_batch",
      "--payload-json",
      "{\"items\":[{\"item_name\":\"雞蛋\",\"quantity\":1,\"unit\":\"隻\"}]}",
      "--request-text",
      "我要記錄食咗 1 隻雞蛋"
    ]
  }
}
```

### Inventory purchase batch

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "record_inventory_purchase_batch",
      "--payload-json",
      "{\"items\":[{\"item_name\":\"奶粉\",\"quantity\":2,\"unit\":\"罐\",\"category\":\"baby_feeding\"}]}",
      "--request-text",
      "買咗 2 罐奶粉"
    ]
  }
}
```

### Set current stock level

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "set_inventory_stock_level",
      "--payload-json",
      "{\"item_name\":\"奶粉\",\"quantity_on_hand\":4,\"unit\":\"罐\"}",
      "--request-text",
      "奶粉而家仲有 4 罐"
    ]
  }
}
```

### Set inventory safety stock

Use this when the user wants to set the minimum / safety stock for one clearly identified existing inventory item. This updates `safety_stock`; it does not change current `quantity_on_hand`.

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "upsert_inventory_item",
      "--payload-json",
      "{\"item_name\":\"白胡椒粉\",\"safety_stock\":1,\"remarks\":\"Updated safety stock through Telegram inventory flow.\"}",
      "--request-text",
      "幫我設定返白胡椒嘅安全，存量係一樽"
    ]
  }
}
```

### Update inventory expiry date

Use this when the user is not adding more stock, but is only correcting or filling in the expiry date for an existing inventory item or the most recent purchase they just logged.

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "update_inventory_expiry_date",
      "--payload-json",
      "{\"item_name\":\"皇家美素力水奶\",\"next_expiry_date\":\"2026-12-02\"}",
      "--request-text",
      "幫我記低埋佢哋係2026年12月2號到期"
    ]
  }
}
```

### Append baby log

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "append_baby_log",
      "--payload-json",
      "{\"log_type\":\"feeding\",\"log_subtype\":\"milk\",\"value_number\":90,\"unit\":\"ml\"}",
      "--request-text",
      "BB 飲咗 90 ml 奶"
    ]
  }
}
```

For note-like BB log types such as `vaccination`, `clinic_visit`, `doctor_visit`, and `note`, put the meaningful user detail in `description`.

Example:

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "append_baby_log",
      "--payload-json",
      "{\"log_type\":\"vaccination\",\"description\":\"MMR\"}",
      "--request-text",
      "BB 今日打咗針 MMR"
    ]
  }
}
```

### Append BB calendar event

Use this for future BB appointments such as vaccination, clinic follow-up, doctor visit, checkup, or prenatal check. The Apps Script API writes to the configured Google Calendar and links the event back to a Family OS task by default.

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "append_bb_calendar_event",
      "--payload-json",
      "{\"event_type\":\"vaccination\",\"title\":\"BB 打針\",\"start_at\":\"2026-08-20 10:30:00+08:00\",\"duration_minutes\":60,\"location\":\"診所\",\"description\":\"六合一疫苗\",\"related_person_id\":\"per_baby\"}",
      "--request-text",
      "幫 BB 記低 8 月 20 日 10:30 去診所打六合一"
    ]
  }
}
```

### Query BB calendar events

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "query_bb_calendar_events",
      "--payload-json",
      "{\"days\":180,\"query_text\":\"打針\",\"limit\":10}",
      "--request-text",
      "BB 下次幾時打針？"
    ]
  }
}
```

### Append task

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "append_task",
      "--payload-json",
      "{\"category\":\"medical\",\"task_name\":\"媽媽產檢\",\"due_at\":\"2026-06-20 14:30:00+08:00\",\"priority\":\"medium\",\"status\":\"open\"}",
      "--request-text",
      "記低媽媽 2026-06-20 14:30 產檢"
    ]
  }
}
```

### Query upcoming tasks

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "get_upcoming_tasks",
      "--payload-json",
      "{\"days\":30}",
      "--request-text",
      "未來一個月有咩要做"
    ]
  }
}
```

### Update task

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "update_task",
      "--payload-json",
      "{\"task_id\":\"tsk_123\",\"patch\":{\"due_at\":\"2026-06-10 11:45:00+08:00\"}}",
      "--request-text",
      "改返做 6月10號 11:45"
    ]
  }
}
```

### Query tasks by day window

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "query_tasks",
      "--payload-json",
      "{\"status\":\"open\",\"from\":\"2026-06-09 00:00:00+08:00\",\"to\":\"2026-06-09 23:59:59+08:00\"}",
      "--request-text",
      "幫我睇 6月9號 嗰日有咩 task"
    ]
  }
}
```

### Append household memory

Use this when the user wants the bot to remember a durable item location, household fact, or household preference.

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "append_household_memory",
      "--payload-json",
      "{\"memory_type\":\"item_location\",\"subject\":\"成長椅工具\",\"value_text\":\"放咗喺工具箱\",\"location\":\"工具箱\",\"status\":\"active\",\"confidence\":\"confirmed\",\"remarks\":\"Recorded through Telegram household memory flow.\"}",
      "--request-text",
      "幫我記住成長椅工具放咗喺工具箱"
    ]
  }
}
```

### Query household memory

Use this when the user asks where an item is stored or asks for a previously recorded household fact or preference.

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "bb_inventory_api",
    "argv": [
      "query_household_memory",
      "--payload-json",
      "{\"memory_type\":\"item_location\",\"subject\":\"成長椅工具\",\"query_text\":\"成長椅工具喺邊\",\"limit\":10}",
      "--request-text",
      "成長椅工具喺邊"
    ]
  }
}
```

## Rules

- Do not read or write Google Sheets directly in the Telegram runtime
- Do not call broad household actions
- Preserve the original Telegram user request in `--request-text`
- Preserve the inventory item's canonical stored unit in write payloads whenever the primary skill has already confirmed a safe unit alignment
- For safety stock / minimum stock requests, use `upsert_inventory_item` with `safety_stock` after the existing item is clear. Do not use `set_inventory_stock_level`, which only changes current stock.
- For tasks, prefer `append_task` for new reminders / plans, `update_task` only when the target task is already clearly identified, and `query_tasks` / `get_upcoming_tasks` / `get_overdue_tasks` for reads
- For future BB appointments, prefer `append_bb_calendar_event` over `append_task`; the API creates a linked task by default for reminders
- For BB appointment queries, use `query_bb_calendar_events`; use `append_baby_log` only for events that already happened
- For task identification reads, prefer supported filters and date windows. Do not depend on a free-text `query` field.
- If the wrapper fails or the action is unsupported, return control to the primary skill so it can reply with `desktop_required` or a temporary-unavailable message
