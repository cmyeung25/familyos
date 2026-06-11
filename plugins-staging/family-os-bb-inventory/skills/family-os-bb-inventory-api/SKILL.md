---
name: family-os-bb-inventory-api
description: Use the narrow Family OS local API wrapper for BB logs, inventory, and lightweight tasks. This skill is the only live data execution path for the Telegram V2 runtime.
---

# Family OS BB + Inventory + Task API

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
- `append_task`
- `update_task`
- `query_tasks`
- `get_upcoming_tasks`
- `get_overdue_tasks`

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

## Rules

- Do not read or write Google Sheets directly in the Telegram runtime
- Do not call broad household actions
- Preserve the original Telegram user request in `--request-text`
- Preserve the inventory item's canonical stored unit in write payloads whenever the primary skill has already confirmed a safe unit alignment
- For tasks, prefer `append_task` for new reminders / plans, `update_task` only when the target task is already clearly identified, and `query_tasks` / `get_upcoming_tasks` / `get_overdue_tasks` for reads
- For task identification reads, prefer supported filters and date windows. Do not depend on a free-text `query` field.
- If the wrapper fails or the action is unsupported, return control to the primary skill so it can reply with `desktop_required` or a temporary-unavailable message
