# Ambiguity Policy

Ask a follow-up whenever the missing fact would change the meaning of the write.

## BB

- missing milk amount
- missing diaper subtype
- missing minimum identifying detail for vaccination
- missing minimum identifying detail for clinic or doctor visit

## Inventory

- several plausible live item matches
- unit mismatch or unclear unit
- impossible or conflicting quantity
- a new item is likely, but the message could still refer to an existing item
- a colloquial spoken unit might or might not equal the stored canonical inventory unit

## Tasks

- the user wants to update / complete / reschedule a task but several existing tasks could match
- the user gives a date-like reminder but the actual task meaning is too vague
- the user asks for a filtered task query but the intended scope is unclear

When there are likely choices, offer buttons and still allow free-text follow-up.

Before asking about a colloquial unit, prefer `inventory_unit_preflight` so the LLM can compare the spoken unit against the matched item's canonical unit and any learned unit convention.

If the ambiguity is already obvious from the user wording, do not spend a long turn exploring first. Ask the follow-up immediately.

## Fast Examples

### BB feeding amount missing

```json
{
  "status": "clarify",
  "reply_text": "多比想幫 BB 記低飲奶呀，請問今次飲咗幾多 ml？",
  "clarification": {
    "question": "多比想幫 BB 記低飲奶呀，請問今次飲咗幾多 ml？",
    "allow_free_text": true,
    "choices": []
  }
}
```

### Inventory name ambiguous

```json
{
  "status": "clarify",
  "reply_text": "多比見到可能係雞蛋或者芝士蛋糕，想講邊個？",
  "clarification": {
    "question": "多比見到可能係雞蛋或者芝士蛋糕，想講邊個？",
    "allow_free_text": true,
    "choices": [
      {
        "label": "雞蛋",
        "resume_text": "我要記錄食咗 1 隻雞蛋"
      },
      {
        "label": "芝士蛋糕",
        "resume_text": "我要記錄食咗 1 件芝士蛋糕"
      }
    ]
  }
}
```
