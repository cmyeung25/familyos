# Inventory Flows

## Snapshot Queries

- current inventory -> `get_inventory_snapshot`
- low-stock only -> `get_low_stock_items`

## Restock

- use `record_inventory_purchase_batch`
- if the item is clearly new, bootstrap with `upsert_inventory_item` first when needed
- when returning `status=execute`, send the payload as `{"items":[...]}`, not a bare array
- Clear existing-item single restock requests such as `買左一包糖`, `糖買左一包`, or `啱啱買返一支牛奶啦` should be written directly as one `record_inventory_purchase_batch` item.
- for batch restock, do not write any subset if one item is still ambiguous; ask first, then write the whole resolved batch after the clarification
- if the user clarifies that an ambiguous phrase refers to two existing inventory records, include both records in the same batch write

## Consume

- use `record_inventory_consume_batch`
- only for clearly known existing items with a matching unit
- if the spoken unit is colloquial or could differ from the stored canonical unit, run `inventory_unit_preflight` first
- when returning `status=execute`, send the payload as `{"items":[...]}`, not a bare array
- after a successful consume write, if the execution result includes `quantity_on_hand`, mention the remaining stock in the final user-facing reply
- Clear multi-item consume requests such as `食咗一個公仔麵，同一隻雞蛋` should be written in one `record_inventory_consume_batch` payload, not split across turns and not routed as a new-item add.
- If a clear multi-item consume request has one ambiguous item, such as `食咗一個公仔麵，同一隻蛋`, ask which item `蛋` means and resume the whole batch after clarification. Do not write only the clarified item and do not ask the user to repeat the whole request.

## Set Current Stock

- use `set_inventory_stock_level`
- prefer this when the user states remaining stock directly, for example `仲有 4 杯`

## Set Safety Stock

- use `upsert_inventory_item` to update `safety_stock` on one clearly identified existing inventory item
- treat wording such as `安全存量`, `安全，存量`, `最低存量`, `minimum stock`, or `補貨線` as safety-stock intent
- do not use `set_inventory_stock_level`; that action is only for current `quantity_on_hand`
- do not create a new item from a safety-stock-only request; if the item is unknown or ambiguous, ask which existing item first
- if the user gives a unit, preserve the existing canonical unit and use the number as the safety stock in that unit
- the bridge may directly handle clear existing-item safety-stock updates through Dobby Intelligence v1 before the LLM turn

## Update Expiry Date

- use `update_inventory_expiry_date`
- prefer this when the user is only correcting or filling in an expiry date for an existing inventory item
- if the user just finished a recent restock and then says `幫我記低埋佢哋係...到期`, treat that as the same inventory target when the transcript context is still unique
- do not repeat `record_inventory_purchase_batch` just to add an expiry date afterward

## New Item Bootstrap

- use `upsert_inventory_item`
- then either `set_inventory_stock_level` or `record_inventory_purchase_batch`
- if the proposed new item is only similar to an existing item but not an exact name match, do not silently reuse the old item master
- for near-identical spec names such as `AA電芯` versus `AAA電芯`, treat them as separate items unless the user explicitly says they are the same item

## Matching Rules

- do not silently map one spoken item name to one of several plausible existing items
- ask before writing when the unit is ambiguous or mismatched
- use the canonical stored unit from preflight when the LLM judges that the spoken Cantonese unit still clearly refers to one retail item
- if the wording already looks ambiguous, ask first instead of running a broad exploratory turn
- when the user supplies a category in Cantonese such as `家居用品`, `個人護理`, or `乾貨`, normalize it to the closest canonical inventory category before deciding whether another clarification is still needed

## Clarify-First Example

For a message like `食咗1隻蛋`, if more than one plausible inventory item could match, return a clarification with likely choices instead of trying to guess or continuing a long search.

After the user picks `雞蛋`, the follow-up execute envelope should look like:

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
