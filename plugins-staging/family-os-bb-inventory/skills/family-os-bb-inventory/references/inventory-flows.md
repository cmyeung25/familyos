# Inventory Flows

## Snapshot Queries

- current inventory -> `get_inventory_snapshot`
- low-stock only -> `get_low_stock_items`

## Restock

- use `record_inventory_purchase_batch`
- if the item is clearly new, bootstrap with `upsert_inventory_item` first when needed
- when returning `status=execute`, send the payload as `{"items":[...]}`, not a bare array

## Consume

- use `record_inventory_consume_batch`
- only for clearly known existing items with a matching unit
- if the spoken unit is colloquial or could differ from the stored canonical unit, run `inventory_unit_preflight` first
- when returning `status=execute`, send the payload as `{"items":[...]}`, not a bare array
- after a successful consume write, if the execution result includes `quantity_on_hand`, mention the remaining stock in the final user-facing reply

## Set Current Stock

- use `set_inventory_stock_level`
- prefer this when the user states remaining stock directly, for example `仲有 4 杯`

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
