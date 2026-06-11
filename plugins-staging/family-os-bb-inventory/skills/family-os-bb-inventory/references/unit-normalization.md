# Unit Normalization

Use the LLM as the final gatekeeper for colloquial Cantonese unit wording.

## Goal

Before an inventory write, compare:

- the user-spoken unit
- the matched inventory item's canonical stored unit
- any learned item-specific unit convention

Then decide whether it is safe to align automatically or whether you must ask a follow-up.

## Preflight Helper

When a user message uses a colloquial or potentially ambiguous unit, run:

```json
{
  "status": "execute",
  "reply_text": "",
  "clarification": null,
  "command_request": {
    "command_id": "inventory_unit_preflight",
    "argv": [
      "preflight",
      "--payload-json",
      "{\"item_name\":\"公仔麵\",\"spoken_unit\":\"個\",\"quantity\":1,\"intent\":\"consume\"}",
      "--request-text",
      "啱啱食咗個公仔麵"
    ]
  }
}
```

The helper returns:

- the matched existing item, if any
- the canonical stored unit
- candidate items when the name is ambiguous
- learned unit conventions from runtime knowledge
- a unit assessment status for the LLM to interpret

## Decision Rules

- If `unit_assessment.status = aligned`, write directly.
- If `unit_assessment.status = safe_by_learning`, write using `recommended_canonical_unit`.
- If `unit_assessment.status = llm_gatekeeper_review`, use the item meaning and Cantonese context to decide whether the colloquial wording safely points to one canonical inventory unit.
- If `unit_assessment.status = ask_user`, return a clarification.
- If the helper cannot select one item confidently, clarify the item first.

## Safe Auto-Alignment Examples

These are examples of meaning-preserving retail-item wording, not hardcoded rules:

- `一個公仔麵` can safely mean `1 包公仔麵` when the matched inventory item is stored as `pack`
- `一個乳酪` can safely mean `1 杯乳酪` when the matched inventory item is stored as `cup`

Only auto-align when:

- there is one clear matched item
- the user is clearly referring to one retail item, not a sub-piece inside a larger container
- there is no competing packaging meaning in current inventory

## Ask-First Examples

Ask before writing when:

- `一盒` vs `一包` would change the actual quantity meaning
- the item could refer to multiple packaging sizes
- the spoken unit conflicts with existing inventory in a way that is not obviously colloquial
- the user might mean a remaining-stock update instead of a consume/restock event

## Learned Convention Shape

When the user teaches a reusable unit convention, store it through the learning helper as an inventory `convention`.

Recommended `normalized_rule` shape:

```json
{
  "key": "inventory.convention.instant_noodles_piece_means_pack",
  "item_name": "公仔麵",
  "spoken_unit": "個",
  "canonical_unit": "包",
  "statement": "Treat one colloquial 公仔麵 as one retail pack.",
  "conflict_group": "inventory.unit_meaning.instant_noodles"
}
```
