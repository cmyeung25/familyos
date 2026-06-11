# Consumable Workflows

Use these rules for household consumables across `inventory_items`, `inventory_movements`, `baby_log`, and `tasks`.

## Core Model

- `inventory_items` is the item master and current restock status source.
- `inventory_movements` is the stock history. Purchases add stock; consumption, discard, and adjustment out reduce stock.
- `tasks` is for reminders and shopping actions such as "buy tomorrow".
- `baby_log` records baby care events. Some events may also consume inventory.

Do not manually set formula fields such as `quantity_on_hand`, `is_low_stock`, `is_expiring_soon`, or `needs_restock`. They are derived from item settings and movements.

## Restock Reminders

For a message like `沐浴露要補貨，提我聽日買`:

- Create an `append_task` shopping/restock reminder.
- If the item already exists in `inventory_items`, set `related_item_id` when certain.
- If the item does not exist, keep the item name in `task_name`, `description`, and `remarks`.
- Do not create an inventory movement unless the user says the item was actually bought, used, discarded, or adjusted.
- Do not invent an `inventory_items` master row from Telegram unless the user has provided enough item-master settings: category, tracking unit, and restock threshold.

For "超市有咩要買" or similar shopping-list questions, combine:

- `get_low_stock_items` / dashboard low-stock items
- upcoming open shopping/restock tasks from `get_dashboard_snapshot` or task queries

## Purchases

For purchase messages, write `inventory_movements` through `record_inventory_purchase_batch`.

Before creating or updating any inventory item, compare the spoken name with existing live inventory names. Reuse only an exact stored name automatically. If the spoken name is generic, alias-like, or there are several plausible matches, ask the user which exact stored name to use.

Examples:

- `買咗 1 pack 尿片`
  - Ask how many pieces per pack and the diaper size/stage.
  - After clarification such as `20片 M碼`, record `quantity = 20`, `unit = piece`, item `尿片`.
- `買咗 3 樽洗潔精`
  - If tracked by bottle, record `quantity = 3`, `unit = bottle`.
  - For items whose remaining stock is interpreted as part of one bottle, keep the live unit as `bottle` and store fractional bottle quantities such as `0.2`.

## Baby Diaper Changes

For `幫BB換片`:

- Require whether the diaper had pee, stool, both, or was dry.
- Write one `append_baby_log` diaper event.
- Also consume one diaper from inventory: item `itm_diaper`, unit `piece`, quantity `1`.
- If the inventory deduction fails, keep the baby log and report the inventory sync failure.

## Fractional-Container Consumables

Some liquid consumables are better tracked as the remaining fraction of one bottle, such as:

- 洗潔精
- 漂白水
- 洗衣液
- 沐浴露
- 洗頭水

For these items, configure the item master through `upsert_inventory_item`:

- unit: `bottle`
- safety_stock: the restock trigger bottle fraction, for example `0.2`
- remarks: how to interpret purchases and remaining fraction

Example policy:

- `洗潔精剩返20%` means call `set_inventory_stock_level` with `unit=bottle` and `quantity_on_hand=0.2`.
- `買咗1樽洗潔精` means add `quantity = 1`, `unit = bottle`.

If the unit/threshold has not been configured, ask whether to configure it with `unit=bottle` and a restock threshold such as `0.2`.

Legacy `unit=percent` rows may still exist. When cleaning them up, convert:

- current remaining percent to its fractional bottle quantity, for example `10% -> 0.1 bottle`
- restock threshold percent to the matching bottle fraction, for example `20% -> 0.2 bottle`

## API Actions

- `upsert_inventory_item`: create or update the item master, including `unit=bottle` and fractional `safety_stock`.
- `set_inventory_stock_level`: append an inventory adjustment so current stock becomes the reported fraction or quantity.

Do not directly write formula fields. The workbook computes `quantity_on_hand`, `is_low_stock`, and `needs_restock`.
