# Self-Enhance Policy

## Persistable Learning Types

- `alias`
- `vocabulary`
- `convention`
- `principle`

## Learning Rules

- persist only reusable BB, inventory, and task knowledge
- keep the original `source_text`
- normalize the reusable rule into a compact machine-readable structure
- include `normalized_rule.key` and `normalized_rule.statement`
- include `normalized_rule.conflict_group` for principles so opposite principles can be challenged immediately
- mark active learnings with `status = active`
- use `plugins-staging/family-os-bb-inventory/skills/family-os-bb-inventory/scripts/manage_runtime_learning.mjs` instead of editing runtime JSON files by hand

## Conflicts

If a new teaching conflicts with an active principle:

1. call the runtime helper so it appends a pending conflict record to `plugins-staging/family-os-bb-inventory/runtime/learning-conflicts.json`
2. leave active knowledge unchanged
3. ask an immediate clarification question

## Non-Persistable Inputs

- one-off corrections for a single turn
- schema or API changes
- bridge behavior
- security or audit policy
- finance, property, caregiver, documents, dashboard, or other out-of-scope domains

## Suggested Payload Shape

```json
{
  "domain": "inventory",
  "kind": "alias",
  "source_text": "盒紙巾即係抽取式紙巾",
  "normalized_rule": {
    "key": "inventory.alias.box_tissue",
    "statement": "Treat 盒紙巾 as the boxed tissue item."
  },
  "learned_from": "telegram"
}
```

For principles, prefer a stable `conflict_group`, for example:

```json
{
  "domain": "inventory",
  "kind": "principle",
  "source_text": "如果用戶講而家仲剩幾多，就優先當成 set-level",
  "normalized_rule": {
    "key": "inventory.principle.explicit_remaining_stock_prefers_set_level",
    "conflict_group": "inventory.remaining_stock_interpretation",
    "statement": "Treat explicit remaining stock statements as set current stock level first."
  },
  "learned_from": "telegram"
}
```

If the helper reports `status = conflict`, return a clarification instead of pretending the new principle is already active.

For item-specific unit conventions, prefer a structure like:

```json
{
  "domain": "inventory",
  "kind": "convention",
  "source_text": "公仔麵講一個通常即係一包",
  "normalized_rule": {
    "key": "inventory.convention.instant_noodles_piece_means_pack",
    "item_name": "公仔麵",
    "spoken_unit": "個",
    "canonical_unit": "包",
    "statement": "Treat one colloquial 公仔麵 as one retail pack.",
    "conflict_group": "inventory.unit_meaning.instant_noodles"
  },
  "learned_from": "telegram"
}
```
