# Family OS Inventory Schema v2

## Goal

Solve three problems in the current inventory model:

1. `category` is carrying too much meaning at once.
2. Brand-specific stock and same-product multi-brand handling are not modeled cleanly.
3. Telegram natural-language control needs a stable structure for:
   - total stock questions
   - brand-specific questions
   - safer deductions and restock prompts

This v2 keeps daily use simple while leaving room for stricter stock tracking later.

## Current Problem

The current `inventory_items.category` mixes:

- product type, for example `personal_care`, `household_cleaning`, `groceries`
- use case, for example `baby_diaper`, `baby_feeding`

That makes the category list unstable. If we keep extending it, we end up with mixed values such as:

- `personal_care`
- `baby_diaper`
- `bb_personal_care`
- `bb_household_cleaning`

This is workable short-term, but it becomes harder to query, infer, and maintain.

## Recommended Model

Use separate concepts for separate questions.

### 1. Canonical Item

This is the main thing the household is managing.

Examples:

- `濕紙巾`
- `BB口腔清潔棉`
- `沐浴露`
- `pat pat 膏`

The canonical item is what Telegram should default to when the user asks broad questions such as:

- `屋企仲有幾多濕紙巾？`
- `沐浴露要唔要補貨？`

### 2. Product Category

`category` should describe the product family only.

Recommended categories:

- `baby_consumable`
- `personal_care`
- `household_cleaning`
- `groceries`
- `medicine`
- `pet_food`
- `pet_litter`
- `other`

Notes:

- `baby_diaper` and `baby_feeding` should not stay as top-level category forever.
- They are better represented by a separate grouping field.

### 3. Target Group

Add a second field for who the item is mainly for.

Recommended values:

- `baby`
- `family`
- `shared`
- `mother`
- `helper`
- `pet`
- `other`

Examples:

- `BB洗衣液` = `household_cleaning` + `baby`
- `mustela crema change` = `personal_care` + `baby`
- `沐浴露` = `personal_care` + `family`

This removes pressure from `category`.

### 4. Brand Preference

Keep a brand field on the canonical item.

Recommended meaning:

- `preferred_brand` = the normal or preferred brand for this item class

Examples:

- `BB口腔清潔棉`
  - `preferred_brand = NUK`
- `pat pat 膏`
  - `preferred_brand = Mustela`

This is useful for shopping and restock suggestions, but it is not enough to track parallel brand stock by itself.

## Stock Structure

There are two levels worth modeling.

### Level A: Canonical Item Total

This is the default live household stock.

Example:

- `乳酪`
  - total stock = `4 cup`

Telegram should answer this by default unless the user explicitly asks for a brand.

### Level B: Brand / Variant / Lot

This is optional but recommended for v2 if you often have more than one brand of the same product.

Suggested child table:

- `inventory_item_variants`

Suggested fields:

- `variant_id`
- `household_id`
- `parent_item_id`
- `brand`
- `variant_name`
- `unit`
- `quantity_on_hand`
- `next_expiry_date`
- `status`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`
- `remarks`

Meaning:

- `inventory_items` remains the canonical parent
- `inventory_item_variants` stores brand-level stock when needed

Examples:

- parent item: `BB口腔清潔棉`
  - variant: `NUK BB口腔清潔棉`
  - variant: `Pigeon BB口腔清潔棉`

- parent item: `pat pat 膏`
  - variant: `Mustela crema change`
  - variant: `Weleda baby pat pat膏`

## Recommended Phasing

### v2.1

Minimal change with high benefit.

Keep:

- `inventory_items`
- `inventory_movements`

Add fields to `inventory_items`:

- `target_group`
- `canonical_name` only if different from `item_name`, otherwise skip this and treat `item_name` as canonical
- use `preferred_brand` properly

Behavior:

- default stock is still tracked at item level
- same-product different-brand handling is conversational, not strict
- Telegram can ask whether a new brand should be merged into an existing canonical item

### v2.2

Proper multi-brand inventory.

Add:

- `inventory_item_variants`

Behavior:

- item-level total can be derived from active variants
- Telegram can answer both:
  - `屋企仲有幾多 BB口腔清潔棉？`
  - `仲有幾多包 NUK BB口腔清潔棉？`

### v2.3

Optional batch or expiry-level tracking.

Add:

- `inventory_item_lots`

This is only worth doing if you truly care about:

- multiple expiry dates under one brand
- FIFO deduction
- freezer / pantry / cabinet specific stock

For Family OS daily household use, this is optional.

## Telegram Behavior Rules

### Default Query Rule

If the user asks a broad question:

- answer canonical total first

Example:

- `屋企仲有幾多乳酪？`
- reply: `而家仲有 4 杯乳酪。`

### Brand-Specific Query Rule

If the user names a brand:

- answer the matching variant if variant tracking exists
- otherwise answer with the canonical total and state that brand-level stock is not separated yet

Example:

- `仲有幾多包 NUK BB口腔清潔棉？`

### Purchase Rule

If the user buys a same-type item with a different brand:

- first check whether it belongs under an existing canonical item
- ask one short question only if needed

Preferred clarification:

- `呢個想記落「BB口腔清潔棉」底下，brand 當 NUK，定係想開一個獨立新項目？`

Do not ask for an exact stored name too early.

### Consume Rule

If the user consumes a generic name:

- deduct canonical stock by default
- if multiple variants exist and the choice matters, suggest likely variants

Preferred clarification:

- `我見到你屋企而家有 NUK 同 Pigeon 兩款 BB口腔清潔棉。你今次想扣邊款？`

### Restock Rule

Restock should normally be driven at canonical item level.

Reason:

- the household usually wants to know what class of thing is low
- not every shopping run depends on brand-specific exact stock

Brand should influence:

- preferred shopping suggestion
- default purchase assumption

## Recommendation For Your Household

For your use case, the best next move is:

1. Stop overloading `category`
2. Add `target_group`
3. Keep canonical item names as the default inventory unit of conversation
4. Use `preferred_brand` properly right away
5. Add `inventory_item_variants` only when you are ready for true multi-brand stock

## Concrete Recommendation

Do this first:

- keep `category` broad
- add `target_group`
- define canonical items for repeated household things
- use `preferred_brand` for shopping preference

Do not do this first:

- keep inventing more hybrid categories such as `bb_personal_care`
- encode brand into every `item_name` and rely on LLM guessing forever

## Proposed Category Set

Use:

- `baby_consumable`
- `personal_care`
- `household_cleaning`
- `groceries`
- `medicine`
- `pet_food`
- `pet_litter`
- `other`

And pair it with:

- `baby`
- `family`
- `shared`
- `mother`
- `helper`
- `pet`
- `other`

## Migration Notes

Existing rows can be migrated with simple mapping.

Examples:

- `baby_diaper` -> `category=baby_consumable`, `target_group=baby`
- `baby_feeding` -> `category=baby_consumable`, `target_group=baby`
- `personal_care` baby products -> keep `personal_care`, set `target_group=baby`
- `household_cleaning` baby-specific cleaners -> keep `household_cleaning`, set `target_group=baby`

## Next Build Order

1. Add `target_group` to schema and API
2. Define a canonical inventory naming rule
3. Start using `preferred_brand` consistently
4. Add variant table only when you want true per-brand stock totals
