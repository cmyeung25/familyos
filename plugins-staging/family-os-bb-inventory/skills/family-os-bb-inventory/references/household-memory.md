# Household Memory

Use household memory for durable information the household will want to retrieve later.

## In Scope

- where an item is stored
- a stable household fact
- an explicit user preference
- looking up a previously stored memory

## Not The Same As Tasks

Use `append_task` only when the user wants something time-based or action-based.

Examples that should stay as household memory:

- `幫我記住成長椅工具放咗喺工具箱`
- `記住工人姐姐逢星期日休息`
- `記住太太鍾意呢隻牌子紙巾`

Examples that should become tasks:

- `15 分鐘後提太太飲水`
- `下星期提醒我續保`

## Recommended Mapping

### `memory_type=item_location`

Use when the user is saying where a physical thing is placed.

Preferred fields:

- `subject`: the thing
- `location`: the place
- `value_text`: short factual note such as `放咗喺工具箱`
- `status=active`

### `memory_type=fact`

Use for reusable household facts that are not mainly preferences.

Examples:

- helper day-off arrangement
- where a document is usually kept if no precise storage location field fits
- a stable arrangement or rule the family wants recalled

### `memory_type=preference`

Use only when the user clearly states a preference.

Examples:

- preferred tissue brand
- preferred diaper size or variant
- usual shopping preference for a household member

## Query Guidance

When the user asks where something is, search household memory first by:

1. `subject`
2. `location`
3. broad `query_text`

If there are several likely matches, ask one short clarification.

## Write Safety

- do not invent a location or preference
- if the stored target object is unclear, ask before writing
- do not silently overwrite an earlier memory in v1; just append the new memory record
- if the user sounds like they are correcting a very recent memory write, keep that recent target in mind

## Dobby Intelligence v1 Direct Path

The bridge may directly handle clear item-location save/query phrasing before the LLM turn.

Examples:

- `幫我記住成長椅嘅工具放咗喺工具箱`
- `成長椅嘅工具喺邊`

The direct path only covers clear item locations. Facts, preferences, corrections, and ambiguous memory requests should still be handled through this skill and the `append_household_memory` / `query_household_memory` helper actions.
